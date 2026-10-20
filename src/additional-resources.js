import { NVIDIA_PROFILES, NVIDIA_SOURCES } from './additional-gpus.js';

const fmt = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const quantity = (n, unit = '个') => n == null ? '未核实' : `${fmt(n)} ${unit}`;
const titles = { package: '封装总览', die: '芯片架构', sm: 'SM 微架构', shared: '共享内存', registers: '寄存器文件', warp: 'Warp 执行流水线' };

export function getNvidiaResourceTotals(id) {
  const gpu = NVIDIA_PROFILES[id];
  if (!gpu) return null;
  const n = gpu.activeSMs, m = gpu.smLimits;
  return {
    smCount: n, fp32: gpu.cudaCores, tensor: gpu.tensorCores, rt: gpu.rtCores,
    schedulers: n * 4, partitions: n * 4, dispatch: n * 4,
    registers: n * m.registers, registerBytes: n * m.registers * 4,
    sharedKiB: n * m.sharedKiB, unifiedKiB: n * m.unifiedKiB, sharedBanks: n * 32,
    warps: n * m.warps, threads: n * m.threads, blocks: n * m.blocks
  };
}

export function getNvidiaResourceReport(id, requestedLevel = 'package') {
  const gpu = NVIDIA_PROFILES[id];
  if (!gpu) return null;
  const level = Object.hasOwn(titles, requestedLevel) ? requestedLevel : 'package';
  const t = getNvidiaResourceTotals(id), m = gpu.smLimits, n = t.smCount;
  const sources = NVIDIA_SOURCES[id], product = sources[0], architecture = sources[1], programming = sources[3];
  const countSource = id === 'rtx-6000d' ? sources[5] : id === 'a100' ? architecture : product;
  const l2Source = gpu.l2MB == null ? null : sources[gpu.l2Source || 1];
  const l2Status = gpu.l2MB == null ? 'unknown' : gpu.l2Status || 'verified';
  const derivedSource = { ...architecture, related: [countSource] };
  const architectureLimits = { ...programming, related: [countSource] };
  const isRtx = gpu.family === 'blackwell', isA100 = id === 'a100';
  const coreStatus = id === 'rtx-6000d' ? 'derived' : 'verified';
  const tensorStatus = ['rtx-pro-5000', 'rtx-6000d'].includes(id) ? 'derived' : 'verified';
  const metric = (id, label, value, unit, detail, status = 'reference', component, source = programming) => ({
    id, label, value: value == null ? '未核实' : typeof value === 'number' ? fmt(value) : value,
    unit: value == null ? '' : unit, detail, status: value == null ? 'unknown' : status, component, source
  });
  const row = (id, label, local, total, basis, status = 'reference', source = programming, component) => ({ id, label, local, total, basis, status, source, component });
  const totalMetric = (id, label, value, unit, perSM, component, source = architectureLimits) => metric(id, label, value, unit, `${n} SM × ${fmt(perSM)} / SM；分布式资源汇总`, 'derived', component, source);
  const capacity = (value, label, id, component) => metric(id, label, value, 'KiB / SM', `CC ${gpu.computeCapability} 架构上限`, 'reference', component);
  const miB = kiB => `${fmt(kiB / 1024)} MiB`;
  const local = (v, unit = '个') => `${quantity(v, unit)} / SM`;
  const unknown = (id, label, detail, component) => metric(id, label, null, '', detail, 'unknown', component, null);
  const gpuCards = [
    metric('sm', '启用 SM', n, '个', id === 'rtx-6000d' ? 'Geekbench 原始样本配置' : gpu.smCountStatus === 'derived' ? `${fmt(gpu.cudaCores)} CUDA ÷ ${gpu.smFp32} / SM` : '对应产品的启用计算单元', gpu.smCountStatus, 'sm', countSource),
    metric('fp32', 'FP32 CUDA Core', t.fp32, '个', `${n} SM × ${gpu.smFp32} / SM`, coreStatus, 'cuda', id === 'rtx-6000d' ? derivedSource : product),
    metric('tensor', `第 ${gpu.tensorGeneration} 代 Tensor Core`, t.tensor, '个', `${n} SM × 4 / SM`, tensorStatus, 'tensor', tensorStatus === 'derived' ? derivedSource : isA100 ? architecture : product),
    metric('rt', 'RT 光线追踪核心', t.rt, '个', t.rt ? `第 ${gpu.rtGeneration} 代 · 1 / SM` : 'A100 不包含 RT Core', t.rt && tensorStatus === 'derived' ? 'derived' : 'verified', t.rt ? 'rt' : undefined, tensorStatus === 'derived' ? derivedSource : isA100 ? architecture : product),
    metric('hbm', '显存容量', gpu.memoryGB, 'GB', `${gpu.memoryType} · ${gpu.variant}`, 'verified', 'hbm', product),
    metric('l2', 'L2 缓存', gpu.l2MB, 'MB', gpu.l2MB == null ? '未找到该具体版本的可靠直接规格' : l2Status === 'observed' ? '计算中心 A40 实机设备查询' : '全 GPU 共享缓存', l2Status, 'l2', l2Source)
  ];
  const smCards = [
    metric('fp32', 'FP32 CUDA Core', gpu.smFp32, '个 / SM', isA100 ? 'GA100 每 SM 64 FP32' : isRtx ? '与 INT32 共享执行通路' : '部分通路与 INT32 共享', 'reference', 'cuda', architecture),
    metric('tensor', `第 ${gpu.tensorGeneration} 代 Tensor Core`, 4, '个 / SM', '矩阵乘加专用单元', 'reference', 'tensor', architecture),
    capacity(m.sharedKiB, '共享内存上限', 'shared-capacity', 'shared'),
    metric('registers', '32 位寄存器', m.registers, '个 / SM', '总容量 256 KiB，线程私有使用', 'reference', 'registers'),
    metric('schedulers', 'Warp 调度器', 4, '个 / SM', '架构功能分区中的调度单元', 'reference', 'scheduler', architecture),
    metric('warp', '驻留 Warp 上限', m.warps, '个 / SM', `${m.threads} 线程；还受其他资源限制`, 'reference', 'warpPool')
  ];
  const globalSmCards = [gpuCards[1], gpuCards[2],
    metric('shared-capacity', '共享内存总预算', miB(t.sharedKiB), '', `${n} × ${m.sharedKiB} KiB；不可跨 SM 合成一个内存池`, 'derived', 'shared', architectureLimits),
    totalMetric('registers', '32 位寄存器合计', t.registers, '个', m.registers, 'registers'),
    totalMetric('schedulers', 'Warp 调度器合计', t.schedulers, '个', 4, 'scheduler', derivedSource),
    totalMetric('warp', '驻留 Warp 总上限', t.warps, '个', m.warps, 'warpPool')
  ];
  const sharedCards = [capacity(m.sharedKiB, '共享内存上限', 'shared-capacity', 'banks'),
    capacity(m.unifiedKiB, '统一 L1 / shared', 'unified', 'shared'),
    metric('shared-banks', '共享内存 bank', 32, '个 / SM', '32 位连续字映射到连续 bank', 'verified', 'banks', sources[4]),
    metric('word', '映射字大小', 4, '字节', '本实验使用对齐的 32-bit 标量', 'verified', 'address', sources[4]),
    metric('block-shared', '单线程块 shared 上限', m.sharedBlockKiB, 'KiB', '超过 48 KiB 静态配置须显式申请', 'reference', 'barrier'),
    unknown('copy-engines', '异步复制物理通道', '支持异步复制；不假定硬件引擎数量', 'tma')];
  const globalSharedCards = [
    globalSmCards[2],
    metric('unified', '统一 L1 / shared 合计', miB(t.unifiedKiB), '', `${n} × ${m.unifiedKiB} KiB；已包含 shared`, 'derived', 'shared', architectureLimits),
    totalMetric('shared-banks', '共享 bank 合计', t.sharedBanks, '个', 32, 'banks'),
    gpuCards[0], gpuCards[4], gpuCards[5]
  ];
  const registerCards = [
    smCards[3], metric('register-bytes', '寄存器文件容量', 256, 'KiB / SM', '65536 × 32 bit ÷ 8', 'derived', 'registerFile'),
    metric('register-thread', '每线程寄存器上限', 255, '个', '编译器分配的 32 位寄存器', 'reference', 'registerFile'),
    smCards[5], metric('threads', '驻留线程上限', m.threads, '个 / SM', `${m.warps} Warp × 32 线程`, 'reference', 'warpPool'),
    metric('blocks', '驻留线程块上限', m.blocks, '个 / SM', '实际受寄存器、shared、线程数共同限制', 'reference', 'scheduler')
  ];
  const globalRegisterCards = [globalSmCards[3],
    metric('register-bytes', '寄存器容量合计', miB(t.registerBytes / 1024), '', `${n} × 256 KiB；每个 SM 分别分配`, 'derived', 'registerFile', architectureLimits),
    globalSmCards[5], totalMetric('threads', '驻留线程总上限', t.threads, '个', m.threads, 'warpPool'),
    totalMetric('blocks', '驻留线程块总上限', t.blocks, '个', m.blocks, 'scheduler'),
    globalSmCards[4]
  ];
  const warpCards = [smCards[5], registerCards[4], smCards[4],
    metric('dispatch', '发射功能分区', 4, '个 / SM', '架构示意；不表示每周期任意 4 条指令', 'reference', 'dispatch', architecture),
    metric('warp-size', '每 Warp 线程数', 32, '线程', '执行组，不是独立物理核心', 'verified', 'simt'), registerCards[5]];
  const globalWarpCards = [globalSmCards[5], globalRegisterCards[3], globalSmCards[4],
    totalMetric('dispatch', '发射功能分区合计', t.dispatch, '个', 4, 'dispatch', derivedSource),
    warpCards[4], globalRegisterCards[4]];

  const productRows = [
    row('sm', '启用 SM', '1 个 SM', quantity(n), id === 'rtx-6000d' ? '原始测量样本报告 156 Compute Units，按 NVIDIA SM 对应理解' : gpu.smCountStatus === 'derived' ? `${fmt(gpu.cudaCores)} CUDA ÷ ${gpu.smFp32} / SM` : 'A100 架构产品表', gpu.smCountStatus, countSource, 'sm'),
    row('gpc', '启用 GPC', 'GPC → TPC → SM', isA100 ? '7 个' : '未核实', isA100 ? 'A100 白皮书直接列出产品配置' : '不从完整芯片上限或示意方块反推', isA100 ? 'verified' : 'unknown', isA100 ? architecture : null, 'gpc'),
    row('tpc', '启用 TPC', '每完整 TPC 含 2 SM', isA100 ? '54 个' : quantity(n / 2), isA100 ? 'A100 白皮书产品配置' : `${n} SM ÷ 2，按完整 TPC 组织折算`, isA100 ? 'verified' : 'derived', derivedSource, 'gpc'),
    row('fp32', 'FP32 CUDA Core', local(gpu.smFp32), quantity(t.fp32), isRtx ? 'FP32 与 INT32 共用路径，不把二者视为两套独立核心相加' : isA100 ? 'GA100 每 SM 64 FP32' : 'GA102 每 SM 128 FP32，部分与 INT32 共享', coreStatus, id === 'rtx-6000d' ? derivedSource : isA100 ? architecture : product, 'cuda'),
    row('tensor', `第 ${gpu.tensorGeneration} 代 Tensor Core`, local(4), quantity(t.tensor), `${n} SM × 4 / SM`, tensorStatus, tensorStatus === 'derived' ? derivedSource : isA100 ? architecture : product, 'tensor'),
    row('rt', 'RT Core', local(t.rt ? 1 : 0), quantity(t.rt), t.rt ? `${n} SM × 1 / SM` : 'A100 无 RT Core', tensorStatus === 'derived' && t.rt ? 'derived' : 'verified', tensorStatus === 'derived' ? derivedSource : isA100 ? architecture : product, t.rt ? 'rt' : undefined),
    row('l2', 'L2 缓存', 'GPU 共享缓存', quantity(gpu.l2MB, 'MB'), gpu.l2MB == null ? '缺少所选 SKU 的可靠直接规格，保留未知' : l2Status === 'observed' ? 'PC² 计算中心 deviceQuery：6291456 bytes = 6 MiB' : 'A100 直接公开的缓存容量', l2Status, l2Source, 'l2'),
    row('hbm', '显存容量', gpu.memoryType, quantity(gpu.memoryGB, 'GB'), gpu.variant, 'verified', product, 'hbm'),
    row('memory-bandwidth', '显存带宽', '显存 ↔ GPU 路径', gpu.memoryBandwidth, '产品标称带宽，不等于程序有效带宽', 'verified', product, 'hbm'),
    row('memory-bus', '显存接口位宽', '显存控制器的聚合接口', quantity(gpu.memoryBusBits, 'bit'), '不以位宽反推物理颗粒或独立控制器个数', gpu.memoryBusBits == null ? 'unknown' : isA100 || id === 'rtx-5090d' ? 'reference' : 'verified', gpu.memoryBusBits == null ? null : isA100 || id === 'rtx-5090d' ? architecture : product, 'hbm'),
    row('memory-chips', isA100 ? 'HBM 堆栈 / DRAM 层数' : 'GDDR 颗粒 / 内部通道', '未直接核实', '未核实', '不从 GB 容量或图中颗粒数反推物理实现', 'unknown', null, 'hbm'),
    row('nvlinks', 'NVLink 双向总带宽', 'GPU 间通信', gpu.nvlinkBandwidth, '与显存带宽和 PCIe 带宽分开；未公开具体 NVLink 链路数', gpu.nvlinkBandwidth.includes('GB/s') ? 'verified' : 'unknown', product, 'nvlink'),
    row('pcie-lanes', 'PCIe 接口', `Gen${gpu.pcieGeneration}`, 'x16', '主机通信路径；SXM4 也有逻辑主机 PCIe 接口', 'verified', id === 'rtx-6000d' ? sources[6] : product, 'pcie')
  ];
  const smRows = [
    row('partitions', 'SM 功能分区 SMSP', local(4), quantity(t.partitions), '架构功能分区，不等于物理寄存器 bank', 'reference', derivedSource),
    ...productRows.filter(r => ['fp32', 'tensor', 'rt'].includes(r.id)),
    row('fp64', 'FP64 CUDA 路径', local(isA100 ? 32 : 2), quantity(n * (isA100 ? 32 : 2)), '仅指非 Tensor 路径，RTX / GA102 的 FP64 吞吐远低于 FP32', 'reference', derivedSource, 'cuda'),
    row('schedulers', 'Warp 调度器', local(4), quantity(t.schedulers), `${n} SM × 4 架构调度功能单元`, 'reference', derivedSource, 'scheduler'),
    row('dispatch', '指令发射功能分区', local(4), quantity(t.dispatch), '功能示意，不承诺任意指令的每周期吞吐', 'reference', derivedSource, 'dispatch'),
    row('load-store', '加载 / 存储单元物理数量', '未核实', '未核实', '访存功能已展示，不从示意块数推断执行器或端口数量', 'unknown', null, 'lsu'),
    row('unified', '统一 L1 / shared 容量', local(m.unifiedKiB, 'KiB'), miB(t.unifiedKiB), `${n} × ${m.unifiedKiB} KiB，包含下方 shared 容量`, 'reference', architectureLimits, 'shared'),
    row('shared-capacity', '共享内存容量上限', local(m.sharedKiB, 'KiB'), miB(t.sharedKiB), '每 SM 单独分配；不是全 GPU 可寻址的一个共享内存池', 'reference', architectureLimits, 'shared'),
    row('registers', '32 位寄存器', local(m.registers), quantity(t.registers), '65536 × 32 bit = 256 KiB / SM', 'reference', architectureLimits, 'registerFile'),
    row('register-bytes', '寄存器文件容量', local(256, 'KiB'), miB(t.registerBytes / 1024), '全 GPU 只作算术汇总，各 SM 分别拥有与分配', 'derived', architectureLimits, 'registerFile'),
    row('warp', '驻留 Warp 上限', local(m.warps), quantity(t.warps), '不表示这些 Warp 每周期同时执行', 'reference', architectureLimits, 'warpPool'),
    row('threads', '驻留线程上限', local(m.threads), quantity(t.threads), `${m.warps} Warp × 32 线程 / SM`, 'reference', architectureLimits, 'warpPool'),
    row('blocks', '驻留线程块上限', local(m.blocks), quantity(t.blocks), '每 SM 上限，实际受寄存器、shared 和线程数共同限制', 'reference', architectureLimits, 'scheduler'),
    row('copy-engines', '异步复制物理引擎数量', '未核实', '未核实', '展示异步复制功能，不按 Hopper TMA 组织推断器件数量', 'unknown', null, 'tma')
  ];
  const sharedRows = [
    ...smRows.filter(r => ['shared-capacity', 'unified'].includes(r.id)),
    row('shared-banks', '共享内存 bank', local(32), quantity(t.sharedBanks), '32-bank CUDA 访问模型；跨 SM 算术求和', 'verified', { ...sources[4], related: [countSource] }, 'banks'),
    row('bank-capacity', '物理 SRAM bank 容量', '未核实', '未核实', '共享内存 carveout 与物理 SRAM 阵列不同，不能用容量 ÷ 32 推断', 'unknown', sources[4], 'bank'),
    row('word', 'bank 映射字大小', '4 字节 / 32 bit', '每次访问使用同一规则', '连续 32-bit 字映射到连续 bank；同地址读可广播', 'verified', sources[4], 'address'),
    row('block-shared', '每线程块 shared 上限', `${m.sharedBlockKiB} KiB / block`, '不跨 block / SM 合并', '高于 48 KiB 的动态共享内存需要显式 opt-in', 'reference', programming, 'barrier'),
    row('bank-ports', '共享 bank 物理端口数', '未核实', '未核实', '公开 bank 映射不等于已公开物理读写端口数量', 'unknown', null, 'banks'),
    ...smRows.filter(r => ['load-store', 'copy-engines'].includes(r.id)),
    row('barriers', '物理同步器 / 完成通知槽位', '未核实', '未核实', '软件同步对象或指令上限不等同物理硬件数量', 'unknown', null, 'barrier')
  ];
  const registerRows = [
    ...smRows.filter(r => ['registers', 'register-bytes', 'partitions', 'warp', 'threads', 'blocks'].includes(r.id)),
    row('register-thread', '每线程寄存器上限', '255 个 32 位寄存器', '对每个线程分别适用', '每线程上限不能乘以最大线程数当成实际寄存器容量', 'reference', programming, 'registerFile'),
    row('register-ports', '物理寄存器 bank / 端口', '未核实', '未核实', '不能套用共享内存的 32-bank 映射；图中块为功能示意', 'unknown', null, 'registerBank'),
    row('operand-collectors', '操作数汇集物理条目', '未核实', '未核实', '显示供给关系，不假定缓冲区个数或容量', 'unknown', null, 'operand'),
    row('spill', '溢出后的存储空间', '线程 local 地址空间', '由设备全局内存支持', 'local memory 不是 shared memory，也不是额外寄存器', 'reference', programming, 'spill')
  ];
  const warpRows = [
    ...smRows.filter(r => ['warp', 'threads', 'blocks', 'schedulers', 'dispatch'].includes(r.id)),
    row('warp-size', 'Warp 线程数', '32 线程 / Warp', '所有 SM 使用相同编程模型', 'Warp 是执行组，不是独立物理核心', 'verified', programming, 'simt'),
    row('threads-block', '每线程块线程上限', '1024 线程 / block', '对每个线程块分别适用', '各资源最大值不能同时独立达到', 'verified', programming, 'warpPool'),
    row('instruction-l0', '指令取指 / 译码', '架构功能，缓存容量未列', '不按示意图累计物理槽位', '不假定指令缓存大小、译码宽度或固定流水延迟', 'reference', architecture, 'fetch'),
    row('scoreboard-physical', '记分牌条目 / 缓冲槽位', '未核实', '未核实', '演示依赖状态，不表示真实物理 entry 数量', 'unknown', null, 'scoreboard'),
    ...registerRows.filter(r => ['operand-collectors', 'registers'].includes(r.id)),
    row('pipeline-stages', '演示的流水步骤', '7 个因果步骤', '教学流程，不计入物理资源', '取指到写回不等于 7 个硬件时钟周期或固定 7 级流水线', 'reference', programming, 'execute')
  ];
  const summary = level === 'shared' ? { sm: sharedCards, gpu: globalSharedCards }
    : level === 'registers' ? { sm: registerCards, gpu: globalRegisterCards }
    : level === 'warp' ? { sm: warpCards, gpu: globalWarpCards }
    : { sm: smCards, gpu: level === 'sm' ? globalSmCards : gpuCards };
  return {
    gpuName: `${gpu.name} · ${gpu.variant}`, levelTitle: titles[level],
    defaultScope: ['package', 'die'].includes(level) ? 'gpu' : 'sm',
    scopes: [{ id: 'sm', label: '单个 SM' }, { id: 'gpu', label: '全 GPU 汇总' }], summary,
    rows: level === 'shared' ? sharedRows : level === 'registers' ? registerRows : level === 'warp' ? warpRows : level === 'sm' ? smRows : productRows,
    scopeNote: `资源预算采用 ${gpu.architecture} CC${gpu.computeCapability}：${m.warps} Warp、${m.threads} 线程、${m.blocks} 线程块 / SM。分布式资源汇总不意味着可以跨 SM 合并使用。`,
    note: `${gpu.variant}。${id === 'rtx-6000d' ? '156 SM 来自公开测量样本，衍生总数沿用该样本；产品显存规格来自 HPE 官方资料。' : ''}3D 几何与步骤表示功能关系。驻留上限、寄存器和共享内存预算并非可同时达到的实际运行值，未知的物理器件数量保留待核实。`
  };
}
