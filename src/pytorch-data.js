// A curated functional hierarchy. Parent edges describe organization, not calls.
const layers = [
  ['interface','模型与使用接口','MODEL & USER API','#fa927e','从 Tensor 到模型、数据与训练，连接使用者的第一层。'],
  ['graphs','图捕获与编译','GRAPHS & COMPILERS','#b49af7','把 Python 程序捕获为图，组织变换、优化与代码生成。'],
  ['execution','算子与执行基础','OPERATORS & RUNTIME','#729dff','连接 Python、算子声明、运行时分发与自动求导。'],
  ['devices','设备与计算后端','DEVICES & BACKENDS','#4ac8da','让同一套张量操作落到不同设备及数学库。'],
  ['systems','系统与协作设施','SYSTEMS & TOOLING','#edbc67','组织通信、观测、模型保存以及构建和验证。']
];

// Module rows: id, display name, path, responsibility, input, output.
const domains = [
  ['models','interface','模型构建','torch.nn','用 Module、参数和函数式算子组合神经网络。',[
    ['module','Module 与参数','torch/nn/modules/module.py','管理子模块、参数、缓冲区和 forward 调用。','子模块与参数','可组合的模型对象'],
    ['layers','网络层组件','torch/nn/modules','线性层、卷积、归一化和注意力等模型积木。','输入 Tensor','输出 Tensor'],
    ['functional','函数式接口','torch/nn/functional.py','提供无状态的神经网络函数接口。','Tensor 与算子参数','算子结果'],
    ['initialization','参数初始化','torch/nn/init.py','为模型参数配置初始分布与数值。','参数 Tensor','初始化后的参数']
  ]],
  ['tensors','interface','张量与数值接口','torch.Tensor','提供张量对象及常用数值计算入口。',[
    ['tensor','Tensor 对象','torch/_tensor.py','连接 Python Tensor 行为与底层 TensorBase。','数据与设备信息','Tensor 操作接口'],
    ['linalg','线性代数','torch/linalg','矩阵分解、求解及线性代数接口。','矩阵与向量','线性代数结果'],
    ['fft','频域与特殊函数',['torch/fft','torch/special'],'提供傅里叶变换接口；特殊函数另见 torch.special。','时域或频域张量','变换结果'],
    ['sparse','稀疏与嵌套张量',['torch/sparse','torch/nested'],'组织稀疏张量接口；嵌套张量属于另一类布局。','结构化张量','布局对应的运算结果'],
    ['numpy','NumPy 兼容层','torch/_numpy','提供基于 PyTorch 的 NumPy 风格操作。','数组式输入','兼容接口结果']
  ]],
  ['training','interface','训练与优化','torch.optim · amp','把梯度、参数更新和精度控制连接起来。',[
    ['optimizer','优化器基础','torch/optim/optimizer.py','管理参数组、状态和优化器执行约定。','参数与梯度','参数更新'],
    ['algorithms','更新算法','torch/optim','包含 SGD、Adam 等更新规则及调度器。','优化器状态','新参数与状态'],
    ['amp','自动混合精度','torch/amp','提供自动精度选择与梯度缩放接口。','计算区域与梯度','精度和缩放控制'],
    ['transforms','函数变换','torch/func','组合 grad、vmap 等函数变换接口。','可变换函数','变换后的函数']
  ]],
  ['data','interface','数据输入','torch.utils.data','将样本、采样策略和批处理组织为模型输入。',[
    ['dataset','Dataset 数据集','torch/utils/data/dataset.py','定义样本访问与可迭代数据集。','样本来源','单个样本'],
    ['dataloader','DataLoader','torch/utils/data/dataloader.py','协调迭代、worker、预取和批处理。','数据集与采样策略','批次数据'],
    ['sampler','采样与分批','torch/utils/data/sampler.py','决定样本顺序及批次索引。','数据集规模','索引序列'],
    ['collate','批次整理','torch/utils/data/_utils/collate.py','把多个样本整理为可使用的批次结构。','样本列表','批次 Tensor / 容器']
  ]],
  ['quantization','interface','量化与模型变换','torch.ao · quantization','组织已有量化接口、图变换与参数处理入口。',[
    ['ao','AO 功能区域','torch/ao','包含量化及相关模型处理设施。','模型和精度配置','量化相关能力'],
    ['quantapi','量化接口','torch/quantization','保留量化接口及兼容入口，具体适用范围随版本变化。','模型与量化配置','处理后的模型'],
    ['quantfx','图模式量化','torch/ao/quantization/fx','组织基于图的量化处理支持。','模型图与量化策略','转换后的图'],
    ['pruning','参数剪枝','torch/nn/utils/prune.py','为模块参数提供剪枝相关工具。','参数与剪枝策略','参数掩码与重参数化']
  ]],
  ['capture','graphs','模型图与导出','FX · export · ONNX','捕获、表示和导出模型操作图；不同接口有不同约束。',[
    ['fx','FX 图表示','torch/fx','以 Graph、Node 和 GraphModule 表示可变换的模型图。','捕获到的操作','FX 图'],
    ['export','torch.export','torch/export','导出带约束的程序表示，服务于后续部署。','模型与示例输入','ExportedProgram'],
    ['onnx','ONNX 导出','torch/onnx','组织模型到 ONNX 表示的导出流程。','模型或导出程序','ONNX 模型'],
    ['decompositions','分解与基础算子','torch/_decomp','提供算子分解规则；相关基础操作见 _prims、_refs。','较高层算子','组合后的基础操作']
  ]],
  ['dynamo','graphs','Dynamo 图捕获','torch._dynamo','拦截 Python 执行、构建 FX 子图，并管理 Guard 与图断点。',[
    ['frames','执行帧入口','torch/_dynamo/eval_frame.py','包装程序并进入帧求值与优化机制。','Python 函数或模型','受管理的执行入口'],
    ['symbolic','字节码符号执行','torch/_dynamo/symbolic_convert.py','按符号状态解释字节码，追踪操作与副作用。','字节码与符号变量','图构建信息'],
    ['output','子图构建与提交','torch/_dynamo/output_graph.py','完成 FX 子图并调用所选后端。','捕获状态','FX 子图与后端调用'],
    ['guards','Guard 与缓存条件','torch/_dynamo/guards.py','检查复用编译结果所依赖的条件。','运行时对象与假设','命中或重新编译条件'],
    ['resume','图断点恢复','torch/_dynamo/resume_execution.py','为图断点后的 Python 执行组织恢复入口。','未捕获的后续代码','恢复执行函数']
  ]],
  ['aot','graphs','AOTAutograd','torch._functorch','协调前后向捕获、函数化和训练/推理编译分支。',[
    ['aotentry','AOT 入口','torch/_functorch/aot_autograd.py','将模块或函数交给 AOT 编译组织。','模型、输入与编译器','编译包装结果'],
    ['aotgraph','图捕获与分支','torch/_functorch/_aot_autograd/graph_compile.py','根据梯度需求选择联合图或推理图路径。','梯度需求与图配置','训练或推理编译路径'],
    ['partition','前后向图分割','torch/_functorch/partitioners.py','划分联合图，决定前后向之间保存和重计算的内容。','联合图','前向图与反向图'],
    ['functionalization','函数化处理',['torch/_functorch','torch/_higher_order_ops'],'为变异、别名和变换提供图处理基础。','带状态操作','可分析的图语义']
  ]],
  ['inductor','graphs','Inductor 编译','torch._inductor','降低操作图，组织融合、调度与目标代码生成。',[
    ['compilefx','编译协作入口','torch/_inductor/compile_fx.py','协调图变换、AOTAutograd 及前向/反向编译器。','FX 图与输入信息','编译后的可调用结果'],
    ['lowering','图降低与 IR','torch/_inductor/graph.py','把图操作转换为内部计算和缓冲区表示。','FX 图','内部 IR 与缓冲区'],
    ['scheduling','调度与融合','torch/_inductor/scheduler.py','组织依赖、融合和设备代码生成。','内部计算节点','调度计划'],
    ['codegen','代码生成','torch/_inductor/codegen','生成目标内核与包装代码，保留外部库调用等分支。','调度结果','Triton / C++ 等目标代码'],
    ['provenance','编译调试与来源','torch/_inductor/debug.py','导出图、IR、代码及部分节点来源映射。','编译过程信息','可分析的调试产物']
  ]],
  ['deployment','graphs','既有执行与部署','JIT · NativeRT','保留其他执行、部署和延迟执行设施的独立位置。',[
    ['jit','TorchScript / JIT','torch/jit','提供既有脚本化、追踪和序列化执行接口。','模型或脚本','TorchScript 程序'],
    ['lazy','延迟执行设施','torch/_lazy','组织延迟张量和执行相关接口。','延迟操作','待执行表示'],
    ['nativert','NativeRT','torch/nativert','提供本地运行时相关的模型执行接口。','运行时程序与输入','执行结果']
  ]],
  ['bindings','execution','绑定与代码生成','Python ↔ C++','根据声明和模板连接 Python 接口与 C++ 算子。',[
    ['pythonbinding','Python 绑定层','torch/csrc','连接 Python 扩展对象、接口与 C++ 实现。','Python 对象与调用','C++ 接口'],
    ['torchgen','算子代码生成','torchgen','解析算子声明并生成注册、接口和其他支持代码。','Schema 与生成配置','生成源码与头文件'],
    ['autogradgen','Autograd 生成工具','tools/autograd','生成 Python 绑定及梯度相关支持代码。','算子与梯度声明','绑定和自动求导代码'],
    ['schemas','原生算子声明','aten/src/ATen/native/native_functions.yaml','记录 Schema、变体、委托及候选后端实现。','声明条目','可供生成器解析的定义']
  ]],
  ['dispatch','execution','算子分发','Dispatcher','根据调度状态选择算子实现；声明与实际选择分别看待。',[
    ['dispatcher','Dispatcher 核心','aten/src/ATen/core/dispatch/Dispatcher.h','从实参和状态提取调度键，查找候选实现。','算子与 DispatchKeySet','选中的实现'],
    ['keys','调度键与设备类型','c10/core/DispatchKey.h','定义设备、布局和变换等调度类别。','运行状态','调度键集合'],
    ['library','自定义算子注册','torch/library.py','提供 Python 自定义算子与后端注册入口。','Schema 与实现','注册后的操作'],
    ['dispatchtools','分发辅助接口','torch/_dispatch','提供分发机制相关的 Python 辅助设施。','分发模式与调用','相应的控制行为']
  ]],
  ['aten','execution','ATen 算子库','ATen native','实现张量操作与组合算法，并连接不同后端。',[
    ['native','原生算子实现','aten/src/ATen/native','包含通用、组合与设备相关的算子实现。','Tensor 与参数','算子输出'],
    ['linearimpl','线性运算组合','aten/src/ATen/native/Linear.cpp','按输入条件组合 addmm、matmul 与 bias 处理。','输入、权重和 bias','线性运算结果'],
    ['iteration','TensorIterator','aten/src/ATen/TensorIterator.h','为多种逐元素操作组织迭代和形状规则。','Tensor 与广播信息','可供内核处理的迭代配置'],
    ['meta','形状与 Meta 逻辑','aten/src/ATen/native','部分算子通过结构化及 Meta 逻辑处理输出形状和检查。','形状、布局与参数','输出元信息']
  ]],
  ['autograd','execution','自动求导','Autograd','记录求导关系，并按依赖执行反向任务。',[
    ['autogradapi','反向与梯度接口','torch/autograd','组织 backward、grad 与计算图辅助接口。','输出及梯度请求','反向执行请求'],
    ['engine','反向执行引擎','torch/csrc/autograd/engine.cpp','建立任务和依赖，调度反向节点。','反向依赖图','梯度计算与累积'],
    ['gradientrules','梯度规则','tools/autograd/derivatives.yaml','声明可生成的梯度公式和相关信息。','算子定义','梯度公式声明'],
    ['savedtensors','图与保存张量','torch/autograd/graph.py','提供计算图节点和保存张量相关辅助接口。','图及中间值','图访问和保存策略']
  ]],
  ['core','execution','张量运行基础','c10 · ATen core','为上层计算提供 Tensor、存储、设备和基础类型。',[
    ['tensorimpl','TensorImpl','c10/core/TensorImpl.h','保存张量元信息并连接底层存储。','张量元信息','底层张量对象'],
    ['storage','Storage 与分配器','c10/core/StorageImpl.h','描述存储及其分配器关联。','存储大小与分配信息','存储对象'],
    ['types','类型与设备','c10/core','组织 dtype、Device、Scalar 和布局等基础对象。','设备与类型描述','运行基础类型'],
    ['utilities','基础工具','c10/util','提供异常、容器和通用支持设施。','上层基础需求','共享工具能力']
  ]],
  ['cpu','devices','CPU 计算','CPU · BLAS','连接 CPU 算子、向量化及数学库。',[
    ['cpunative','CPU 算子','aten/src/ATen/native/cpu','实现 CPU 专用的张量操作。','CPU Tensor','CPU 计算结果'],
    ['cpublas','CPU BLAS 接口','aten/src/ATen/native/CPUBlas.cpp','按构建和条件连接矩阵运算实现。','矩阵与参数','BLAS / 内部计算结果'],
    ['vectorization','CPU 向量化','aten/src/ATen/cpu','提供 CPU 向量化相关设施。','数据与指令集条件','向量化执行支持']
  ]],
  ['cuda','devices','CUDA 计算','CUDA · cuBLAS · cuDNN','管理 CUDA 设备执行、算子和外部数学库边界。',[
    ['cudaapi','CUDA Python 接口','torch/cuda','管理设备、Stream、Event 和显存等接口。','设备操作请求','CUDA 运行时控制'],
    ['cudakernels','CUDA 算子','aten/src/ATen/native/cuda','包含 CUDA 专用算子及内核调用。','CUDA Tensor','设备计算结果'],
    ['cudalibs','CUDA 库桥接','aten/src/ATen/cuda','连接 cuBLAS 等设备库与执行支持。','算子及执行条件','设备库调用'],
    ['cudnn','cuDNN 算子桥接','aten/src/ATen/native/cudnn','为适用操作组织 cuDNN 调用。','算子及后端条件','cuDNN 执行结果'],
    ['cudamemory','CUDA 显存与流','c10/cuda','提供分配器、设备和流等底层运行支持。','分配与执行请求','CUDA 资源管理']
  ]],
  ['otherdevices','devices','其他设备与扩展','XPU · MPS · HIP','按构建和设备支持组织其他后端，保留扩展边界。',[
    ['xpu','Intel XPU','torch/xpu','提供 XPU 设备相关的 Python 接口。','设备调用','XPU 控制与计算接口'],
    ['mps','Apple MPS','aten/src/ATen/native/mps','实现 MPS 后端的适用算子。','MPS Tensor','MPS 计算结果'],
    ['hip','HIP / ROCm 支持','aten/src/ATen/hip','提供 HIP 后端的部分支持；还涉及构建时转换。','后端配置与代码','HIP 支持路径'],
    ['deviceapi','设备接口与配置',['torch/accelerator','torch/backends','torch/mtia'],'统一加速器接口、后端配置与 MTIA 等设备入口。','设备与配置请求','设备接口能力'],
    ['privateuse','设备扩展机制','torch/utils/backend_registration.py','帮助外部设备后端使用扩展注册机制。','外部设备后端','适配后的设备接口']
  ]],
  ['distributed','systems','分布式协作','c10d · DTensor · RPC','组织多进程通信、分布式张量和训练策略。',[
    ['collectives','Collective 接口','torch/distributed/distributed_c10d.py','提供 all_reduce 等通信入口与进程组管理。','张量和通信组','通信请求与结果'],
    ['processgroups','ProcessGroup 与后端','torch/csrc/distributed/c10d','按设备与配置选择通信后端，不能固定假定 NCCL。','进程组与设备','后端通信'],
    ['dtensor','DTensor 与分片','torch/distributed/tensor','描述跨设备张量的布局和操作。','张量与分布布局','分布式张量结果'],
    ['fsdp','参数分片训练','torch/distributed/fsdp','组织参数、梯度和优化器状态的分片训练。','模型与并行配置','分片训练行为'],
    ['rpc','远程调用','torch/distributed/rpc','提供远程调用接口，属于区别于 collective 的路径。','远程函数与参数','远程结果']
  ]],
  ['observability','systems','观测与调试','Profiler · logging','记录执行事件和编译信息，支持分析真实运行。',[
    ['profiler','Profiler','torch/profiler','采集算子及设备事件并导出轨迹。','受控运行样本','性能事件与轨迹'],
    ['logging','结构化日志','torch/_logging','组织编译日志、Guard、图断点等信息。','运行或编译信息','可分析日志'],
    ['benchmark','微基准工具','torch/utils/benchmark','帮助组织小范围性能测量。','可测量操作','基准统计']
  ]],
  ['persistence','systems','保存与部署接口','serialization · checkpoint','保存、恢复模型数据，并连接导出后的部署流程。',[
    ['serialization','序列化','torch/serialization.py','组织 torch.save / load 相关存储格式和逻辑。','对象与张量状态','保存或恢复结果'],
    ['checkpointing','分布式检查点','torch/distributed/checkpoint','处理分布式训练状态的保存与恢复。','分布式状态','检查点数据'],
    ['package','程序打包','torch/package','提供 Python 依赖和程序打包相关接口。','程序与依赖','可加载包']
  ]],
  ['engineering','systems','工程与验证','Build · tests · tooling','将源码生成、构建和测试组织为可交付的软件。',[
    ['build','构建配置','cmake','组织本地编译选项和依赖配置。','平台与构建选项','构建规则'],
    ['extensions','扩展构建','torch/utils/cpp_extension.py','为 C++ / CUDA 扩展提供构建辅助。','扩展代码与配置','可加载扩展'],
    ['testing','测试基础设施','torch/testing','为数值正确性和测试组织提供工具。','测试对象与期望','验证结果'],
    ['testsuite','测试集合','test','按功能和后端组织框架测试。','构建产物与测试条件','回归验证结果']
  ]]
];

export const PYTORCH_NODES = {
  pytorch:{id:'pytorch',kind:'root',name:'PyTorch',en:'MODULE ATLAS',description:'从用户接口到设备执行，沿功能层级探索 PyTorch 的主要模块。',color:'#fa927e',paths:['torch','aten','c10','torchgen','functorch'],parent:null,children:layers.map(l=>l[0])}
};
for(const [id,name,en,color,description] of layers) PYTORCH_NODES[id]={id,kind:'layer',name,en,color,description,parent:'pytorch',paths:[],children:[]};
for(const [id,parent,name,en,description,rows] of domains){
  const layer=PYTORCH_NODES[parent];layer.children.push(id);
  PYTORCH_NODES[id]={id,kind:'domain',parent,name,en,description,color:layer.color,children:[],paths:[...new Set(rows.flatMap(r=>Array.isArray(r[2])?r[2]:[r[2]]))]};
  for(const [key,title,path,desc,input,output] of rows){
    const moduleId=`${id}-${key}`;PYTORCH_NODES[id].children.push(moduleId);
    PYTORCH_NODES[moduleId]={id:moduleId,kind:'module',parent:id,name:title,en:(Array.isArray(path)?path[0]:path).split('/').slice(-1)[0],description:desc,input,output,paths:Array.isArray(path)?path:[path],color:layer.color,children:[]};
  }
  layer.paths.push(...PYTORCH_NODES[id].paths);
}

for(const [id] of layers) PYTORCH_NODES[id].paths=[...new Set(PYTORCH_NODES[id].paths)];

export const PYTORCH_LAYERS=layers.map(([id])=>PYTORCH_NODES[id]);
export const PYTORCH_DOMAINS=domains.map(([id])=>PYTORCH_NODES[id]);
export const PYTORCH_MODULES=Object.values(PYTORCH_NODES).filter(n=>n.kind==='module');
export function getPytorchNode(id){return Object.hasOwn(PYTORCH_NODES,id)?PYTORCH_NODES[id]:PYTORCH_NODES.pytorch;}
export function getPytorchTrail(id){const result=[];let node=getPytorchNode(id);while(node){result.unshift(node);node=node.parent?getPytorchNode(node.parent):null;}return result;}
export function getPytorchScope(id){const node=getPytorchNode(id);return node.kind==='module'?getPytorchNode(node.parent):node;}
export function getPytorchDescendants(id){const node=getPytorchNode(id);return node.children.flatMap(child=>[getPytorchNode(child),...getPytorchDescendants(child)]);}
export function searchPytorch(query){const q=query.trim().toLowerCase();if(!q)return [];return Object.values(PYTORCH_NODES).filter(n=>n.kind!=='root'&&`${n.name} ${n.en} ${n.description} ${n.paths.join(' ')}`.toLowerCase().includes(q)).slice(0,35);}
export function getPytorchScene(id){
  const scope=getPytorchScope(id);
  const groups=scope.kind==='root'?PYTORCH_LAYERS:scope.kind==='layer'?scope.children.map(getPytorchNode):[scope];
  return groups.map((group,index)=>({id:group.id,title:group.name,en:group.en,color:group.color,index,nodes:group.children.map(getPytorchNode)}));
}
export function parsePytorchRoute(hash){const match=/^#\/pytorch(?:\/([a-z0-9-]+))?\/?$/.exec(hash);return match?getPytorchNode(match[1]||'pytorch'):null;}
