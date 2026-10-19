import { colorFor } from './palette.js';
export const sources = [
 { title: 'NVIDIA AI Enterprise · Hopper vGPU', label: 'H20 SXM5 96GB 产品与 MIG 配置', url: 'https://docs.nvidia.com/ai-enterprise/release-7/latest/infra-software/vgpu/reference/hopper.html', kind: 'NVIDIA 官方文档' },
 { title: 'NVIDIA Hopper Architecture In-Depth', label: 'SM、Tensor Core、TMA 与存储层级', url: 'https://developer.nvidia.com/blog/nvidia-hopper-architecture-in-depth/', kind: 'NVIDIA 技术文档' },
 { title: 'NVIDIA Hopper Tuning Guide', label: 'Hopper 编程模型、异步传输与优化', url: 'https://docs.nvidia.com/cuda/hopper-tuning-guide/index.html', kind: 'CUDA 官方文档' },
 { title: 'Dell PowerEdge XE9680', label: 'H20 96GB SXM5 与 NVLink 多卡配置', url: 'https://www.dell.com/en-hk/shop/ipovw/poweredge-xe9680', kind: '服务器厂商产品规格' },
 { title: 'CUDA C++ Best Practices Guide', label: '共享内存 bank、广播、冲突与局部内存', url: 'https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html#shared-memory-and-memory-banks', kind: 'CUDA 官方编程文档' },
 { title: 'CUDA Programming Guide', label: 'Warp、线程、寄存器与共享内存访问模型', url: 'https://docs.nvidia.com/cuda/cuda-programming-guide/index.html', kind: 'CUDA 官方编程文档' },
 { title: 'PTX ISA · Asynchronous Operations', label: 'TMA、mbarrier 与异步矩阵计算的指令语义', url: 'https://docs.nvidia.com/cuda/parallel-thread-execution/index.html', kind: 'NVIDIA 官方指令集文档' },
 { title: 'NVIDIA Nsight Compute · Profiling Guide', label: 'Warp 就绪、发射与依赖等待的可观测状态', url: 'https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html#sections-and-rules', kind: 'NVIDIA 官方性能分析文档' }
];

export const components = {
 gpu: { level:'package', icon:'chip', color:'#c5eb8b', en:'GPU DIE', title:'Hopper GPU 核心', subtitle:'计算，发生在这里。', description:'GPU 核心集成并行计算单元、片上缓存和互联逻辑。推理时，模型权重与激活数据从 HBM 进入片上存储，由 SM 中的执行单元完成计算。', stats:[['架构','Hopper'],['形态','SXM5'],['显存','96 GB HBM3']], insight:'从封装进入芯片视图，可以看到计算集群与缓存的逻辑关系。实际物理布局经过简化。', next:'die', nextLabel:'进入芯片内部', source:1 },
 hbm: { level:'package', icon:'memory', color:'#9fc3e9', en:'HIGH BANDWIDTH MEMORY', title:'HBM3 高带宽显存', subtitle:'让数据跟得上计算。', description:'HBM 把多层 DRAM 垂直堆叠，并通过中介层与 GPU 核心相连。96 GB 显存用于容纳模型权重、激活值和随上下文增长的 KV Cache。', stats:[['总容量','96 GB'],['类型','HBM3'],['用途','权重 / KV Cache']], insight:'逐 token 解码时，需要反复读取权重和 KV Cache。显存带宽可能成为性能瓶颈；本模型的六个堆栈仅用于说明连接关系。', source:0 },
 nvlink: { level:'package', icon:'link', color:'#d6abf0', en:'GPU-TO-GPU INTERCONNECT', title:'NVLink 高速互联', subtitle:'把多个 GPU 连成一个系统。', description:'NVLink 为 GPU 之间传输张量提供专用高速通道。在张量并行推理中，各 GPU 分担模型计算，并通过互联交换中间结果。', stats:[['互联','NVLink'],['作用','GPU ↔ GPU'],['场景','多卡并行']], insight:'互联带宽不等于显存带宽。多卡推理的速度同时取决于通信量、拓扑、计算和通信的重叠。', source:1 },
 pcie: { level:'package', icon:'server', color:'#e0c18a', en:'HOST INTERFACE', title:'PCIe 主机接口', subtitle:'连接 GPU 与主机。', description:'PCIe 负责 GPU 与 CPU、主机内存及其他设备之间的数据传输。模型初始化、输入上传和结果返回都可能经过这条通道。', stats:[['连接','CPU ↔ GPU'],['用途','主机数据传输'],['位置','封装 I/O']], insight:'SXM5 是模块形态。这里的金色接口表示逻辑 I/O 路径，并不代表一张 PCIe 插卡的金手指。', source:1 },
 substrate: { level:'package', icon:'layers', color:'#90b4a7', en:'PACKAGE & SUBSTRATE', title:'封装与基板', subtitle:'连接计算与存储的基础。', description:'GPU 裸片与高带宽显存通过中介层和封装布线相连，再由模块基板承载供电、信号和系统连接。', stats:[['模块','SXM5'],['结构','多层封装'],['展示','教学示意']], insight:'点击「分层展开」观察封装层级。厚度、距离和布线被放大，以方便理解，不代表制造尺寸。', source:0 },
 gpc: { level:'die', icon:'grid', color:'#c5eb8b', en:'COMPUTE CLUSTER', title:'计算集群 GPC', subtitle:'把并行计算组织起来。', description:'Hopper 将多个 SM 组织在计算集群中。SM 可以并行运行线程块，片上互联与缓存为这些计算单元提供数据。', stats:[['成员','多个 SM'],['层级','GPU → GPC → SM'],['布局','逻辑示意']], insight:'本图中的集群数量和排布是教学抽象，不用于推断 H20 的启用 SM 数或物理楼层图。', next:'sm', nextLabel:'探索一个 SM', source:1 },
 l2: { level:'die', icon:'layers', color:'#e0c18a', en:'L2 CACHE', title:'L2 二级缓存', subtitle:'在显存与 SM 之间复用数据。', description:'L2 是多个 SM 共享的片上缓存。命中缓存的数据不必再次从 HBM 读取，可以降低外部显存流量与访问延迟。', stats:[['位置','HBM 与 SM 之间'],['共享范围','整个 GPU'],['用途','数据复用']], insight:'复用率与工作负载有关。模型权重通常远大于片上缓存，因此缓存不能代替 HBM 显存容量。', source:2 },
 sm: { level:'die', icon:'chip', color:'#c5eb8b', en:'STREAMING MULTIPROCESSOR', title:'流式多处理器 SM', subtitle:'GPU 执行工作的基本单元。', description:'SM 包含线程调度器、寄存器、CUDA Core、Tensor Core 和共享内存。它调度线程束，并让不同类型的执行单元协同完成内核。', stats:[['线程束','32 个线程'],['核心','CUDA + Tensor'],['片上存储','寄存器 / 共享内存']], insight:'每个 SM 的内部结构基于 Hopper 架构参考。这里不以示意方块数量表示 H20 的精确硬件数量。', next:'sm', nextLabel:'展开 SM 微架构', source:1 },
 tensor: { level:'sm', icon:'bolt', color:'#c5eb8b', en:'4TH-GEN TENSOR CORE', title:'第四代 Tensor Core', subtitle:'矩阵乘加的专用引擎。', description:'Tensor Core 针对矩阵乘加运算设计。Hopper 增加 FP8 支持，结合 Transformer Engine，可在合适的精度策略下加速 Transformer 模型。', stats:[['代际','第四代'],['运算','矩阵乘加'],['精度示例','FP8 / BF16 / FP16']], insight:'能否用好 Tensor Core，还取决于矩阵形状、数据精度和内核实现。理论峰值不等于真实推理吞吐。', source:1 },
 cuda: { level:'sm', icon:'grid', color:'#9fc3e9', en:'CUDA CORES', title:'CUDA 通用计算核心', subtitle:'处理标量与向量计算。', description:'CUDA Core 执行常规浮点与整数运算。归一化、激活函数和数据变换等操作，需要通用执行单元与专用矩阵单元配合。', stats:[['执行方式','SIMT'],['任务','通用计算'],['调度单位','Warp']], insight:'一个 CUDA 线程并不永久绑定一个 CUDA Core。线程束由 SM 调度并分时执行指令。', source:1 },
 shared: { level:'sm', icon:'memory', color:'#e0c18a', en:'SHARED MEMORY / L1', title:'共享内存与 L1', subtitle:'把下一步要用的数据留在片上。', description:'共享内存由线程块显式管理，L1 缓存由硬件管理。Hopper 的统一片上存储资源支持两种用途；内核可配置共享内存划分，TMA 可辅助异步搬运多维数据。', stats:[['位置','SM 内部'],['访问组织','32 个共享内存 bank'],['优化','复用 / 异步搬运']], insight:'继续进入共享内存，观察 32 个 bank、地址映射和访问冲突。bank 图遵循 CUDA 的公开访问模型，存储单元与布线为功能示意。', next:'shared', nextLabel:'进入共享内存与 bank', source:2 },
 registers: { level:'sm', icon:'layers', color:'#9fc3e9', en:'REGISTER FILE', title:'线程寄存器文件', subtitle:'把正在计算的数据留在手边。', description:'每个线程的变量、地址和中间结果可以保存在寄存器中。物理寄存器资源由 SM 内驻留的线程共同分配，寄存器用量会约束可同时驻留的线程块。', stats:[['软件视角','线程私有'],['分配资源','SM 寄存器文件'],['探索','bank / 操作数 / 溢出']], insight:'Hopper 调优指南给出每 SM 65,536 个 32 位寄存器的架构参考。该值在本页用于资源预算教学，不作为 H20 产品实测或硬件保证。', next:'registers', nextLabel:'展开寄存器文件', source:2 },
 scheduler: { level:'sm', icon:'flow', color:'#d6abf0', en:'WARP SCHEDULER', title:'Warp 调度器', subtitle:'从可以推进的工作中选择下一条。', description:'调度器在已驻留的 Warp 中选择满足发射条件的指令。操作数依赖、内存等待、同步和执行资源会影响就绪状态；一个 Warp 等待时，其他就绪 Warp 可以推进。', stats:[['Warp','32 个线程'],['选择条件','依赖满足 / 资源可用'],['目标','隐藏等待延迟']], insight:'Warp 是 32 个线程组成的执行组，不是一块独立硬件。进入后可逐步观察取指、依赖检查、发射和执行；步骤仅表达因果关系，不对应真实时钟周期。', next:'warp', nextLabel:'追踪一条 Warp 指令', source:7 },
 lsu: { level:'sm', icon:'link', color:'#8fcaba', en:'LOAD / STORE UNIT', title:'加载与存储单元 LSU', shortTitle:'加载 / 存储 LSU', subtitle:'把线程地址转换成存储访问。', description:'加载与存储指令经地址计算后访问相应存储空间。共享内存访问按 bank 组织；全局内存访问会经过缓存与显存路径，二者具有不同的访问行为。', stats:[['输入','线程地址 / 数据'],['共享内存','bank 访问'],['全局内存','缓存 / HBM 路径']], insight:'LSU、bank 和地址路径在图中按功能分开。方块数量、连接线与距离不表示 H20 的实际单元数、端口数或物理布局。', next:'shared', nextLabel:'查看共享内存访问', source:4 },
 tma: { level:'sm', icon:'flow', color:'#c5eb8b', en:'TENSOR MEMORY ACCELERATOR', title:'张量内存加速器 TMA', shortTitle:'异步搬运 TMA', subtitle:'让数据搬运与计算重叠。', description:'Hopper 的 TMA 支持全局内存与共享内存之间的异步张量搬运。一个线程即可发起多维区域的传输，使线程块在搬运期间继续计算，并通过相应同步机制确认数据可用。', stats:[['路径','全局内存 ↔ 共享内存'],['张量维度','1D–5D（Hopper）'],['方式','异步搬运']], insight:'发起异步搬运不等于数据已经到达。程序必须按指令语义处理完成通知与可见性，再消费数据；图中传输流只表示功能关系。', next:'shared', nextLabel:'观察 TMA 与共享内存', source:2 },
 barrier: { level:'sm', icon:'target', color:'#d6abf0', en:'BARRIER / ASYNC COMPLETION', title:'屏障与完成通知', shortTitle:'屏障 / mbarrier', subtitle:'让消费者等到正确的数据。', description:'线程协作和异步搬运需要同步。Hopper 支持基于共享内存对象的 mbarrier 等机制，跟踪参与者到达以及相关异步事务完成，帮助程序协调生产者与消费者。', stats:[['职责','协调 / 完成检查'],['示例','mbarrier'],['关联','线程 / 异步事务']], insight:'屏障必须按相应指令与内存模型使用。它不是自动让所有 GPU 数据全局同步的开关；这里展示的是常见的生产者—消费者关系。', next:'shared', nextLabel:'查看数据就绪关系', source:6 },

 banks: { level:'shared', icon:'memory', color:'#e0c18a', en:'32 SHARED MEMORY BANKS', title:'32 个共享内存 bank', shortTitle:'32 个 bank', subtitle:'同一份片上存储，多条并行访问通路。', description:'CUDA 的共享内存访问模型将存储划分为 32 个 bank，连续的 32 位字映射到连续的 bank。对于本页每个活跃 lane 访问一个 32 位标量的示例，可以通过改变步长观察请求如何分布。', stats:[['bank 数','32'],['字大小','32 bit / 4 字节'],['连续字','映射到连续 bank']], insight:'步长以 32 位字计：1 分散到 32 个 bank；2 会产生 2 路 bank 冲突；3 又能覆盖全部 bank。同一地址的读取可广播，不按不同地址的 bank 冲突处理。该演示不覆盖向量或更宽访问。', source:4 },
 bank: { level:'shared', icon:'layers', color:'#f2cf92', en:'ONE SHARED MEMORY BANK', title:'一个共享内存 bank', shortTitle:'单个 bank', subtitle:'同 bank 的不同地址可能需要分批服务。', description:'bank 是共享内存公开访问模型中的并行组织方式。一个 Warp 的请求若落在同一个 bank 的多个不同字地址，硬件可能将其拆分处理，降低有效带宽。', stats:[['定位','片上共享内存'],['冲突条件','同 bank / 不同字地址'],['读取例外','同地址广播']], insight:'图中每个 bank 内的格子表示地址位置，不表示晶体管、真实 SRAM 阵列尺寸、容量或端口数量。精确物理实现未在本页作出假设。', source:4 },
 address: { level:'shared', icon:'grid', color:'#9fc3e9', en:'ADDRESS → BANK MAPPING', title:'地址到 bank 的映射', shortTitle:'地址映射', subtitle:'地址低位决定访问分布。', description:'在本页的 32 位标量示例中，wordAddress = byteAddress ÷ 4，bank = wordAddress mod 32。lane i 访问 baseWord + i × stride；观察步长变化即可理解冲突为什么出现。', stats:[['公式','bank = wordAddress % 32'],['步长单位','32 位字'],['演示规模','32 个活跃 lane']], insight:'不同 lane 读同一个字时可以广播；读同 bank 的不同字才产生此模型中的冲突。真实内核还需考虑访问宽度、活跃掩码与指令拆分，不能把此公式直接当作所有访问的周期预测。', source:5 },

 registerFile: { level:'registers', icon:'memory', color:'#9fc3e9', en:'SM REGISTER FILE', title:'SM 寄存器文件', shortTitle:'寄存器文件', subtitle:'线程私有，资源却由整个 SM 共享。', description:'寄存器在程序中由线程私有使用，物理容量则属于 SM 的公共执行资源。编译器决定每线程寄存器需求，硬件按线程块驻留情况分配，影响同一 SM 能容纳多少个 Warp。', stats:[['Hopper 参考','65,536 × 32 bit / SM'],['每线程上限','255 个寄存器（参考）'],['驻留 Warp 上限','64 / SM（Hopper 参考）']], insight:'资源计算器只展示寄存器预算的理论约束，忽略分配粒度、线程块数、共享内存等限制。这里的 Hopper 指南数值不是 H20 实测规格，也不预测运行时间。', source:2 },
 registerBank: { level:'registers', icon:'layers', color:'#b1ccef', en:'REGISTER BANKS · FUNCTIONAL VIEW', title:'寄存器 bank 与读取通路', shortTitle:'寄存器 bank', subtitle:'为并行执行提供操作数。', description:'寄存器文件通过内部组织和读取通路向执行单元供给操作数。此处用若干分区说明数据可以被分组读取的概念，帮助理解寄存器文件不只是一个软件变量列表。', stats:[['用途','并行操作数访问'],['图示','功能分区'],['物理 bank / 端口数','未作公开规格假设']], insight:'本图不声称 Hopper 或 H20 具有图中数量的物理寄存器 bank、端口或读取延迟。共享内存的 32-bank 映射规则也不能套用到寄存器文件。', source:2 },
 operand: { level:'registers', icon:'flow', color:'#e0c18a', en:'OPERAND READ / COLLECT', title:'操作数读取与汇集', shortTitle:'操作数汇集', subtitle:'计算开始前，先把输入备齐。', description:'一条指令需要读取来源寄存器中的操作数，并把它们送往相应的执行通路。图中的汇集节点将这种供给关系单独画出，便于追踪一次指令从寄存器到计算单元的数据流。', stats:[['输入','来源寄存器'],['输出','执行单元操作数'],['图示粒度','功能步骤']], insight:'汇集节点不代表已公开的 H20 缓冲器数量或具体实现。操作数的就绪检查、调度与读取可以相互重叠，示意顺序不等于固定硬件周期。', source:1 },
 writeback: { level:'registers', icon:'back', color:'#8fcaba', en:'RESULT WRITEBACK', title:'结果写回与依赖解除', shortTitle:'结果写回', subtitle:'一次计算的终点，也是下一次的起点。', description:'以寄存器为目标的指令完成后，结果写入对应线程的目标寄存器，后续依赖该结果的指令才有机会继续推进。存储等指令具有不同的结果和完成语义。', stats:[['寄存器指令','写入目标寄存器'],['依赖关系','结果可用后推进'],['后续','复用 / 下一条指令']], insight:'图中把写回与依赖状态更新连在一起，用于解释数据依赖。真实完成时序取决于指令类型与实现，不应把可视化的一步当作一个 GPU 时钟。', source:1 },
 spill: { level:'registers', icon:'external', color:'#d6abf0', en:'REGISTER SPILL → LOCAL MEMORY', title:'寄存器溢出与局部内存', shortTitle:'寄存器溢出', subtitle:'资源不足时，部分数据需要走存储路径。', description:'当编译器无法把所有所需值留在寄存器中时，可能把部分值溢出到线程的 local 地址空间。local memory 由设备全局内存支持，也可能经过缓存；它并不是共享内存。', stats:[['地址空间','线程 local memory'],['后端存储','设备全局内存'],['代价','额外加载 / 存储']], insight:'减少寄存器使用量可能增加驻留度，也可能引入溢出并拖慢内核。应结合编译报告与性能分析判断，不能单凭占用率高低决定优化是否有效。', source:2 },

 warpPool: { level:'warp', icon:'grid', color:'#9fc3e9', en:'RESIDENT WARPS', title:'驻留 Warp 与线程状态', shortTitle:'驻留 Warp 池', subtitle:'多组工作等待在同一个 SM 上推进。', description:'线程块分配到 SM 后，其线程被组织为每组 32 个线程的 Warp。驻留 Warp 保留执行状态与资源；一部分可能就绪，另一部分可能等待内存、数据依赖或同步。', stats:[['一个 Warp','32 个线程'],['状态示例','就绪 / 等待'],['资源','寄存器 / 线程块分配']], insight:'驻留不等于每个周期都在执行。更多可用 Warp 有助于覆盖等待，但能否发射还受依赖、指令类型和执行资源约束；Warp 也不是独立物理核心。', source:5 },
 fetch: { level:'warp', icon:'book', color:'#b1ccef', en:'INSTRUCTION FETCH / DECODE', title:'取指与译码', shortTitle:'取指 / 译码', subtitle:'找到 Warp 下一步要做的操作。', description:'执行前需要取得相应指令，并识别运算类型、来源与目标操作数。图中把取指与译码作为一个功能节点，连接 Warp 的执行状态与后续依赖检查。', stats:[['输入','执行位置 / 指令'],['识别','运算 / 寄存器 / 掩码'],['输出','待执行的操作']], insight:'这是因果流程图，没有声称 H20 的前端具有某种固定流水级数、取指宽度或延迟。实际前端与调度细节比图示更复杂。', source:1 },
 scoreboard: { level:'warp', icon:'check', color:'#e0c18a', en:'DEPENDENCY SCOREBOARD', title:'依赖记分牌 Scoreboard', shortTitle:'依赖记分牌', subtitle:'避免在输入尚未就绪时开始计算。', description:'记分牌用于理解硬件如何跟踪未满足的数据依赖：如果后续指令需要尚未返回的加载结果，它必须等待结果可用。可视化用状态灯表示这种依赖是否已解除。', stats:[['跟踪','未完成的数据依赖'],['等待示例','加载结果未返回'],['状态','等待 / 可推进']], insight:'状态灯数量只是教学示意。H20 的记分牌条目数、结构、具体检查规则与等待周期没有在此被假定；就绪也不保证立刻发射。', source:7 },
 dispatch: { level:'warp', icon:'link', color:'#d6abf0', en:'INSTRUCTION ISSUE / DISPATCH', title:'指令发射与分派', shortTitle:'指令发射', subtitle:'把选中的操作送到合适的执行通路。', description:'满足条件并被调度选中的指令，按类型进入对应执行通路。例如常规算术、加载存储和矩阵运算会使用不同资源，也可能受到这些资源是否可用的限制。', stats:[['前提','依赖满足 / 资源可用'],['目的地','相应执行通路'],['单位','Warp 指令与活跃线程']], insight:'一次发射不代表所有操作都在一个时钟内完成。图中箭头不表示发射宽度、并行管线数量或吞吐率；这些随指令与硬件实现而变化。', source:2 },
 execute: { level:'warp', icon:'bolt', color:'#c5eb8b', en:'CUDA / TENSOR / MEMORY EXECUTION', title:'执行单元与计算通路', shortTitle:'执行单元', subtitle:'指令类型，决定数据到哪里计算。', description:'普通算术由对应计算通路执行，加载与存储进入访存通路，矩阵指令使用 Tensor Core。Hopper 还支持异步的 Warpgroup 矩阵指令，需遵守专门的提交和等待语义。', stats:[['常规运算','CUDA / 整数等通路'],['存储操作','LSU / 存储层级'],['矩阵示例','Tensor Core / WGMMA']], insight:'WGMMA 的 warpgroup 涉及 4 个 Warp，而此处逐步演示的是简化的单 Warp 指令关系，不能把同一条示意流水线当作所有矩阵指令的真实执行时序。', source:6 },
 simt: { level:'warp', icon:'flow', color:'#8fcaba', en:'SIMT / ACTIVE MASK / RECONVERGENCE', title:'SIMT、活跃掩码与重汇合', shortTitle:'SIMT 与分支', subtitle:'同组线程，可以拥有不同的执行状态。', description:'Warp 的活跃掩码描述当前指令由哪些线程参与。发生分支分歧时，不同路径的线程可能分批推进；重汇合让相关线程在后续共同位置继续执行。Hopper 支持独立线程调度。', stats:[['执行组','32 个线程 / Warp'],['活跃掩码','当前参与的线程'],['分歧后','路径推进 / 重汇合']], insight:'同属一个 Warp 不等于线程之间天然满足所需同步。线程协作仍应使用正确的同步原语与活跃掩码；这里的彩色 lane 仅用于解释 SIMT 行为。', source:5 }
};

export const levelComponents = {
 package:['gpu','hbm','nvlink','pcie','substrate'],
 die:['gpc','sm','l2','hbm'],
 sm:['tensor','cuda','shared','registers','scheduler','lsu','tma','barrier'],
 shared:['banks','bank','address','lsu','tma','barrier'],
 registers:['registerFile','registerBank','operand','writeback','spill'],
 warp:['warpPool','fetch','scoreboard','scheduler','dispatch','operand','execute','writeback','simt']
};

export const levels = {
 package:{name:'封装总览',en:'PACKAGE',index:'01',title:'从一颗芯片，理解整个系统。',default:'gpu'},
 die:{name:'芯片架构',en:'GPU DIE',index:'02',title:'让计算与数据在片上相遇。',default:'gpc'},
 sm:{name:'SM 微架构',en:'SM ARCHITECTURE',index:'03',title:'深入一次矩阵计算的发生地。',default:'tensor'},
 shared:{name:'共享内存',en:'SHARED MEMORY',index:'04',title:'沿着一个地址，找到它的 bank。',parent:'sm',default:'banks'},
 registers:{name:'寄存器文件',en:'REGISTER FILE',index:'05',title:'从线程变量，走进片上寄存器。',parent:'sm',default:'registerFile'},
 warp:{name:'Warp 执行流水线',en:'WARP EXECUTION',index:'06',title:'追踪一条指令，理解等待与推进。',parent:'sm',default:'scheduler'}
};

// Data-flow walkthroughs: one ordered step list per level, used by the "演示数据流" panel
// below the 3D stage. `component` links a step to the 3D highlight and its role color.
export const flows = {
 package: {
  title:'一次推理请求在封装内的往返',
  summary:'权重从显存读出、进入 GPU 计算，结果再回到显存或经互联送往其他 GPU。',
  steps:[
   { id:'read-weights', label:'HBM 读权重', component:'hbm', detail:'模型权重与 KV Cache 常驻显存。每生成一个 token，都要重新读取这一步所需的权重与缓存。' },
   { id:'compute', label:'核心计算', component:'gpu', detail:'数据经中介层进入 GPU 裸片，SM 取出权重与激活值完成矩阵乘加等计算。' },
   { id:'write-kv', label:'写回显存', component:'hbm', detail:'计算结果与新的 KV Cache 追加写回显存，供后续 token 复用。' },
   { id:'cross-gpu', label:'多卡交换', component:'nvlink', detail:'张量并行时，各 GPU 通过 NVLink 交换中间结果（如 all-reduce），把分布的部分答案合并。' },
   { id:'host-io', label:'主机往返', component:'pcie', detail:'请求与结果在主机侧进出；模型加载和较长上下文的输入也经过这条通道。' }
  ]
 },
 die: {
  title:'数据在裸片上的走向',
  summary:'显存接口取数据，L2 复用，再分发到计算集群中的各个 SM。',
  steps:[
   { id:'hbm-in', label:'显存读出', component:'hbm', detail:'权重与激活从 HBM 接口读出。显存带宽常常是这一层最先遇到的瓶颈。' },
   { id:'l2-reuse', label:'L2 复用', component:'l2', detail:'L2 被多个 SM 共享。命中缓存的数据不必再次访问 HBM，从而降低外部显存流量和延迟。' },
   { id:'dispatch', label:'分发集群', component:'gpc', detail:'线程块被分配到计算集群内的各个 SM，SM 之间通过片上互联交换数据。' },
   { id:'sm-run', label:'SM 执行', component:'sm', detail:'SM 内的执行单元完成矩阵乘加、向量与访存操作，结果按层级向上返回。' },
   { id:'hbm-out', label:'写回显存', component:'hbm', detail:'结果经缓存合并后回到显存。模型权重远大于片上缓存，因此缓存只能缓解而不能替代显存容量。' }
  ]
 },
 sm: {
  title:'一个 SM 内部如何处理一条指令流',
  summary:'从调度器取指开始，经寄存器、执行单元、共享内存、访存与异步搬运，最后同步等待数据就绪。',
  steps:[
   { id:'issue', label:'取指调度', component:'scheduler', detail:'调度器从驻留 Warp 中挑选依赖与资源都满足的指令，取指译码后准备发射。' },
   { id:'read-regs', label:'读操作数', component:'registers', detail:'源操作数从寄存器文件读出，送往对应的执行通路。寄存器用量也会反过来限制能驻留多少 Warp。' },
   { id:'execute', label:'执行运算', component:'tensor', detail:'Tensor Core 完成矩阵乘加；归一化、激活等通用运算由 CUDA Core 承担。' },
   { id:'onchip', label:'片上复用', component:'shared', detail:'会被同一线程块反复使用的数据放进共享内存 / L1，避免重复走显存路径。' },
   { id:'memory', label:'访存', component:'lsu', detail:'加载与存储指令经 LSU 完成地址计算，访问共享内存或全局内存路径。' },
   { id:'async', label:'异步搬运', component:'tma', detail:'TMA 在全局内存与共享内存之间搬运多维数据块，搬运期间线程块可以继续计算。' },
   { id:'sync', label:'同步就绪', component:'barrier', detail:'屏障与 mbarrier 确认数据真的到达并可见，消费者才开始使用；发起搬运不等于数据已就绪。' }
  ]
 },
 shared: {
  title:'一次 Warp 访存到 32 个 bank',
  summary:'32 条 lane 各发一个请求，地址决定落在哪些 bank，冲突与否决定要分批几次。',
  steps:[
   { id:'request', label:'发起访问', component:'lsu', detail:'一个 Warp 的 32 个活跃 lane 各自发出一次对齐的 32-bit word 访存请求。' },
   { id:'map', label:'地址映射', component:'address', detail:'按 word = offset + lane × stride、bank = word mod 32 计算，地址低位决定分布到哪些 bank。' },
   { id:'banks', label:'bank 并行', component:'banks', detail:'32 个 bank 可以并行服务请求；落在不同 bank 的访问互不影响。' },
   { id:'conflict', label:'冲突与广播', component:'bank', detail:'同一 bank 上的不同字地址需要分批服务，即 bank 冲突；多个 lane 读同一个地址可以广播，不算冲突。' },
   { id:'tma-load', label:'异步搬运', component:'tma', detail:'TMA 可以把全局内存中的数据块直接搬进共享内存，让搬运与计算重叠。' },
   { id:'ready', label:'同步就绪', component:'barrier', detail:'搬运完成后由 mbarrier 通知消费者，线程块才读取这批共享内存数据。' }
  ]
 },
 registers: {
  title:'一个操作数如何走进寄存器文件',
  summary:'寄存器先按线程块分配，再按分区并行读取、汇集操作数，结果写回或溢出到 local。',
  steps:[
   { id:'allocate', label:'分配寄存器', component:'registerFile', detail:'编译器决定每线程寄存器需求，SM 在此基础上按线程块驻留情况分配物理寄存器。' },
   { id:'read', label:'并行读取', component:'registerBank', detail:'寄存器文件按内部分区并行向执行单元供给操作数，图中分区为功能示意。' },
   { id:'gather', label:'操作数汇集', component:'operand', detail:'计算开始前，源操作数被读齐并送往相应执行通路；就绪检查与读取可以相互重叠。' },
   { id:'write', label:'结果写回', component:'writeback', detail:'结果写回目标寄存器后，依赖这份数据的后续指令才可能被调度推进。' },
   { id:'spill', label:'溢出到 local', component:'spill', detail:'寄存器不够时，部分值被溢出到线程私有的 local 地址空间（由设备全局内存支撑，不是共享内存）。' }
  ]
 },
 warp: {
  title:'一条指令抵达执行单元的七个阶段',
  summary:'从取指到写回逐步推进，观察依赖未就绪时 Warp 如何等待、其他 Warp 如何顶上来。',
  steps:[
   { id:'fetch', label:'取指 / 译码', component:'fetch', detail:'取得要执行的指令，识别运算类型、源操作数与目标寄存器。' },
   { id:'scoreboard', label:'依赖检查', component:'scoreboard', detail:'记分牌跟踪未完成的依赖。源操作数未就绪或访存未返回时，该 Warp 暂时不能发射。' },
   { id:'scheduler', label:'Warp 调度', component:'scheduler', detail:'调度器从依赖与资源都满足的 Warp 中选择指令；等待中的 Warp 保留上下文，让其他就绪 Warp 先执行。' },
   { id:'dispatch', label:'指令发射', component:'dispatch', detail:'发射逻辑把指令送往对应执行管线，可用性还取决于执行单元与管线资源。' },
   { id:'operand', label:'操作数收集', component:'operand', detail:'从寄存器读取源操作数并送往执行单元。端口数与时序在此仅为功能示意。' },
   { id:'execute', label:'执行', component:'execute', detail:'ALU、Tensor Core、SFU 或 LSU 处理相应操作，不同操作具有不同延迟。' },
   { id:'writeback', label:'结果写回', component:'writeback', detail:'结果写回目标寄存器，依赖状态随之更新，后续指令才可能变为就绪。' }
  ]
 }
};

// Keep every inspector chip aligned with its 3D material and model label.
for (const [id, component] of Object.entries(components)) component.color = colorFor(id);
