import { components as baseComponents } from './data.js';

const source = (title, url, label, kind = 'NVIDIA 官方文档') => ({ title, url, label, kind });
const programming = source('CUDA Programming Guide · Compute Capabilities', 'https://docs.nvidia.com/cuda/cuda-programming-guide/05-appendices/compute-capabilities.html', '按计算能力区分寄存器、共享内存和线程驻留上限；KB 表示 KiB。');
const banks = source('CUDA Best Practices · Shared Memory Banks', 'https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html#shared-memory-and-memory-banks', '32 个共享内存 bank、32 位连续字与同地址广播。');
const blackwell = source('NVIDIA RTX Blackwell GPU Architecture v1.1', 'https://images.nvidia.com/aem-dam/Solutions/geforce/blackwell/nvidia-rtx-blackwell-gpu-architecture.pdf', 'RTX Blackwell SM：128 CUDA、4 Tensor、1 RT、256 KiB 寄存器及 128 KiB 统一 L1 / shared；不是数据中心 B200。', 'NVIDIA 官方架构白皮书');
const ga100 = source('NVIDIA A100 Tensor Core GPU Architecture', 'https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/nvidia-ampere-architecture-whitepaper.pdf', 'GA100 / A100：108 SM、6912 FP32、432 Tensor、40 MB L2；每 SM 64 FP32。', 'NVIDIA 官方架构白皮书');
const ga102 = source('NVIDIA Ampere GA102 GPU Architecture', 'https://images.nvidia.cn/aem-dam/en-zz/Solutions/geforce/ampere/pdf/NVIDIA-ampere-GA102-GPU-Architecture-Whitepaper-V1.pdf', 'GA102 SM：128 FP32、4 Tensor、1 RT；部分 FP32 与 INT32 共享执行路径。', 'NVIDIA 官方架构白皮书');
const ampereTuning = source('NVIDIA Ampere Tuning Guide', 'https://docs.nvidia.com/cuda/ampere-tuning-guide/index.html', '区分 A100 CC8.0 与 A40 CC8.6 的共享内存、Warp 和线程块上限。');
const blackwellTuning = source('Blackwell Tuning Guide', 'https://docs.nvidia.com/cuda/blackwell-tuning-guide/index.html', 'RTX Blackwell 属于 CC12.0；资源容量以 Programming Guide 的计算能力技术表为准。');

export const NVIDIA_SOURCES = {
  'rtx-pro-5000': [
    source('NVIDIA RTX PRO 5000 Blackwell Datasheet', 'https://www.nvidia.com/content/dam/en-zz/Solutions/products/workstations/professional-desktop-gpus/rtx-pro-5000-blackwell/workstation-datasheet-blackwell-rtx-pro-5000-gtc25-spring-nvidia-3658700.pdf', '本图选择桌面版 48 GB GDDR7 ECC；14080 CUDA、1344 GB/s、384 bit、PCIe 5.0 x16。不是笔记本或 Ada 版。', 'NVIDIA 官方产品规格'),
    blackwell, blackwellTuning, programming, banks
  ],
  'rtx-6000d': [
    source('HPE · NVIDIA RTX PRO 6000D 84GB PCIe', 'https://www.hpe.com/cn/zh/product-catalog/compute/accelerators/pip.specifications.nvidia-accelerators.1014927525.html', 'Blackwell Server Edition，84 GB GDDR7 ECC、1398 GB/s；不套用 96 GB RTX PRO 6000。', '整机厂商官方产品规格'),
    blackwell, blackwellTuning, programming, banks,
    source('Geekbench · NVIDIA RTX 6000D 原始测试记录', 'https://browser.geekbench.com/v6/compute/5319912', '2025-12-02 上传的样本报告 156 个 Compute Units；作为一手实测配置，而非厂商保证。', '一手测量记录'),
    source('HPE NVIDIA Accelerators QuickSpecs', 'https://www.hpe.com/psnow/doc/c04123180', 'RTX PRO 6000D Blackwell Server Edition：PCIe Gen5 x16、84 GB GDDR7、1398 GB/s、最高 2 个 MIG。', '整机厂商官方产品规格')
  ],
  'rtx-5090d': [
    source('NVIDIA · GeForce RTX 5090 D 发布规格', 'https://www.nvidia.cn/geforce/news/rtx-50-series-graphics-cards-gpu-laptop-announcements/', '原版 RTX 5090 D：32 GB GDDR7、1792 GB/s、21760 CUDA、680 Tensor、170 RT。与 24 GB D v2 分开。', 'NVIDIA 官方发布规格'),
    blackwell, blackwellTuning, programming, banks,
    source('NVIDIA · RTX 5090 D v2 对照规格', 'https://www.nvidia.cn/geforce/graphics-cards/50-series/rtx-5090-d-v2/', '当前 D v2 页面为 24 GB / 384 bit / 1344 GB/s；用于明确区分版本，不覆盖本图原版 32 GB。', 'NVIDIA 官方版本对照')
  ],
  a100: [
    source('NVIDIA A100 · 产品规格', 'https://www.nvidia.com/zh-tw/data-center/a100/', '本图选择 A100 80GB SXM：80 GB HBM2e、2039 GB/s、600 GB/s NVLink、SXM4。', 'NVIDIA 官方产品规格'),
    ga100, ampereTuning, programming, banks,
    source('NVIDIA · HGX A100 80GB', 'https://developer.nvidia.com/blog/supercharging-worlds-fastest-ai-supercomputing-platform-on-hgx-a100-80gb-gpus/', '80 GB HBM2e SXM 提高显存容量与带宽，计算配置延续 A100 40GB。', 'NVIDIA 官方技术文章')
  ],
  a40: [
    source('NVIDIA A40 Datasheet', 'https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a40/proviz-print-nvidia-a40-datasheet-us-nvidia-1469711-r8-web.pdf', '48 GB GDDR6 ECC、696 GB/s、10752 CUDA、336 Tensor、84 RT、112.5 GB/s NVLink、PCIe Gen4。', 'NVIDIA 官方产品规格'),
    ga102, ampereTuning, programming, banks,
    source('Paderborn PC² · A40 deviceQuery', 'https://upb-pc2.atlassian.net/wiki/spaces/PC2DOK/pages/969670658/NVIDIA%2BA40%2B48GB', 'A40 实机 deviceQuery：84 SM、L2 6291456 bytes、100 KiB shared / SM、1536 线程 / SM。', '计算中心一手设备查询')
  ]
};

const limits = (warps, blocks, sharedKiB, unifiedKiB) => ({ registers: 65536, warps, threads: warps * 32, blocks, sharedKiB, sharedBlockKiB: sharedKiB - 1, unifiedKiB });
const rtxLimits = limits(48, 24, 100, 128);
export const NVIDIA_PROFILES = {
  'rtx-pro-5000': {
    id: 'rtx-pro-5000', name: 'RTX PRO 5000', vendor: 'NVIDIA', architecture: 'Blackwell', family: 'blackwell', formFactor: 'PCIe 工作站',
    variant: 'Blackwell 桌面版 · 48 GB', memoryGB: 48, memoryType: 'GDDR7 ECC', memoryBandwidth: '1.344 TB/s', memoryBusBits: 384,
    nvlinkBandwidth: '无公开 NVLink 规格', activeSMs: 110, smCountStatus: 'derived', cudaCores: 14080, tensorCores: 440, rtCores: 110, smFp32: 128,
    tensorGeneration: 5, rtGeneration: 4, computeCapability: '12.0', pcieGeneration: 5, pcieLanes: 16, l2MB: null, smLimits: { ...rtxLimits },
    subtitle: '从专业图形，走进 Blackwell。', description: '选择 48 GB 桌面版：探索第五代 Tensor Core、第四代 RT Core，以及 GDDR7 与 RTX Blackwell SM 的配合。',
    focus: '48 GB GDDR7 · 光追与 AI', accent: '#ea9d70'
  },
  'rtx-6000d': {
    id: 'rtx-6000d', name: 'RTX 6000D', vendor: 'NVIDIA', architecture: 'Blackwell', family: 'blackwell', formFactor: 'PCIe 服务器',
    variant: 'RTX PRO 6000D Blackwell Server Edition · 84 GB', memoryGB: 84, memoryType: 'GDDR7 ECC', memoryBandwidth: '1.398 TB/s', memoryBusBits: null,
    nvlinkBandwidth: '无公开 NVLink 规格', activeSMs: 156, smCountStatus: 'observed', cudaCores: 19968, tensorCores: 624, rtCores: 156, smFp32: 128,
    tensorGeneration: 5, rtGeneration: 4, computeCapability: '12.0', pcieGeneration: 5, pcieLanes: 16, l2MB: null, smLimits: { ...rtxLimits },
    subtitle: '在服务器中，观察 RTX Blackwell。', description: '84 GB GDDR7 ECC 的服务器版本。产品显存规格与公开测量样本分开标注，156 SM 用于展示该样本的资源规模。',
    focus: '84 GB GDDR7 · 服务器 AI', accent: '#d48cde'
  },
  'rtx-5090d': {
    id: 'rtx-5090d', name: 'RTX 5090D', vendor: 'NVIDIA', architecture: 'Blackwell', family: 'blackwell', formFactor: 'PCIe 显卡',
    variant: 'GeForce RTX 5090 D 原版 · 32 GB', memoryGB: 32, memoryType: 'GDDR7', memoryBandwidth: '1.792 TB/s', memoryBusBits: 512,
    nvlinkBandwidth: '不支持 NVLink', activeSMs: 170, smCountStatus: 'derived', cudaCores: 21760, tensorCores: 680, rtCores: 170, smFp32: 128,
    tensorGeneration: 5, rtGeneration: 4, computeCapability: '12.0', pcieGeneration: 5, pcieLanes: 16, l2MB: null, smLimits: { ...rtxLimits },
    subtitle: '让图形计算与神经渲染相遇。', description: '2025 年原版 32 GB RTX 5090 D：21760 CUDA Core、680 Tensor Core 与170 RT Core；不是显存为 24 GB 的 D v2。',
    focus: '32 GB 原版 · 170 个 SM', accent: '#f092b0'
  },
  a100: {
    id: 'a100', name: 'A100', vendor: 'NVIDIA', architecture: 'Ampere', family: 'ampere', formFactor: 'SXM4',
    variant: 'A100 80GB SXM', memoryGB: 80, memoryType: 'HBM2e', memoryBandwidth: '2.039 TB/s', memoryBusBits: 5120,
    nvlinkBandwidth: '600 GB/s', activeSMs: 108, smCountStatus: 'verified', cudaCores: 6912, tensorCores: 432, rtCores: 0, smFp32: 64,
    tensorGeneration: 3, computeCapability: '8.0', pcieGeneration: 4, pcieLanes: 16, l2MB: 40, smLimits: limits(64, 32, 164, 192),
    subtitle: '理解数据中心 Ampere 的计算底座。', description: 'A100 80GB SXM4：108 个 GA100 SM 与 80 GB HBM2e，探索第三代 Tensor Core、异步复制和片上数据复用。',
    focus: '80 GB HBM2e · GA100', accent: '#5bb9d8'
  },
  a40: {
    id: 'a40', name: 'A40', vendor: 'NVIDIA', architecture: 'Ampere', family: 'ampere', formFactor: 'PCIe 被动散热',
    variant: 'A40 48GB PCIe', memoryGB: 48, memoryType: 'GDDR6 ECC', memoryBandwidth: '696 GB/s', memoryBusBits: 384,
    nvlinkBandwidth: '112.5 GB/s', activeSMs: 84, smCountStatus: 'derived', cudaCores: 10752, tensorCores: 336, rtCores: 84, smFp32: 128,
    tensorGeneration: 3, rtGeneration: 2, computeCapability: '8.6', pcieGeneration: 4, pcieLanes: 16, l2MB: 6, l2Status: 'observed', l2Source: 5, smLimits: limits(48, 16, 100, 128),
    subtitle: '一颗 GPU，处理图形与 AI。', description: '48 GB GDDR6 ECC 与 84 个 GA102 SM：区分图形 Ampere 与 A100 的执行通路、共享内存和驻留资源。',
    focus: '48 GB GDDR6 · GA102', accent: '#76b5a3'
  }
};

const format = n => n.toLocaleString('en-US');

export function getNvidiaComponents(gpu) {
  const c = structuredClone(baseComponents);
  const isRtx = gpu.family === 'blackwell', isA100 = gpu.id === 'a100', m = gpu.smLimits;
  // Preserve generic CUDA explanations, then replace all model-specific text.
  for (const component of Object.values(c)) {
    for (const key of ['title', 'description', 'insight', 'subtitle']) if (typeof component[key] === 'string') component[key] = component[key].replaceAll('Hopper 或 H20', gpu.architecture).replaceAll('Hopper', gpu.architecture).replaceAll('H20', gpu.name);
    component.source = ['banks', 'bank', 'address'].includes(Object.keys(c).find(id => c[id] === component)) ? 4 : 3;
  }
  const set = (id, values) => Object.assign(c[id], values);
  set('gpu', { title: `${gpu.architecture} GPU 核心`, description: `${gpu.name} ${gpu.variant} 集成计算集群、片上缓存与接口。图中为功能结构，数量以资源统计为准。`, stats: [['架构', `${gpu.architecture} · CC ${gpu.computeCapability}`], ['版本', gpu.variant], ['显存', `${gpu.memoryGB} GB ${gpu.memoryType}`]], source: 0 });
  set('hbm', { title: `${gpu.memoryType} 显存`, shortTitle: `${gpu.memoryType} 显存`, en: isA100 ? 'HBM2e MEMORY' : 'GDDR MEMORY', description: isA100 ? 'HBM2e 在封装附近垂直堆叠 DRAM，配合宽接口向计算单元供给权重与激活数据。' : 'GDDR 显存颗粒分布在显卡电路板上，经显存接口与 GPU 相连；它不是 SXM 封装中的 HBM 堆栈。', stats: [['容量', `${gpu.memoryGB} GB`], ['带宽', gpu.memoryBandwidth], ['版本', gpu.variant]], insight: '显存容量与片上共享内存是不同层级。模型权重、激活与 KV Cache 通常由显存承载；图中颗粒数量不用于反推物理颗粒。', source: 0 });
  set('substrate', { title: isA100 ? 'SXM4 模块与封装' : '显卡电路板与封装', description: isA100 ? 'SXM4 模块承载 GPU 与 HBM2e 封装，提供供电及与系统的信号连接。' : 'PCIe 板卡承载 GPU 封装、GDDR 显存和供电器件，并通过主机接口连接系统。', stats: [['形态', gpu.formFactor], ['存储', gpu.memoryType], ['展示', '功能示意']], source: 0 });
  set('pcie', { stats: [['接口', `PCIe ${gpu.pcieGeneration}.0 x16`], ['连接', 'GPU ↔ 主机'], ['用途', '模型加载 / 主机数据']], insight: isA100 ? 'PCIe 是主机通信路径，SXM4 是模块形态；本图接口为逻辑示意。' : '主机传输通过 PCIe。PCIe 带宽与显存带宽、GPU 间互联带宽应分别理解。', source: gpu.id === 'rtx-6000d' ? 6 : 0 });
  set('nvlink', { title: gpu.nvlinkBandwidth.includes('GB/s') ? 'NVLink GPU 互联' : '多卡通信路径', shortTitle: gpu.nvlinkBandwidth.includes('GB/s') ? 'NVLink' : 'PCIe 多卡通信', description: gpu.nvlinkBandwidth.includes('GB/s') ? `${gpu.name} 公开规格列出 ${gpu.nvlinkBandwidth} NVLink 双向总带宽，实际通信还取决于配套连接和系统拓扑。` : '此型号不在图中假定具有数据中心 NVLink。多卡工作需要由 PCIe 及系统互联承担，具体 P2P 能力依赖平台与软件支持。', stats: [['NVLink', gpu.nvlinkBandwidth], ['系统路径', '取决于平台'], ['带宽口径', '与显存分开']], insight: '图示连线表示通信功能，不代表 SXM NVSwitch 底板、物理 NVLink 端口数或任意平台都支持相同的多卡拓扑。', source: 0 });
  set('gpc', { description: `${gpu.architecture} 把 SM 组织到 GPC / TPC 层级中，线程块分配到 SM 执行。启用单元数量与完整芯片设计不同。`, stats: [['启用 SM', `${gpu.activeSMs} / GPU`], ['层级', 'GPC → TPC → SM'], ['数量状态', gpu.smCountStatus === 'observed' ? '公开测量样本' : gpu.smCountStatus === 'derived' ? '按 CUDA 数量折算' : '官方架构资料']], insight: gpu.id === 'rtx-6000d' ? '156 SM 来自 Geekbench 原始样本的 Compute Units 字段；不把它标为厂商保证，衍生资源统计沿用该样本规模。' : `SM 数为 ${gpu.activeSMs}，${gpu.smCountStatus === 'derived' ? `按 ${format(gpu.cudaCores)} CUDA Core ÷ ${gpu.smFp32} / SM 折算。` : '由产品架构资料确认。'} 图形排布仅为教学示意。`, source: gpu.id === 'rtx-6000d' ? 5 : 1 });
  set('l2', { description: `L2 是多个 SM 共享的片上缓存。命中缓存的数据不必再次从 ${gpu.memoryType} 显存读取，可以减少外部流量。`, stats: [['容量', gpu.l2MB == null ? '所选版本未直接核实' : `${gpu.l2MB} MB${gpu.l2Status === 'observed' ? '（设备查询）' : ''}`], ['位置', '显存与 SM 之间'], ['共享范围', '整个 GPU']], insight: '缓存容量由具体产品配置决定。完整芯片设计的 L2 上限不自动等于每款裁剪 SKU 的容量，缺少直接资料时保留未知。', source: gpu.l2MB == null ? 3 : gpu.l2Source || 1 });
  set('sm', { description: `${gpu.name} 的每个 SM 包含 ${gpu.smFp32} 个 FP32 CUDA Core、4 个第 ${gpu.tensorGeneration} 代 Tensor Core${gpu.rtCores ? '以及 1 个 RT Core' : ''}，调度、寄存器和共享内存共同支撑执行。`, stats: [['FP32 / SM', String(gpu.smFp32)], ['Tensor / SM', '4'], ['驻留 Warp / SM', String(m.warps)]], insight: `${gpu.architecture} CC${gpu.computeCapability} 的资源限制独立列示。统一 L1 / 共享内存为 ${m.unifiedKiB} KiB，可作共享内存最多 ${m.sharedKiB} KiB；不要把二者容量相加。`, source: 1 });
  set('tensor', { title: `第 ${gpu.tensorGeneration} 代 Tensor Core`, en: `${gpu.tensorGeneration}TH-GEN TENSOR CORE`, description: isRtx ? '第五代 Tensor Core 执行矩阵乘加，增加 FP4 / FP6 等低精度运算，适用于神经渲染与 AI。RTX Blackwell 与数据中心 Blackwell 的矩阵编程接口和资源不完全相同。' : '第三代 Tensor Core 执行矩阵乘加，支持 TF32、BF16、FP16 和结构化稀疏性。A100 还具有 FP64 Tensor 运算能力；A40 不套用该能力。', stats: [['总数量', `${gpu.tensorCores} / GPU`], ['每 SM', '4'], ['精度示例', isRtx ? 'FP4 / FP8 / BF16' : isA100 ? 'FP64 / TF32 / BF16' : 'TF32 / BF16 / FP16']], insight: 'Tensor Core 的数量不等于操作吞吐。精度、稀疏性、矩阵形状和内核实现共同决定实际性能。', source: 1 });
  set('cuda', { description: isRtx ? 'RTX Blackwell 将 FP32 与 INT32 执行路径统一，单个共享执行通路在一个周期内执行其中一种类型，不能把两者峰值相加。' : isA100 ? 'GA100 每 SM 有 64 个 FP32 CUDA Core，并具有独立的 INT32 与 FP64 执行资源。它与 GA102 的 128 FP32 / SM 结构不同。' : 'GA102 每 SM 支持 128 个 FP32 CUDA Core。其中一部分路径可以执行 FP32 或 INT32，FP32 与 INT32 的峰值不能简单相加。', stats: [['FP32 总数量', `${format(gpu.cudaCores)} / GPU`], ['每个 SM', `${gpu.smFp32} FP32`], ['执行方式', 'SIMT']], source: 1 });
  set('shared', { description: `每 SM 的 ${m.unifiedKiB} KiB 统一 L1 / 共享内存支持缓存与显式管理的共享数据，最多 ${m.sharedKiB} KiB 可用作共享内存，每个线程块最多 ${m.sharedBlockKiB} KiB。`, stats: [['统一 L1 / shared', `${m.unifiedKiB} KiB / SM`], ['shared 上限', `${m.sharedKiB} KiB / SM`], ['单线程块上限', `${m.sharedBlockKiB} KiB`]], source: 3 });
  for (const id of ['registers', 'registerFile']) set(id, { stats: [['寄存器', '65,536 × 32 bit / SM'], ['每线程上限', '255 个'], ['驻留 Warp 上限', `${m.warps} / SM`]], insight: `采用 CC${gpu.computeCapability} 公开架构预算：每 SM ${m.threads} 线程、${m.warps} Warp、${m.blocks} 线程块上限。各类上限不能保证同时达到；实际还受分配粒度与内核需求约束。`, source: 3 });
  set('lsu', { stats: [['输入', '线程地址 / 数据'], ['共享内存', 'bank 访问'], ['全局内存', `缓存 / ${gpu.memoryType} 显存路径`]] });
  set('tma', { title: isRtx ? '异步存储搬运路径' : '异步复制 cp.async', shortTitle: '异步复制', en: 'ASYNCHRONOUS MEMORY COPY', description: '线程发起全局内存到共享内存的异步复制，可与计算重叠，并在消费数据前显式等待完成。此处展示复制功能与同步依赖，不假定具体复制器件的内部数量或组织。', stats: [['数据路径', 'global → shared'], ['功能', '异步复制 / 计算重叠'], ['计数', '物理通道数未核实']], insight: '异步复制支持取决于编译目标及具体指令。发起不代表完成，消费者必须遵循正确的等待与可见性规则。', nextLabel: '观察异步复制与共享内存', source: 3 });
  set('barrier', { title: '线程协作与完成等待', shortTitle: '同步与等待', description: '线程块内协作需要屏障；异步复制需要完成等待。程序必须分别保证线程到达、数据完成及内存可见性。', stats: [['线程同步', '线程块 / Warp'], ['复制同步', '提交与等待'], ['物理屏障数量', '未核实']], insight: '线程块屏障不会自动让所有 GPU 上的数据完成全局同步。本图节点表示功能，不对应硬件同步器数量。', source: 3 });
  set('execute', { description: '普通算术指令进入相应的 CUDA 执行路径，加载存储进入访存路径，矩阵运算由相应的 Tensor 指令使用 Tensor Core。各类指令的参与线程与完成语义需要分别理解。', stats: [['算术', 'FP32 / INT32 路径'], ['访存', 'LSU / 存储层级'], ['矩阵', 'Tensor Core']], insight: '逐步演示表达依赖和因果关系，不代表真实时钟周期、固定流水级数或矩阵指令的全部执行时序。', source: 3 });
  set('simt', { description: 'Warp 的 32 个线程通过活跃掩码参与当前指令。分支分歧可能使不同路径分批推进；线程协作仍需正确的同步原语。', source: 3 });
  c.rt = { level: 'sm', icon: 'target', color: '#ec9bb8', en: 'RAY TRACING CORE', title: `第 ${gpu.rtGeneration || '—'} 代 RT Core`, shortTitle: 'RT 光线追踪', subtitle: '加速光线与场景几何的相交测试。', description: gpu.rtCores ? `RT Core 处理包围盒遍历及几何相交等光线追踪工作。${gpu.name} 的 ${gpu.rtCores} 个 RT Core 与 CUDA / Tensor 路径协同执行图形和神经渲染。` : 'A100 不包含 RT Core；本图不把 Tensor Core 视为光线追踪专用单元。', stats: [['总数量', `${gpu.rtCores} / GPU`], ['每 SM', gpu.rtCores ? '1' : '0'], ['职责', '光线追踪专用']], insight: 'RT、Tensor 与 CUDA 是不同执行功能，其核心数量不能直接相加作为统一算力单位。', source: gpu.id === 'rtx-5090d' || gpu.id === 'a40' ? 0 : 1 };
  return c;
}
