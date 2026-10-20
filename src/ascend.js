import { colorFor } from './palette.js';

// Counts describe the named research configurations, not every board carrying
// the same chip name. Local buffers belong to AIC or AIV, never a pooled SM.
const GUIDE = 'https://www.hiascend.com/doc_center/source/zh/CANNCommunityEdition/81RC1alpha002/devguide/opdevg/ascendcopdevg/CANN%E7%A4%BE%E5%8C%BA%E7%89%88%208.1.RC1.alpha002%20Ascend%20C%E7%AE%97%E5%AD%90%E5%BC%80%E5%8F%91%E6%8C%87%E5%8D%97%2001.pdf';
const PTO = 'https://www.hiascend.com/document/detail/en/CANNCommunityEdition/910/compiler/ptoisa/docs/isa/TASSIGN.md';
const commonSources = [
  { title:'CANN · Ascend C 算子开发指南', url:GUIDE, label:'§4：AIC/AIV 分离、Scalar、MTE、片上缓冲与事件同步', kind:'华为官方架构文档' },
  { title:'CANN PTO ISA · TASSIGN', url:PTO, label:'Atlas A2/A3 的 UB、L1、L0A/B/C、Bias 与 FBuffer 编译器容量表', kind:'华为官方指令集文档' },
  { title:'Parallel Scan on Ascend AI Accelerators', url:'https://arxiv.org/html/2505.15112v1#S6', label:'华为研究者的 910B4 实验：20 Cube、40 Vector、800 GB/s', kind:'华为作者一手研究' },
  { title:'DualMap · Experimental Setup', url:'https://arxiv.org/html/2602.06502v1#S4.SS1', label:'华为与华中科技大学实验平台：910B4 配备 32 GB HBM', kind:'一手研究配置' },
  { title:'Huawei CloudMatrix384 · Ascend 910C', url:'https://arxiv.org/html/2506.12708v1#S3.SS3.SSS1', label:'§3.3.1：双 die、每 die 24 AIC/48 AIV、128 GB、3.2 TB/s', kind:'华为作者一手架构论文' },
  { title:'昇腾 · NPU 卡虚拟化硬切分参考实践', url:'https://www.hiascend.com/developer/techArticles/20251212-1', label:'Atlas A2 推理产品存在 32/64 GB 配置；不能仅凭系列名确定内存', kind:'昇腾官方技术文章' },
  { title:'CANN · 芯片 SoC 型号获取', url:'https://www.hiascend.com/document/detail/zh/CANNCommunityEdition/900/devaids/optool/docs/zh/quick_start/installation_guide.md', label:'A2 的 Ascend910B4 与 A3 的 Ascend910_9392 等 SoC 命名方法', kind:'华为官方工具文档' }
];

export const ASCEND_SOURCES = {
  'ascend-910b4': commonSources.map(source=>({...source})),
  'ascend-910c': commonSources.map(source=>({...source}))
};

export const ASCEND_PROFILES = {
  'ascend-910b4': {
    id:'ascend-910b4', name:'910B4', vendor:'昇腾', family:'davinci', architecture:'Da Vinci', type:'NPU',
    formFactor:'32 GB 研究配置', memoryGB:32, memoryType:'HBM', memoryBandwidth:'800 GB/s',
    nvlinkBandwidth:'HCCS · 带宽待核实', activeSMs:null, aiCores:20, cubeCores:20, vectorCores:40, dies:null,
    subtitle:'沿着数据搬运，理解达芬奇。',
    description:'以公开研究中的 32 GB 910B4 为参考，探索 20 个 AIC、40 个 AIV，以及矩阵与向量计算各自的片上缓冲。',
    focus:'20 AIC + 40 AIV · 32 GB 研究配置', accent:'#edbc67',
    configurationNote:'采用论文中的 32 GB HBM / 800 GB/s 配置；不代表所有同名板卡。'
  },
  'ascend-910c': {
    id:'ascend-910c', name:'910C', vendor:'昇腾', family:'davinci', architecture:'Da Vinci', type:'NPU',
    formFactor:'双 die 研究配置', memoryGB:128, memoryType:'HBM', memoryBandwidth:'3.2 TB/s',
    nvlinkBandwidth:'UB 互联 · 系统相关', activeSMs:null, aiCores:48, cubeCores:48, vectorCores:96, dies:2,
    subtitle:'两颗计算裸片，共同推进一次计算。',
    description:'采用 CloudMatrix384 论文中的双 die 配置：整包 48 个 AIC、96 个 AIV 与 128 GB HBM，分别追踪矩阵、向量与跨裸片数据路径。',
    focus:'双 die · 48 AIC + 96 AIV · 128 GB', accent:'#d08cde',
    configurationNote:'采用华为 CloudMatrix384 论文配置；整包统计与单 die 统计分别标明。'
  }
};

export const ASCEND_LEVELS = {
  package:{name:'NPU 封装总览',en:'NPU PACKAGE',index:'01',title:'从封装，走进昇腾计算系统。',default:'gpu'},
  die:{name:'计算阵列',en:'COMPUTE ARRAY',index:'02',title:'矩阵与向量，各自分工。',default:'gpc'},
  sm:{name:'AI Core 计算组',en:'AIC / AIV',index:'03',title:'看清 Cube、Vector 与搬运的协作。',default:'tensor'},
  shared:{name:'片上存储',en:'LOCAL BUFFERS',index:'04',title:'为不同计算单元准备不同的数据。',parent:'sm',default:'banks'},
  registers:{name:'矩阵缓冲',en:'CUBE BUFFERS',index:'05',title:'追踪矩阵进入 L0，再完成累加。',parent:'sm',default:'registerFile'},
  warp:{name:'任务流水与同步',en:'PIPELINES & EVENTS',index:'06',title:'沿着指令队列，理解并行与等待。',parent:'sm',default:'scheduler'}
};

const component = (level,title,en,icon,description,stats,source=0,extra={})=>({
  level,title,shortTitle:title,en,icon,subtitle:description,description,stats,source,
  insight:'3D 表达功能关系；几何数量、位置和连线不表示物理楼层图或时钟周期。',...extra
});

export function getAscendComponents(gpuOrId) {
  const gpu=typeof gpuOrId==='string'?ASCEND_PROFILES[gpuOrId]:gpuOrId;
  if(!gpu || !ASCEND_PROFILES[gpu.id]) return {};
  const isC=gpu.id==='ascend-910c', productSource=isC?4:2;
  const result={
    gpu:component('package',`昇腾 ${gpu.name} NPU`,'DAVINCI NPU','chip','通过 AIC 矩阵核与 AIV 向量核协同处理 AI 算子。',[['架构','Da Vinci'],['AIC / AIV',`${gpu.cubeCores} / ${gpu.vectorCores}`],['配置',gpu.formFactor]],productSource,{next:'die',nextLabel:'进入计算阵列',insight:gpu.configurationNote}),
    hbm:component('package','HBM 高带宽存储','HIGH BANDWIDTH MEMORY','memory','全局内存保存权重、激活与中间结果；计算前先搬入相应片上缓冲。',[['参考容量',`${gpu.memoryGB} GB`],['参考带宽',gpu.memoryBandwidth],['口径',isC?'整包；每 die 64 GB':'32 GB 研究配置']],isC?4:3,{insight:isC?'论文给出整包 8 个 16 GB 堆栈；布局仅为连接示意。':'容量采用 DualMap 实验配置，带宽采用 Parallel Scan 研究配置；不由几何方块反推堆栈数。'}),
    nvlink:component('package',isC?'跨 die 与 UB 系统互联':'HCCS 系统互联',isC?'DIE / SYSTEM INTERCONNECT':'HCCS INTERCONNECT','link','让多个计算设备交换张量；具体带宽须区分方向、封装和整机拓扑。',[['链路',isC?'die 间 / 系统 UB':'HCCS'],['带宽',isC?'die 间 270 GB/s / 方向':'未逐项核实'],['范围',isC?'CloudMatrix384 配置':'依实际系统']],isC?4:5,{insight:'系统 Unified Bus 的缩写 UB 与核内 Unified Buffer 同名缩写，但属于不同层级。'}),
    pcie:component('package','主机与设备 I/O','HOST / DEVICE I/O','server','主机提交计算任务，并通过设备 I/O 完成输入、模型加载和结果回传。',[['连接','Host ↔ NPU'],['通道规格','依板卡核实'],['图示','逻辑路径']],6),
    substrate:component('package','封装与基板','PACKAGE & SUBSTRATE','layers','计算芯片、存储与系统接口由封装和基板连接。',[['器件','计算 / 存储 / I/O'],['展示','功能封装示意'],['制造尺寸','未建模']],productSource),
    gpc:component('die','AIC / AIV 计算阵列','AIC / AIV ARRAY','grid','矩阵计算和向量计算使用分离的核，由系统调度协同推进。',[['AIC',`${gpu.cubeCores} 个`],['AIV',`${gpu.vectorCores} 个`],['每组参考','1 AIC + 2 AIV']],productSource,{next:'sm',nextLabel:'展开一个计算组',insight:isC?'每 die 24 AIC + 48 AIV，整包相加为 48 + 96；阵列图为逻辑组织。':'20 AIC + 40 AIV 来自华为研究者的 910B4 实验环境；阵列排布并非芯片平面图。'}),
    l2:component('die','L2 核外共享缓存','L2 CACHE','layers','缓存全局内存访问，在 HBM 与计算核之间复用数据。',[['范围','多个核共享'],['准确容量','未逐项核实'],['作用','减少重复 HBM 访问']],0,{insight:'缓存容量未按其他 910 型号移植，也不由 HBM 容量推算。'}),
    sm:component('die','一个 AIC / AIV 计算组','AIC + TWO AIV','chip','这里并列展示一个 AIC 与两个 AIV；它们拥有各自的控制和局部存储。',[['矩阵侧','1 AIC'],['向量侧','2 AIV'],['存储','分别管理']],productSource,{next:'sm',nextLabel:'展开计算组',insight:'“计算组”是便于浏览的逻辑视图，不代表 NVIDIA SM；AIC 与 AIV 之间通常经 GM 交换数据。'}),
    tensor:component('sm','Cube 矩阵计算','CUBE / AIC','bolt','从 L0A、L0B 读取矩阵，在 L0C 中累加与保存结果。',[['归属','AIC'],['输入','L0A / L0B'],['输出 / 累加','L0C']],0,{next:'registers',nextLabel:'探索 Cube 的缓冲'}),
    cuda:component('sm','Vector 向量计算','VECTOR / AIV','grid','对 UB 中的数据执行向量操作，承担激活、归约和逐元素处理。',[['归属','AIV'],['局部数据','Unified Buffer'],['并行模型','SIMD 向量指令']],0),
    shared:component('sm','L1 与 UB 局部存储','L1 / UNIFIED BUFFER','memory','L1 服务 AIC 矩阵侧，UB 服务 AIV 向量侧，两者各自管理。',[['每 AIC L1','512 KiB 参考'],['每 AIV UB','192 KiB 参考'],['合并资源池','不适用']],1,{next:'shared',nextLabel:'进入片上存储',insight:'这些是 A2/A3 编译器容量参考；UB 不是 CUDA 共享内存，不能套用 32-bank Warp 实验。'}),
    registers:component('sm','Scalar 标量控制','SCALAR CONTROL','layers','执行地址与循环控制，并向计算和搬运队列提交指令。',[['归属','AIC / AIV 各自控制'],['职责','地址 / 分支 / 发射'],['寄存器物理数量','未公开核实']],0,{next:'warp',nextLabel:'查看指令流水'}),
    scheduler:component('sm','Scalar 与队列控制','SCALAR / QUEUE CONTROL','flow','按指令类型分发工作，用事件协调不同流水之间的数据依赖。',[['计算队列','Cube / Vector'],['搬运队列','MTE'],['同步','事件 / Barrier']],0,{next:'warp',nextLabel:'追踪任务流水'}),
    lsu:component('sm','MTE1 局部装载','MTE1 LOCAL LOADING','link','将 AIC 的 L1 矩阵块装入 L0A 与 L0B，供 Cube 使用。',[['来源','AIC L1'],['目的','L0A / L0B'],['作用','矩阵侧局部装载']],0,{next:'registers',nextLabel:'查看矩阵装载路径'}),
    tma:component('sm','MTE2 数据搬入','MTE2 GLOBAL → LOCAL','flow','把 GM 的张量搬进 AIC 的 L1 或 AIV 的 UB，搬运可与计算重叠。',[['矩阵侧','GM → L1'],['向量侧','GM → UB'],['使用前','确认搬运完成']],0,{next:'shared',nextLabel:'探索搬入与缓冲'}),
    barrier:component('sm','事件与流水同步','EVENT SYNCHRONIZATION','target','消费者在数据就绪后继续；队列内和队列间采用对应的同步机制。',[['队列内','PipeBarrier'],['队列间','SetFlag / WaitFlag'],['跨核','对应 CrossCore 同步']],0,{next:'warp',nextLabel:'查看依赖与同步'}),
    banks:component('shared','AIC 的 L1 Buffer','AIC L1 BUFFER','memory','矩阵侧的输入中转缓冲，减少重复访问全局内存。',[['每 AIC','512 KiB 参考'],['下一站','L0A / L0B'],['搬运','MTE1']],1,{next:'registers',nextLabel:'继续进入 L0 缓冲'}),
    bank:component('shared','AIV 的 Unified Buffer','AIV UNIFIED BUFFER','layers','向量侧保存输入、输出和中间张量，由程序安排复用。',[['每 AIV','192 KiB 参考'],['输入 / 输出','MTE2 / MTE3'],['计算','Vector']],1,{insight:'这里展示缓冲与数据块，不声称具体 SRAM bank 数、端口数或寄存器容量。'}),
    address:component('shared','GM 到局部缓冲','GLOBAL → LOCAL MEMORY','grid','张量从 GM 分块搬入 L1 或 UB，再供相应计算核消费。',[['矩阵侧','GM → L1'],['向量侧','GM → UB'],['发起后','仍需确认完成']],0),
    registerFile:component('registers','L0C 结果与累加缓冲','L0C ACCUMULATOR BUFFER','memory','保存 Cube 的累加输入和矩阵输出，经 FixPipe 送往 GM 或 L1。',[['每 AIC','128 KiB 参考'],['输入','初始值 / 上一轮累加'],['输出路径','FixPipe']],1,{insight:'L0C 是矩阵缓冲，不是 CUDA 线程寄存器文件；不统计 32-bit 线程寄存器条目。'}),
    registerBank:component('registers','L0A / L0B 矩阵输入','L0A / L0B OPERAND BUFFERS','layers','分别保存左矩阵与右矩阵，供 Cube 读取。',[['每 AIC L0A','64 KiB 参考'],['每 AIC L0B','64 KiB 参考'],['容量关系','两个独立缓冲']],1),
    operand:component('registers','矩阵操作数装载','OPERAND TILE LOADING','flow','MTE1 将矩阵块从 L1 搬到 L0A 与 L0B，完成后 Cube 才读取。',[['来源','L1'],['目的','L0A / L0B'],['计算','Cube 矩阵乘加']],0),
    writeback:component('registers','结果搬出与写回','FIXPIPE / MTE3 WRITEBACK','back','矩阵结果经 FixPipe 搬出；向量结果由 MTE3 从 UB 写回 GM。',[['Cube 侧','L0C → FixPipe → GM/L1'],['Vector 侧','UB → MTE3 → GM'],['完成','遵循依赖同步']],0),
    spill:component('registers','GM 中间张量暂存','GLOBAL WORKSPACE','external','片上放不下或需要跨核交换的中间张量，可以放入 GM 工作区。',[['位置','Global Memory'],['用途','中间张量 / 核间交换'],['与寄存器溢出','不同概念']],0,{insight:'工作区需要软件显式安排；本图不把它等同于 NVIDIA 线程 local memory 或寄存器 spill。'}),
    warpPool:component('warp','分类指令队列','INSTRUCTION QUEUES','grid','Cube、Vector 和搬运指令进入对应队列，同一队列保持规定的执行顺序。',[['矩阵','Cube Queue'],['向量','Vector Queue'],['搬运','MTE Queue']],0,{insight:'展示指令类别与依赖，不存在本页所模拟的 32 线程 Warp；队列物理深度未核实。'}),
    fetch:component('warp','指令取入与缓存','INSTRUCTION FETCH','book','代码从系统内存进入指令缓存，Scalar 读取并解释执行需求。',[['来源','GM 中的代码'],['缓存','ICache'],['容量','依型号核实']],0),
    scoreboard:component('warp','事件同步模块','EVENT SYNCHRONIZATION','check','跟踪队列间的完成关系，在生产者完成后解除消费者的等待。',[['队列内','PipeBarrier'],['队列间','SetFlag / WaitFlag'],['物理事件槽数','未逐项核实']],0),
    dispatch:component('warp','指令分类分发','INSTRUCTION DISPATCH','flow','Scalar 将非标量指令发往对应计算或搬运队列。',[['矩阵','Cube 流水'],['向量','Vector 流水'],['搬运','MTE 流水']],0),
    execute:component('warp','Cube / Vector 执行','CUBE / VECTOR EXECUTION','bolt','两类计算核处理各自的局部数据，独立推进满足依赖的工作。',[['AIC','矩阵乘加'],['AIV','向量处理'],['配合','同步与 GM 数据交换']],0),
    simt:component('warp','流水依赖与完成','PIPELINE DEPENDENCIES','target','计算、搬入与搬出能重叠，但必须满足数据就绪和缓冲复用条件。',[['数据流','搬入 → 计算 → 搬出'],['优化','Double Buffer'],['时序','功能步骤，非周期']],0)
  };
  for(const [id,value] of Object.entries(result))value.color=colorFor(id);
  return result;
}

const step=(id,label,component,detail)=>({id,label,component,detail});
export const ASCEND_FLOWS = {
  package:{title:'一次 NPU 请求的存储与计算路径',summary:'HBM 供给数据，计算核完成算子，结果写回或参与设备间通信。',steps:[
    step('memory','读 HBM','hbm','权重和激活从全局内存取出。'),step('compute','进入计算域','gpu','AIC 与 AIV 处理各自的算子部分。'),step('store','写回 HBM','hbm','结果和中间张量按需要写回全局内存。'),step('link','设备间交换','nvlink','通信路径依封装和系统拓扑选择，不能用核内 UB 容量衡量。'),step('host','主机返回','pcie','请求控制与最终结果通过主机设备接口交换。')
  ]},
  die:{title:'从全局存储到分离计算核',summary:'L2 缓解全局访问，AIC 与 AIV 使用各自的局部缓冲。',steps:[
    step('hbm','读取张量','hbm','张量从 HBM 的 GM 地址空间读取。'),step('cache','L2 复用','l2','命中的数据可以减少 HBM 访问。'),step('array','调度计算阵列','gpc','工作划分到可用 AIC 与 AIV。'),step('core','核内执行','sm','矩阵侧使用 L1/L0，向量侧使用 UB。'),step('result','全局交换','hbm','跨核张量经 GM 交换，遵循对应同步关系。')
  ]},
  sm:{title:'AIC 与 AIV 怎样分工',summary:'展示一个 AIC 和两个 AIV 的逻辑组合，每类核独立控制自己的数据路径。',steps:[
    step('scalar','Scalar 发射','scheduler','各核的 Scalar 处理控制并提交计算与搬运指令。'),step('input','MTE2 搬入','tma','矩阵块进入 L1，向量块进入 UB。'),step('local','局部准备','shared','两类缓冲分别管理，不能把容量合成一个资源池。'),step('cube','Cube 计算','tensor','矩阵输入通过 L0A/B 送入 Cube，结果累加到 L0C。'),step('vector','Vector 计算','cuda','AIV 对 UB 中的张量完成向量处理。'),step('complete','事件协调','barrier','先确认结果就绪，再启动有依赖的消费或搬出。')
  ]},
  shared:{title:'GM、L1 与 UB 的不同路径',summary:'矩阵与向量缓冲分属不同核，异步搬运通过同步机制协调。',steps:[
    step('gm','读取 GM','address','按数据块计划读取全局张量。'),step('mte2','MTE2 搬入','tma','矩阵侧送到 L1，向量侧送到 UB。'),step('l1','AIC L1 暂存','banks','L1 内矩阵块可继续送到 L0A/B。'),step('ub','AIV UB 处理','bank','UB 保存 Vector 输入、输出与中间值。'),step('async','搬运与计算重叠','tma','在独立缓冲块之间安排异步搬运与计算。'),step('sync','确认数据就绪','barrier','缓冲复用和消费前，等待相应完成事件。')
  ]},
  registers:{title:'Cube 的矩阵输入与累加过程',summary:'沿 L1 → L0A/B → Cube → L0C → FixPipe 追踪一个矩阵块。',steps:[
    step('load','装载矩阵块','operand','MTE1 从 L1 取出准备好的输入块。'),step('ab','分离 A / B 输入','registerBank','L0A 保存左矩阵，L0B 保存右矩阵。'),step('acc','L0C 累加','registerFile','Cube 执行矩阵乘加并把中间结果保留在 L0C。'),step('fix','FixPipe 搬出','writeback','结果经 FixPipe 返回 GM 或 L1，并可执行相应格式转换。'),step('workspace','必要时暂存 GM','spill','跨核或更大的中间张量使用全局工作区；这不是线程寄存器溢出。')
  ]},
  warp:{title:'指令队列与事件如何配合',summary:'按依赖展示执行步骤；不对应 NVIDIA Warp，也不预测真实时钟。',steps:[
    step('fetch','取入指令','fetch','代码经指令缓存供给 Scalar。'),step('scalar','标量控制','scheduler','Scalar 计算地址与控制参数。'),step('dispatch','分类分发','dispatch','计算和搬运指令发往相应队列。'),step('queue','队列等待','warpPool','不同队列可并行推进各自满足依赖的指令。'),step('event','事件就绪','scoreboard','等待需要的搬运和计算完成条件。'),step('execute','执行计算','execute','Cube 或 Vector 读取已准备的局部数据。'),step('store','结果搬出','writeback','Cube 使用 FixPipe，Vector 使用 MTE3。'),step('sync','复用缓冲','simt','同步确认之后，下一块数据可安全复用缓冲。')
  ]}
};

const LOCAL = Object.freeze({l1KiB:512,ubKiB:192,l0AKiB:64,l0BKiB:64,l0CKiB:128,biasKiB:1,fixKiB:2});
const format=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});

export function getAscendResourceTotals(id) {
  const gpu=ASCEND_PROFILES[id];
  if(!gpu)return null;
  return {
    aiCores:gpu.aiCores,cubeCores:gpu.cubeCores,vectorCores:gpu.vectorCores,dies:gpu.dies,
    memoryGB:gpu.memoryGB,smCount:null,fp32:null,tensor:null,registers:null,registerBytes:null,
    sharedKiB:null,unifiedKiB:null,sharedBanks:null,warps:null,threads:null,blocks:null,
    l1KiB:gpu.cubeCores*LOCAL.l1KiB,ubKiB:gpu.vectorCores*LOCAL.ubKiB,
    l0AKiB:gpu.cubeCores*LOCAL.l0AKiB,l0BKiB:gpu.cubeCores*LOCAL.l0BKiB,l0CKiB:gpu.cubeCores*LOCAL.l0CKiB,
    biasKiB:gpu.cubeCores*LOCAL.biasKiB,fixKiB:gpu.cubeCores*LOCAL.fixKiB
  };
}

export function getAscendResourceReport(id,requestedLevel='package') {
  const gpu=ASCEND_PROFILES[id];
  if(!gpu)return null;
  const level=Object.hasOwn(ASCEND_LEVELS,requestedLevel)?requestedLevel:'package';
  const t=getAscendResourceTotals(id),isC=id==='ascend-910c',sources=ASCEND_SOURCES[id];
  const research=sources[isC?4:2],memorySource=sources[isC?4:3],arch=sources[0],capacity=sources[1];
  const compound=(source,...related)=>({...source,related});
  const metric=(id,label,value,unit,detail,status,component,source)=>({id,label,value:value===null?'未核实':typeof value==='number'?format(value):value,unit:value===null?'':unit,detail,status,component,source});
  const row=(id,label,local,total,basis,status,component,source)=>({id,label,local,total,basis,status,component,source});
  const aggregate=(key,label,component,unit='MiB')=>metric(key,label,t[key]/1024,unit,`${key==='ubKiB'?gpu.vectorCores:gpu.cubeCores} ${key==='ubKiB'?'AIV':'AIC'} × ${LOCAL[key]} KiB；分布式容量`,'derived',component,compound(capacity,research));
  const aic=metric('aic','AIC 矩阵核',gpu.cubeCores,'个',isC?'整包：2 die × 24 AIC':'论文中的 910B4 可用矩阵核','observed','tensor',research);
  const aiv=metric('aiv','AIV 向量核',gpu.vectorCores,'个',isC?'整包：2 die × 48 AIV':'论文中的 910B4 可用向量核','observed','cuda',research);
  const hbm=metric('hbm','HBM 容量',gpu.memoryGB,'GB',isC?'整包；每 die 64 GB':'DualMap 的 32 GB 研究配置','observed','hbm',memorySource);
  const bandwidth=metric('memory-bandwidth','HBM 带宽',isC?3.2:800,isC?'TB/s':'GB/s',isC?'整包聚合；每 die 1.6 TB/s':'Parallel Scan 论文中的配置','observed','hbm',research);
  const dies=metric('dies','计算 die',isC?2:null,'个',isC?'CloudMatrix384 的双 die 封装':'未用功能示意块数推断物理 die 数',isC?'observed':'unknown','gpu',isC?research:null);
  const l2=metric('l2','L2 容量',null,'','未把其他 910 型号的容量移植到当前配置','unknown','l2',arch);
  const l1=metric('l1','L1 Buffer',512,'KiB / AIC','每个矩阵核独立拥有的架构容量','reference','banks',capacity);
  const ub=metric('ub','Unified Buffer',192,'KiB / AIV','每个向量核独立拥有的架构容量','reference','bank',capacity);
  const l0a=metric('l0a','L0A 输入缓冲',64,'KiB / AIC','左矩阵输入；独立于 L0B','reference','registerBank',capacity);
  const l0b=metric('l0b','L0B 输入缓冲',64,'KiB / AIC','右矩阵输入；独立于 L0A','reference','registerBank',capacity);
  const l0c=metric('l0c','L0C 累加缓冲',128,'KiB / AIC','矩阵结果与累加值','reference','registerFile',capacity);
  const physical=metric('physical-registers','物理寄存器数量',null,'','未公开核实；L0A/B/C 不能当作线程寄存器','unknown','registers',arch);
  const bias=metric('bias','BiasTable Buffer',1,'KiB / AIC','A2/A3 的编译器容量参考','reference','operand',capacity);
  const fix=metric('fix','Fixpipe Buffer',2,'KiB / AIC','保存量化、转换等参数；不是输出吞吐量','reference','writeback',capacity);
  const queueDepth=metric('queue-depth','指令队列深度',null,'','公开队列类别不等于公开物理队列槽数','unknown','warpPool',arch);
  const eventSlots=metric('event-slots','物理事件槽数',null,'','同步 API 不足以确定全部物理条目数','unknown','scoreboard',arch);
  const scalar=metric('scalar','Scalar 控制域','AIC / AIV','独立','各核独立控制；不套用 Warp 调度器数量','reference','scheduler',arch);
  const mte=metric('mte','MTE 搬运类别',3,'类','MTE1 / MTE2 / MTE3；按核类型分布','reference',undefined,arch);
  const paths=metric('paths','核心计算路径',2,'类','矩阵 AIC 与向量 AIV 独立数据路径','reference','execute',arch);
  const sync=metric('sync','同步范围',2,'类','队列内与队列间；并非物理模块数量','reference','simt',arch);
  const output=metric('output','结果搬出路径',2,'类','Cube：FixPipe；Vector：MTE3','reference','writeback',arch);
  const globalRows=[
    row('aic','AIC 矩阵核',isC?'24 个 / die':'20 个 / 研究设备',`${gpu.cubeCores} 个 / 封装`,isC?'2 die × 24 AIC':'Parallel Scan 实验平台','observed','tensor',research),
    row('aiv','AIV 向量核',isC?'48 个 / die':'40 个 / 研究设备',`${gpu.vectorCores} 个 / 封装`,isC?'2 die × 48 AIV':'Parallel Scan 实验平台','observed','cuda',research),
    row('groups','AIC / AIV 逻辑组','1 AIC + 2 AIV',`${gpu.aiCores} 组`,isC?'按每 die 24 AIC + 48 AIV 组织':'20 AIC 与 40 AIV 的逻辑组合；不改称 SM','derived','sm',research),
    row('dies','计算裸片',isC?'24 AIC + 48 AIV / die':'物理 die 数未逐项核实',isC?'2 个计算 die':'未逐项核实','功能模型不用于数物理芯片',isC?'observed':'unknown','gpu',isC?research:null),
    row('hbm','HBM 容量',isC?'64 GB / die':'32 GB 研究配置',`${gpu.memoryGB} GB`,gpu.configurationNote,'observed','hbm',memorySource),
    row('memory-bandwidth','HBM 带宽',isC?'1.6 TB/s / die':'800 GB/s 研究配置',gpu.memoryBandwidth,'聚合带宽；不是 UB 或 L1 的片上吞吐量','observed','hbm',research),
    row('hbm-stacks','HBM 堆栈',isC?'4 × 16 GB / die':'数量未逐项核实',isC?'8 × 16 GB':'未逐项核实','仅 910C 论文直接给出堆栈数量',isC?'observed':'unknown','hbm',isC?research:null),
    row('l2','L2 缓存容量','多核共享','未逐项核实','不移植其他 910 型号或按 HBM 容量反推','unknown','l2',arch),
    row('die-link','跨 die 数据路径',isC?'270 GB/s / 方向':'未逐项核实',isC?'540 GB/s 双向合计':'未逐项核实','910C 论文给出的封装内链路；不能当作所有设备间链路带宽',isC?'observed':'unknown','nvlink',isC?research:null),
    row('system-link','设备间互联',isC?'CloudMatrix 系统 UB':'HCCS 相关系统路径','依整机配置','方向、端口与拓扑影响总带宽；不与 HBM 带宽混算','unknown','nvlink',isC?research:sources[5]),
    row('pcie-lanes','主机设备 I/O','依板卡 / 整机配置','未逐项核实','未把其他板卡通道规格当作当前芯片保证','unknown','pcie',sources[6])
  ];
  const buffers=[
    ['l1','L1 Buffer','l1KiB','AIC','banks'],['ub','Unified Buffer','ubKiB','AIV','bank'],
    ['l0a','L0A 输入缓冲','l0AKiB','AIC','registerBank'],['l0b','L0B 输入缓冲','l0BKiB','AIC','registerBank'],
    ['l0c','L0C 累加缓冲','l0CKiB','AIC','registerFile'],['bias','BiasTable Buffer','biasKiB','AIC','operand'],['fix','Fixpipe Buffer','fixKiB','AIC','writeback']
  ].map(([key,label,value,owner,component])=>row(key,label,`${LOCAL[value]} KiB / ${owner}`,`${format(t[value]/1024)} MiB（分布式）`,`${owner==='AIC'?gpu.cubeCores:gpu.vectorCores} ${owner} × ${LOCAL[value]} KiB；A2/A3 架构容量 × 研究核数`,'derived',key==='fix'&&level!=='registers'?undefined:component,compound(capacity,research)));
  const controlRows=[
    row('scalar','Scalar 控制','AIC / AIV 各自控制','不合算为 Warp 调度器','独立代码与控制域的架构描述','reference','scheduler',arch),
    row('mte1','MTE1 路径','AIC：L1 → L0A/L0B','物理复制数量未核实','搬运功能类别，不据示意图推算引擎数','reference',level==='registers'?'operand':'lsu',arch),
    row('mte2','MTE2 路径','GM → L1 / UB 等','物理复制数量未核实','矩阵侧与向量侧各有相应搬入路径','reference','tma',arch),
    row('mte3','MTE3 路径','AIV：UB → GM','物理复制数量未核实','向量结果搬出；不把 Cube 输出归到这条路径','reference',['shared','warp'].includes(level)?'writeback':undefined,arch),
    row('fixpipe','FixPipe 路径','AIC：L0C → GM / L1','物理复制数量未核实','矩阵结果搬出及随路转换','reference',level==='registers'?'writeback':undefined,arch),
    row('queue-depth','指令队列深度','未逐项核实','未逐项核实','分类队列存在，不代表已知每类物理槽数','unknown','warpPool',arch),
    row('event-slots','事件同步物理条目','未逐项核实','未逐项核实','队列内与队列间同步按对应接口语义执行','unknown','scoreboard',arch),
    row('physical-registers','寄存器 / 端口数量','未逐项核实','未逐项核实','不能用 L0 缓冲容量换算 CUDA 线程寄存器条目','unknown','registers',arch),
    row('physical-banks','L1 / UB 物理 bank / 端口','未逐项核实','未逐项核实','不套用 CUDA 的 32-bank 地址公式','unknown','bank',arch)
  ];
  const summary={
    package:{gpu:[aic,aiv,hbm,bandwidth,dies,l2]},
    die:{gpu:[aic,aiv,dies,hbm,aggregate('l1KiB','L1 容量之和','banks'),aggregate('ubKiB','UB 容量之和','bank')]},
    sm:{core:[metric('aic-local','矩阵侧 AIC',1,'核 / 组','每个逻辑组中的矩阵核','reference','tensor',research),metric('aiv-local','向量侧 AIV',2,'核 / 组','每个逻辑组中的向量核','reference','cuda',research),l1,ub,l0c,scalar],gpu:[aic,aiv,aggregate('l1KiB','L1 容量之和','banks'),aggregate('ubKiB','UB 容量之和','bank'),aggregate('l0CKiB','L0C 容量之和','registerFile'),physical]},
    shared:{core:[l1,ub,l0a,l0b,l0c,mte],gpu:[aggregate('l1KiB','L1 容量之和','banks'),aggregate('ubKiB','UB 容量之和','bank'),aggregate('l0AKiB','L0A 容量之和','registerBank'),aggregate('l0BKiB','L0B 容量之和','registerBank'),aggregate('l0CKiB','L0C 容量之和','registerFile'),l2]},
    registers:{core:[l0a,l0b,l0c,l1,bias,fix],gpu:[aggregate('l0AKiB','L0A 容量之和','registerBank'),aggregate('l0BKiB','L0B 容量之和','registerBank'),aggregate('l0CKiB','L0C 容量之和','registerFile'),aggregate('l1KiB','L1 容量之和','banks'),aggregate('biasKiB','Bias 缓冲之和','operand'),aggregate('fixKiB','Fixpipe 缓冲之和','writeback')]},
    warp:{core:[scalar,paths,mte,output,queueDepth,eventSlots],gpu:[aic,aiv,paths,sync,queueDepth,eventSlots]}
  };
  const rows={
    package:globalRows,
    die:[...globalRows,...buffers],
    sm:[...globalRows.slice(0,3),...buffers,...controlRows],
    shared:[...buffers,...controlRows.filter(x=>['mte1','mte2','mte3','fixpipe','physical-banks'].includes(x.id))],
    registers:[...buffers.filter(x=>x.id!=='ub'),...controlRows.filter(x=>['mte1','fixpipe','physical-registers'].includes(x.id))],
    warp:controlRows
  };
  const globalOnly=['package','die'].includes(level);
  return {
    gpuName:`昇腾 ${gpu.name}`,levelTitle:ASCEND_LEVELS[level].name,
    defaultScope:globalOnly?'gpu':'core',
    scopes:globalOnly?[{id:'gpu',label:'全 NPU 封装'}]:[{id:'core',label:'单个 AIC / AIV'},{id:'gpu',label:'全 NPU 汇总'}],
    summary:summary[level],rows:rows[level],
    scopeNote:globalOnly?(isC?'整包口径含 2 个计算 die；单 die 为 24 AIC、48 AIV、64 GB HBM。':'32 GB 910B4 研究配置；核心数与容量均标注原始来源。'):'L1/L0 属于 AIC，UB 属于 AIV；“每核”需按卡片归属读取，不能合并为统一内存池。',
    note:'核数与 HBM 参数来自明确的研究配置；片上容量采用 A2/A3 官方编译器参考。分布式容量相加不代表跨核统一分配。3D 是功能结构图，未核实的物理寄存器、bank、端口和队列深度不填数字。'
  };
}
