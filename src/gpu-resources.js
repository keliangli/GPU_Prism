import { getGpu } from './gpu-profiles.js';
import { levels } from './data.js';
import { GPU_RESOURCE_SPECS, HOPPER_SM as SM, RESOURCE_SOURCES as S } from './gpu-resource-specs.js';
import { getNvidiaResourceTotals, getNvidiaResourceReport } from './additional-resources.js';
import { getAscendResourceTotals, getAscendResourceReport } from './ascend.js';

const number=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const quantity=(n,unit)=>n===null?'未核实':`${number(n)} ${unit}`;
const mib=kiB=>`${number(kiB/1024)} MiB`;
const local=(n,unit='个')=>`${quantity(n,unit)} / SM`;

export function getComponentResourceInfo(gpuId,level,component) {
  if(getGpu(gpuId).family!=='hopper') {
    const target=getGpu(gpuId).vendor==='NVIDIA'&&component==='registers'?'registerFile':component;
    for(const candidate of [...new Set([level,'package','die','sm','shared','registers','warp'])]) {
      const match=getResourceReport(gpuId,candidate).rows.find(row=>row.component===target);
      if(match)return match;
    }
    return null;
  }
  const ids={gpu:'sm',gpc:'gpc',sm:'sm',cuda:'fp32',tensor:'tensor',hbm:'hbm',l2:'l2',nvlink:'nvlinks',pcie:'pcie-lanes',shared:'shared-capacity',banks:'shared-banks',bank:'bank-capacity',address:'word',registers:'registers',registerFile:'registers',registerBank:'register-ports',warpPool:'warp',scheduler:'schedulers',dispatch:'dispatch',simt:'warp-size',barrier:'barriers',tma:'tma',scoreboard:'scoreboard-physical',operand:'operand-collectors',fetch:'instruction-l0',lsu:'load-store'};
  const wanted=ids[component];
  if(!wanted)return null;
  for(const candidate of [...new Set([level,'die','shared','registers','warp'])]) {
    const found=getResourceReport(gpuId,candidate).rows.find(row=>row.id===wanted);
    if(found)return found;
  }
  return null;
}

export function getGpuResourceTotals(id) {
  const profile=getGpu(id);
  if(profile.family==='davinci')return getAscendResourceTotals(profile.id);
  if(profile.family!=='hopper')return getNvidiaResourceTotals(profile.id);
  const gpu=getGpu(id),n=GPU_RESOURCE_SPECS[gpu.id].sms.value;
  return {smCount:n,fp32:n*SM.fp32,tensor:n*SM.tensor,schedulers:n*SM.schedulers,
    partitions:n*SM.partitions,dispatch:n*SM.dispatch,registers:n*SM.registers,
    registerBytes:n*SM.registers*SM.registerBits/8,sharedKiB:n*SM.sharedKiB,
    unifiedKiB:n*SM.unifiedKiB,sharedBanks:n*SM.sharedBanks,
    warps:n*SM.warps,threads:n*SM.threads,blocks:n*SM.blocks};
}

export function getResourceReport(id,requestedLevel='package') {
  const profile=getGpu(id);
  if(profile.family==='davinci')return getAscendResourceReport(profile.id,requestedLevel);
  if(profile.family!=='hopper')return getNvidiaResourceReport(profile.id,requestedLevel);
  const gpu=getGpu(id),spec=GPU_RESOURCE_SPECS[gpu.id],t=getGpuResourceTotals(gpu.id);
  const level=Object.hasOwn(levels,requestedLevel)?requestedLevel:'package';
  const n=t.smCount,fullCompute=['h100','h200'].includes(gpu.id);
  const smSource=gpu.id==='h800'?{...spec.sms.source,related:[S.h800sxm]}:spec.sms.source;
  const coreSource=gpu.id==='h100'?S.whitepaper:gpu.id==='h200'?S.course:{...S.course,related:[smSource]};
  const cards={},rows={};
  // SMSP subdivisions are not modeled as selectable register banks in 3D.
  const row=(id,label,localValue,total,basis,status='reference',source=S.tuning,component)=>
    ({id,label,local:localValue,total,basis,status,source,component:['partitions','partition-registers'].includes(id)?undefined:component});
  const metric=(id,label,value,unit,detail,status='reference',component,source=S.tuning)=>
    ({id,label,value:value===null?'未核实':typeof value==='number'?number(value):value,unit:value===null?'':unit,detail,status,component,source});
  const derived=(id,label,value,unit,perSM,component,extra='')=>metric(id,label,value,unit,`${n} SM × ${number(perSM)} / SM${extra}`,'derived',component,S.course);
  const countStatus=gpu.id==='h100'?'verified':'derived';
  const productSource=spec.product;
  const sms=metric('sms','启用 SM',n,'个',spec.sms.status==='observed'?'DeepSeek H800 一手研究配置':'所选 GPU 的启用计算单元',spec.sms.status,'sm',smSource);
  const fp32=metric('fp32','FP32 CUDA Core',t.fp32,'个',`${n} SM × 128 FP32 Core`,countStatus,'cuda',coreSource);
  const tensor=metric('tensor','第四代 Tensor Core',t.tensor,'个',`${n} SM × 4 Tensor Core`,countStatus,'tensor',coreSource);
  const l2=metric('l2','L2 缓存',spec.l2MB.value,'MB',spec.l2MB.status==='observed'?'公开 H20 实验平台配置':'全 GPU 共享的片上缓存',spec.l2MB.status,'l2',spec.l2MB.source);
  const memory=metric('hbm','HBM 显存',gpu.memoryGB,'GB',`${gpu.formFactor} · ${gpu.memoryType}`,'verified','hbm',productSource);
  const nvlinks=metric('nvlinks','NVLink 链路',spec.nvlinks.value,'条','HGX NVSwitch 拓扑中的每 GPU 链路数',spec.nvlinks.status,'nvlink',spec.nvlinks.source);

  const productRows=[
    row('sm','启用 SM','1 个 SM',quantity(n,'个'),spec.sms.status==='observed'?'DeepSeek 报告 + H800 SXM5 FlashMLA 配置':'产品 / 官方软件文档确认',spec.sms.status,smSource,'sm'),
    row('gpc','启用 GPC','内部 TPC 数随实际配置变化',quantity(spec.gpcs.value,'个'),'H100 直接列出总数；其他型号不从示意图数块',spec.gpcs.status,spec.gpcs.source,'gpc'),
    row('tpc','启用 TPC','Hopper 结构为 2 SM / TPC',quantity(spec.tpcs.value,'个'),gpu.id==='h200'?'132 SM ÷ 2，按完整 TPC 结构折算':'只填直接核实的产品数量',spec.tpcs.status,spec.tpcs.source,'gpc'),
    row('fp32','FP32 CUDA Core',local(SM.fp32),quantity(t.fp32,'个'),`${n} × 128；不与 FP64 / INT32 路径相加`,countStatus,coreSource,'cuda'),
    row('tensor','第四代 Tensor Core',local(SM.tensor),quantity(t.tensor,'个'),`${n} × 4`,countStatus,coreSource,'tensor'),
    row('l2','L2 缓存','全 GPU 共享',quantity(spec.l2MB.value,'MB'),spec.l2MB.status==='observed'?'H20 论文实验平台参数':'容量来自对应型号资料，非按 SM 相加',spec.l2MB.status,spec.l2MB.source,'l2'),
    row('hbm','HBM 显存容量',gpu.memoryType,quantity(gpu.memoryGB,'GB'),'产品标称可用显存容量','verified',productSource,'hbm'),
    row('hbm-stacks','有效 HBM 堆栈','堆栈内部包含多层 DRAM',quantity(spec.hbmStacks.value,'个'),'H100 为 5 个有效堆栈；其余不从 GB 数量反推',spec.hbmStacks.status,spec.hbmStacks.source,'hbm'),
    row('controllers','512-bit 显存控制器','控制器宽度 512 bit',quantity(spec.memoryControllers.value,'个'),'H100 白皮书产品表；其余未直接核实',spec.memoryControllers.status,spec.memoryControllers.source,'hbm'),
    row('memory-bandwidth','HBM 显存带宽','显存 → GPU 数据路径',quantity(spec.memoryBandwidth.value,'TB/s'),spec.memoryBandwidth.status==='observed'?'H20 公开论文中的实验配置':'产品总带宽；不是片上 shared 带宽',spec.memoryBandwidth.status,spec.memoryBandwidth.source,'hbm'),
    row('nvlinks','NVLink 链路数','Hopper 第四代 NVLink',quantity(spec.nvlinks.value,'条'),'H20/H100/H200 18；H800 2 × 4 NVSwitch = 8',spec.nvlinks.status,spec.nvlinks.source,'nvlink'),
    row('nvlink-bandwidth','NVLink 双向总带宽','GPU ↔ GPU 数据路径',quantity(spec.nvlinkBandwidth.value,'GB/s'),gpu.id==='h20'?'18 链路 × 50 GB/s，按 HGX 拓扑推算':'产品规格中的双向总带宽',spec.nvlinkBandwidth.status,gpu.id==='h20'?{...S.fabric,related:[S.hopper]}:spec.nvlinkBandwidth.source,'nvlink'),
    row('pcie-lanes','PCIe 通道','主机 ↔ GPU 数据路径',spec.pcieLanes.value===null?'未逐项核实':`Gen 5 ×${spec.pcieLanes.value}`,gpu.id==='h20'?'一手 H20 部署论文直接列出 Gen 5 ×16':gpu.id==='h100'?'H100 白皮书产品表直接给出':'不把传输带宽反推为已核实的通道数',spec.pcieLanes.status,spec.pcieLanes.source,'pcie')
  ];

  const computeRows=[
    row('partitions','SM 执行分区 SMSP',local(SM.partitions),quantity(t.partitions,'个'),`${n} × 4；不等于寄存器物理 bank 数`,'derived',S.whitepaper),
    row('schedulers','Warp 调度器',local(SM.schedulers),quantity(t.schedulers,'个'),`${n} × 4；每分区一个调度器`,'derived',S.course,'scheduler'),
    row('dispatch','Dispatch Unit',local(SM.dispatch),quantity(t.dispatch,'个'),`${n} × 4，Hopper 架构图参考`,'derived',S.whitepaper,'dispatch'),
    ...[['fp64','FP64 非 Tensor 执行单元',SM.fp64],['int32','INT32 执行单元',SM.int32],['load-store','LD/ST 单元',SM.loadStore],['sfu','特殊函数单元 SFU',SM.sfu],['texture','纹理单元',SM.texture]].map(([key,label,value])=>
      row(key,label,`${number(value)} / SM（Hopper）`,fullCompute?quantity(n*value,'个'):'未逐项核实',fullCompute?`${n} × ${value}；${gpu.id==='h100'?'H100 实装 / 架构表':'Hopper 架构折算'}`:'H20/H800 产品配置不自动套用完整 H100 执行路径',fullCompute?(gpu.id==='h100'&&['fp64','int32','texture'].includes(key)?'verified':'derived'):'reference',gpu.id==='h100'&&['fp64','int32','texture'].includes(key)?S.whitepaper:S.course,key==='load-store'?'lsu':undefined)),
    row('tma','TMA 物理引擎 / 通道数','架构支持 TMA 功能','未公开具体数量','架构图中的功能模块不等于物理复制通道数量','unknown',S.hopper,'tma'),
    row('scoreboard-physical','Scoreboard 条目 / 端口','未公开具体数量','未公开具体数量','不从可视化节点数量推断硬件实现','unknown',S.course,'scoreboard')
  ];
  const storageRows=[
    row('registers','32-bit 寄存器条目',local(SM.registers,'条'),quantity(t.registers,'条'),`${n} × 65,536；各 SM 独立分配`,'derived',S.tuning,'registers'),
    row('register-capacity','寄存器文件容量',local(256,'KiB'),`${mib(t.registerBytes/1024)}（分布式）`,`${n} × 256 KiB；条目数 × 4 字节`,'derived',S.tuning,'registers'),
    row('unified','L1 / Texture / Shared 统一池',local(SM.unifiedKiB,'KiB'),`${mib(t.unifiedKiB)}（分布式）`,`${n} × 256 KiB；L1 与 shared 共享同一资源`,'derived',S.tuning,'shared'),
    row('shared-capacity','Shared carveout 上限',local(SM.sharedKiB,'KiB'),`${mib(t.sharedKiB)}（分布式）`,`${n} × 228 KiB；属于统一池的一部分，不能相加`,'derived',S.tuning,'shared'),
    row('shared-banks','Shared memory bank',local(SM.sharedBanks),quantity(t.sharedBanks,'个 bank 实例'),`${n} × 32；bank 映射仅在单个 SM 内成立`,'derived',S.shared,'banks')
  ];
  const warpRows=[
    row('warp','驻留 Warp 上限',local(SM.warps),quantity(t.warps,'个 Warp 槽'),`${n} × 64；驻留不等于同时发射`,'derived',S.tuning,'warpPool'),
    row('threads','驻留线程上限',local(SM.threads,'线程'),quantity(t.threads,'线程上下文'),`${n} × 2,048；与寄存器及 CTA 分配共同受限`,'derived',S.tuning,'warpPool'),
    row('blocks','驻留线程块 CTA 上限',local(SM.blocks),quantity(t.blocks,'个 CTA 槽'),`${n} × 32；不能保证与所有其他上限同时达到`,'derived',S.tuning,'warpPool'),
    row('warp-size','每个 Warp 的线程 / lane','32 线程 / Warp','局部组织，不能相加','Warp 的逻辑线程宽度','reference',S.course,'simt'),
    row('scheduler-slots','每调度器 Warp 槽','16 槽 / scheduler','局部组织，不能相加','NVIDIA 课程直接给出 Hopper 每调度器 16 槽','reference',S.course,'scheduler'),
    row('max-block-threads','单个线程块线程上限','1,024 线程 / CTA','局部限制，不能相加','不是每 SM 的线程总数','reference',S.tuning,'warpPool')
  ];

  cards.package={gpu:[sms,fp32,tensor,memory,l2,nvlinks]};
  cards.die={gpu:[sms,fp32,tensor,l2,derived('schedulers','Warp 调度器合计',t.schedulers,'个',4,'scheduler'),metric('register-capacity','分布式寄存器',number(t.registerBytes/1048576),'MiB',`${n} × 256 KiB，独立寄存器文件之和`,'derived','registers')]};
  cards.sm={
    sm:[metric('fp32','FP32 CUDA Core',128,'个','每个 SM；每分区 32 个','reference','cuda',S.course),metric('tensor','Tensor Core',4,'个','每个 SM；每分区 1 个','reference','tensor',S.course),metric('scheduler','Warp 调度器',4,'个','每个 SM 的四个执行分区','reference','scheduler',S.course),metric('registers','32-bit 寄存器',65536,'条','等价于 256 KiB 寄存器容量','reference','registers'),metric('shared','Shared 上限',228,'KiB','从 256 KiB 统一池中划分','reference','shared'),metric('warps','驻留 Warp 上限',64,'个','最多 2,048 个驻留线程','reference','warpPool')],
    gpu:[fp32,tensor,derived('scheduler','Warp 调度器合计',t.schedulers,'个',4,'scheduler'),derived('registers','32-bit 寄存器合计',t.registers,'条',65536,'registers'),metric('shared','Shared 上限之和',number(t.sharedKiB/1024),'MiB',`${n} × 228 KiB，分布式容量`,'derived','shared'),derived('warps','驻留 Warp 上限之和',t.warps,'个',64,'warpPool')]
  };
  cards.shared={
    sm:[metric('banks','Shared bank',32,'个','每个 SM 的 CUDA 共享内存模型','reference','banks',S.shared),metric('unified','L1 / Shared 统一池',256,'KiB','两种用途共享的总容量','reference','shared'),metric('shared','Shared carveout 上限',228,'KiB','属于 256 KiB 统一池的一部分','reference','shared'),metric('cta-shared','单 CTA Shared 上限',227,'KiB','另有 1 KiB / CTA 系统保留','reference','shared'),metric('word','地址映射 word',4,'字节','32 bit；不是 bank 的总容量','reference','address',S.shared),metric('named-barrier','CTA 命名屏障',16,'个 / CTA','PTX 编程上限，非物理引擎数量','reference','barrier',S.barrier)],
    gpu:[derived('banks','Bank 实例之和',t.sharedBanks,'个',32,'banks'),metric('unified','分布式统一池',number(t.unifiedKiB/1024),'MiB',`${n} × 256 KiB，独立 SM 容量之和`,'derived','shared'),metric('shared','Shared 上限之和',number(t.sharedKiB/1024),'MiB',`${n} × 228 KiB，不能跨 SM 统一分配`,'derived','shared'),sms,metric('cta-shared','单 CTA Shared 上限',227,'KiB / CTA','局部限制保持不变，不能乘 SM 数','reference','shared'),metric('word','地址映射 word',4,'字节','单次标量示例的字大小','reference','address',S.shared)]
  };
  cards.registers={
    sm:[metric('registers','32-bit 寄存器',65536,'条','每个 SM 的分配资源','reference','registerFile'),metric('capacity','寄存器文件容量',256,'KiB','65,536 条 × 4 字节','reference','registerFile'),metric('partitions','执行分区 SMSP',4,'个','功能分区，不是物理 register bank','reference',undefined,S.whitepaper),metric('partition-registers','每分区寄存器',16384,'条','16,384 × 32 bit = 64 KiB','reference',undefined,S.whitepaper),metric('thread-limit','每线程寄存器上限',255,'条 / 线程','局部上限，不能按 SM 数放大','reference','registerFile'),metric('warps','驻留 Warp 上限',64,'个','还受实际寄存器用量等约束','reference','registerFile')],
    gpu:[derived('registers','32-bit 寄存器合计',t.registers,'条',65536,'registerFile'),metric('capacity','分布式寄存器容量',number(t.registerBytes/1048576),'MiB',`${n} × 256 KiB，独立文件之和`,'derived','registerFile'),derived('partitions','执行分区合计',t.partitions,'个',4),sms,metric('thread-limit','每线程寄存器上限',255,'条 / 线程','局部限制保持不变','reference','registerFile'),derived('warps','驻留 Warp 上限之和',t.warps,'个',64,'registerFile')]
  };
  cards.warp={
    sm:[metric('warps','驻留 Warp 上限',64,'个','资源上下文容量，不是每周期执行数','reference','warpPool'),metric('threads','驻留线程上限',2048,'线程','64 Warp × 32 线程','reference','warpPool'),metric('blocks','驻留线程块上限',32,'CTA','受线程、寄存器与 shared 同时约束','reference','warpPool'),metric('schedulers','Warp 调度器',4,'个','每个执行分区 1 个','reference','scheduler',S.course),metric('scheduler-slots','每调度器 Warp 槽',16,'个','Hopper 每调度器的上下文槽','reference','scheduler',S.course),metric('lanes','Warp 线程宽度',32,'线程 / Warp','逻辑线程分组','reference','simt',S.course)],
    gpu:[derived('warps','驻留 Warp 上限之和',t.warps,'个',64,'warpPool'),derived('threads','驻留线程上限之和',t.threads,'线程',2048,'warpPool'),derived('blocks','驻留线程块上限之和',t.blocks,'CTA',32,'warpPool'),derived('schedulers','Warp 调度器合计',t.schedulers,'个',4,'scheduler'),metric('scheduler-slots','每调度器 Warp 槽',16,'个','局部组织保持不变','reference','scheduler',S.course),metric('lanes','Warp 线程宽度',32,'线程 / Warp','逻辑线程宽度，不能乘 SM 数','reference','simt',S.course)]
  };

  rows.package=[...productRows,...storageRows.slice(0,4),...warpRows.slice(0,3)];
  rows.die=[...productRows,...computeRows,...storageRows,...warpRows.slice(0,3)];
  rows.sm=[...productRows.filter(x=>['sm','fp32','tensor','l2'].includes(x.id)),...computeRows,...storageRows,...warpRows];
  rows.shared=[...storageRows.filter(x=>['unified','shared-capacity','shared-banks'].includes(x.id)),row('word','bank 地址映射粒度','32 bit / 4 字节','局部映射规则','连续 word 映射到连续 bank，不代表 SRAM bank 总容量','reference',S.shared,'address'),row('cta-shared','单 CTA 共享内存上限','227 KiB / CTA','局部限制，不能相加','每 CTA 额外 1 KiB 系统保留；各内核受实际 carveout 限制','reference',S.tuning,'banks'),row('barriers','CTA 命名 barrier','16 个 / CTA','非物理单元总数','PTX barrier 0–15；不等于 mbarrier 对象数量','reference',S.barrier,'barrier'),...computeRows.filter(x=>x.id==='tma'),row('bank-capacity','物理 SRAM bank 容量 / 端口','未公开固定容量 / 端口数','未核实','不能用 carveout 容量 ÷ 32 推断物理 SRAM 实现','unknown',S.shared,'bank')];
  rows.registers=[...storageRows.slice(0,2),row('partitions','SM 执行分区 SMSP','4 个 / SM',quantity(t.partitions,'个'),`${n} × 4；不是寄存器物理 bank 数`,'derived',S.whitepaper,'registerBank'),row('partition-registers','每执行分区寄存器','16,384 条 × 32 bit = 64 KiB','局部划分，已含在文件容量中','4 分区 × 16,384 条 = 65,536 条 / SM','reference',S.whitepaper,'registerBank'),row('register-thread','单线程寄存器上限','255 条 / 线程','局部限制，不能相加','实际分配受编译器、粒度与驻留情况约束','reference',S.tuning,'registerFile'),row('register-block','单 CTA 寄存器上限','65,536 条 / CTA','局部限制，不能相加','一个线程块不能占用多个 SM 的寄存器文件','reference',S.whitepaper,'registerFile'),...warpRows.slice(0,2),row('register-ports','物理 register bank / 读写端口','未公开具体数量','未公开具体数量','图中 bank 和读取路径只是功能示意','unknown',S.course,'registerBank'),row('operand-collectors','操作数收集缓冲器数量','未公开具体数量','未公开具体数量','不从示意节点推断物理实现','unknown',S.course,'operand')];
  rows.warp=[...warpRows,...computeRows.filter(x=>['partitions','schedulers','dispatch','scoreboard-physical'].includes(x.id)),row('instruction-l0','L0 指令缓存功能块','4 个 / SM（架构图）',quantity(n*4,'个功能块'),`${n} × 4 为图示功能块折算，容量未公开`,'reference',S.whitepaper,'fetch'),row('instruction-l1','L1 指令缓存功能块','1 个 / SM（架构图）',quantity(n,'个功能块'),'图示功能块折算，容量未公开','reference',S.whitepaper,'fetch'),row('barrier-limit','CTA 命名 barrier','16 个 / CTA','非物理单元总数','编程资源上限；不等于记分牌或 mbarrier 数量','reference',S.barrier,'simt')];

  return {gpuName:gpu.name,levelTitle:levels[level].name,defaultScope:['package','die'].includes(level)?'gpu':'sm',
    scopes:['package','die'].includes(level)?[{id:'gpu',label:'全 GPU'}]:[{id:'sm',label:'单个 SM'},{id:'gpu',label:'全 GPU 汇总'}],
    summary:cards[level],rows:rows[level],
    note:level==='shared'?'256 KiB 是 L1 / Texture / Shared 统一容量；228 KiB 是可划分给 shared 的上限，二者不能相加。32 个 bank 也不是 32 个寄存器 bank。':level==='registers'?'一条寄存器为 32 bit = 4 字节。SMSP 执行分区与物理寄存器 bank 是不同概念；未公开的 bank、端口与操作数缓冲器数不由图形推断。':level==='warp'?'Warp 槽表示驻留上下文；驻留、就绪、发射和执行是不同状态。各项驻留上限受同一批资源约束，不能保证同时达到。七个演示阶段不是七个物理流水级。':'统计数量来自型号资料、架构参考或明确公式；3D 方块、内存堆叠与连线的数量经过简化，不作为计数依据。',
    scopeNote:`全 GPU 汇总以 ${n} 个启用 SM 为基数。寄存器、L1 / shared、bank 与驻留槽的合计仍分布在各个 SM 内，不能作为一个跨 SM 统一分配的资源池；架构推算不代表实测占用率。`};
}
