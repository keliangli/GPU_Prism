import { getPytorchTrail } from './pytorch-data.js';

// Curated relationships at module granularity, pinned to the page's source snapshot.
// A direction means the named action below, not necessarily a runtime function call.
export const PYTORCH_RELATION_TYPES = {
  call:{name:'调用与分发',color:'#77b5ff'},
  data:{name:'数据供给',color:'#58ddcf'},
  compile:{name:'图与编译',color:'#c5a0ff'},
  gradient:{name:'梯度协作',color:'#ff97ba'},
  control:{name:'控制与观测',color:'#ffd17e'},
  generate:{name:'声明与生成',color:'#b6c4d9'}
};
// from, to, type, action, explanation, condition, evidence path, line, basis.
const rows = [
  ['data-sampler','data-dataloader','data','提供样本索引','DataLoader 的迭代器从 index sampler 取得下一组索引。','Map-style 数据集；IterableDataset 的取数方式不同。','torch/utils/data/dataloader.py',715],
  ['data-dataloader','data-dataset','call','按索引读取样本','DataLoader 通过 fetcher 调用数据集的索引访问。','Map-style fetcher；也支持批量 __getitems__。','torch/utils/data/_utils/fetch.py',54],
  ['data-dataloader','data-collate','call','调用批次整理','Fetcher 将取到的样本交给 collate_fn。','可以由用户替换 collate_fn。','torch/utils/data/_utils/fetch.py',57],
  ['data-collate','data-dataloader','data','返回批次','批次整理的结果沿 fetcher 返回给 DataLoader 迭代器。','返回值可以是 Tensor 或嵌套容器。','torch/utils/data/dataloader.py',785],
  ['data-dataloader','models-layers','data','向模型提供批次','训练或推理程序可把 DataLoader 产出的批次传给模型。','由用户循环连接；DataLoader 不会自动调用模型。','torch/utils/data/dataloader.py',151,'usage'],
  ['models-layers','models-functional','call','调用函数式算子','以 Linear 为例，forward 调用 F.linear。','这是代表性线性层路径；不同层使用不同算子。','torch/nn/modules/linear.py',134],
  ['models-functional','bindings-pythonbinding','call','进入 Python / C++ 绑定','F.linear 绑定到 torch._C._nn.linear。','线性算子示例；并非所有 functional 接口都只有一层绑定。','torch/nn/functional.py',2383],
  ['bindings-schemas','bindings-torchgen','generate','供给算子声明','原生算子 Schema、委托和后端条目作为代码生成的输入。','构建期关系，不是运行时调用。','aten/src/ATen/native/native_functions.yaml',3336],
  ['bindings-schemas','bindings-autogradgen','generate','供给绑定定义','绑定生成工具根据原生算子信息组织 Python 接口。','构建期生成路径。','tools/autograd/gen_python_functions.py',281],
  ['autograd-gradientrules','bindings-autogradgen','generate','供给梯度公式','derivatives.yaml 记录算子的梯度公式，供求导代码生成使用。','声明关系；不能解释为运行时读取 YAML。','tools/autograd/derivatives.yaml',256],
  ['bindings-pythonbinding','dispatch-dispatcher','call','调用算子接口','生成的 Python 绑定连接 ATen 算子接口，运行时经分发选择实现。','通过生成接口连接；不表示所有 torch/csrc 文件都直接调用 Dispatcher。','tools/autograd/gen_python_functions.py',1342],
  ['dispatch-keys','dispatch-dispatcher','control','参与实现选择','Dispatcher 从实参和线程状态得到调度键，再查找对应实现。','设备、布局与变换状态共同影响选择。','aten/src/ATen/core/dispatch/Dispatcher.h',784],
  ['dispatch-dispatcher','aten-linearimpl','call','选择 linear 实现','linear 声明了 CompositeImplicitAutograd 等实现；分发后进入相应路径。','普通组合实现示例；NestedTensor、MPS 等存在不同注册。','aten/src/ATen/native/native_functions.yaml',3336],
  ['aten-linearimpl','dispatch-dispatcher','call','再次分发组合算子','Linear 实现按输入形状和 bias 等条件调用 addmm 或 matmul。','组合算子会再次经过分发，不是直接固定调用某个 GPU 内核。','aten/src/ATen/native/Linear.cpp',109],
  ['dispatch-dispatcher','cpu-cpublas','call','CPU 矩阵实现候选','addmm 的 CPU 实现通过 CPU BLAS 接口完成适用的矩阵计算。','间接经过 CPU addmm 实现；取决于 CPU Tensor、dtype 和构建。','aten/src/ATen/native/LinearAlgebra.cpp',1527],
  ['dispatch-dispatcher','cuda-cudakernels','call','选择 CUDA 算子','addmm 等操作注册 CUDA 实现，由分发机制选择。','CUDA 是候选之一，不是每次执行都会进入。','aten/src/ATen/native/native_functions.yaml',7065],
  ['cuda-cudakernels','cuda-cudalibs','call','调用设备数学库','CUDA 矩阵运算可调用 cuBLAS / cuBLASLt 相关接口。','按形状、dtype 和配置选择，也可能使用其他实现。','aten/src/ATen/native/cuda/Blas.cpp',626],
  ['autograd-autogradapi','autograd-savedtensors','call','进入反向执行桥接','backward / grad 通过 graph.py 的 _engine_run_backward 提交反向请求。','需要梯度计算的请求；本节点还包含其他图辅助功能。','torch/autograd/__init__.py',395],
  ['autograd-savedtensors','autograd-engine','call','提交反向任务','Python 图辅助接口调用 C++ execution engine 运行反向图。','反向计算按依赖调度，不是简单的正向倒序。','torch/autograd/graph.py',1113],
  ['autograd-engine','training-algorithms','gradient','供给参数梯度','反向计算累积的参数梯度可供 Adam 等优化算法读取。','由用户依次组织 backward 与 optimizer.step；不是引擎调用优化器。','torch/optim/adam.py',151,'usage'],
  ['training-algorithms','models-module','data','更新模型参数','优化器维护参数及状态，并依据已有梯度更新参数。','优化器必须显式接收模型参数。','torch/optim/adam.py',151,'usage'],
  ['dynamo-frames','dynamo-symbolic','compile','进入符号执行','受管理的 Python 执行通过帧转换进入字节码符号追踪。','torch.compile 路径；未捕获的代码可能继续 eager 执行。','torch/_dynamo/convert_frame.py',930],
  ['dynamo-symbolic','dynamo-output','compile','构建捕获子图','符号执行器维护 OutputGraph 并组织捕获的操作。','图断点可能产生多个子图。','torch/_dynamo/symbolic_convert.py',5787],
  ['dynamo-output','capture-fx','compile','构造 FX GraphModule','OutputGraph 把捕获的操作整理成 FX GraphModule 后交给编译后端。','FX 是图表示，不等同于目标机器代码。','torch/_dynamo/output_graph.py',2820],
  ['dynamo-guards','dynamo-frames','control','约束缓存复用','Guard 检查编译结果所依赖的运行条件，失配可导致重新编译。','取决于形状、对象状态和配置。','torch/_dynamo/convert_frame.py',1056],
  ['dynamo-symbolic','dynamo-resume','control','组织图断点恢复','捕获不能继续时，组织剩余 Python 字节码的恢复执行。','有图断点的路径；fullgraph 模式可能报错。','torch/_dynamo/symbolic_convert.py',3777],
  ['dynamo-output','inductor-compilefx','compile','提交默认编译后端','Dynamo 调用所选后端；默认 Inductor 包装最终调用 compile_fx。','backend=inductor；eager 或自定义后端可能绕过 Inductor。','torch/__init__.py',2945],
  ['inductor-compilefx','aot-aotentry','compile','组织 AOT 编译','Inductor 为 AOTAutograd 提供前向、反向及推理编译器等配置。','训练和推理会走不同分支。','torch/_inductor/compile_fx.py',3538],
  ['aot-aotentry','aot-functionalization','compile','处理变异与别名','AOT 入口使用函数化处理来收集元信息并组织可分析计算。','处理变异、别名和 RNG 等语义，细节随路径变化。','torch/_functorch/aot_autograd.py',596],
  ['aot-aotentry','aot-aotgraph','compile','组织图捕获分支','AOTAutograd 根据梯度需求组织训练联合图或推理图的捕获与编译。','需要梯度与纯推理分支不同。','torch/_functorch/_aot_autograd/graph_compile.py',250],
  ['aot-aotgraph','aot-partition','compile','划分前向与反向','训练联合图通过 partition_fn 划分前向图、反向图及保存值。','训练路径；纯推理不必构造反向图。','torch/_functorch/_aot_autograd/graph_compile.py',2016],
  ['aot-aotgraph','inductor-compilefx','compile','回调图编译器','AOT 分支把图交给 Inductor 配置的编译回调。','双向协作的另一方向，不表示无条件递归调用。','torch/_inductor/compile_fx.py',3539],
  ['inductor-compilefx','inductor-lowering','compile','降低 FX 图','编译流程构造 GraphLowering，把图转换成内部计算表示。','依赖具体编译分支及缓存状态。','torch/_inductor/compile_fx.py',1810],
  ['inductor-lowering','inductor-scheduling','compile','提交 IR 操作','GraphLowering 用内部操作构造 Scheduler。','依赖与融合属于后续调度工作。','torch/_inductor/graph.py',3038],
  ['inductor-scheduling','inductor-codegen','compile','生成目标代码','Scheduler 选择设备相关的代码生成实现。','CPU 可使用 C++；CUDA 可使用 Triton、C++ 及外部库等。','torch/_inductor/scheduler.py',11646],
  ['inductor-lowering','inductor-provenance','control','导出图与 IR','编译调试设施可输出 FX 图、IR 和目标代码等产物。','需要启用对应调试选项；不是默认性能采样。','torch/_inductor/debug.py',654],
  ['inductor-provenance','observability-logging','control','使用结构化编译日志','Inductor 调试设施通过结构化日志接口记录融合前后的 IR 等信息。','需要启用相应日志项；日志与调试导出配置分别控制。','torch/_inductor/debug.py',57],
  ['distributed-collectives','distributed-processgroups','call','提交 collective','all_reduce 在进程组对象上提交 allreduce 请求。','具体通信后端按进程组和设备配置决定。','torch/distributed/distributed_c10d.py',4164],
  ['core-tensorimpl','core-storage','data','持有存储引用','TensorImpl 维护张量元信息并关联 Storage。','视图可共享存储；Meta 等情形不应理解为必有物理设备数据。','c10/core/TensorImpl.h',2932]
];

export const PYTORCH_RELATIONS=rows.map(([from,to,type,label,detail,condition,path,line,basis='source'],i)=>({id:`pt-edge-${i+1}`,from,to,type,label,detail,condition,evidence:{path,line},basis}));
export const isPytorchWithin=(id,ancestor)=>getPytorchTrail(id).some(n=>n.id===ancestor);
export const getPytorchRelations=(id,type='all')=>PYTORCH_RELATIONS.filter(r=>(type==='all'||r.type===type)&&(isPytorchWithin(r.from,id)||isPytorchWithin(r.to,id)));

// Collapse real leaf relationships onto visible ancestors. Never invent sibling
// calls from containment, and never display a collapsed self-loop.
export function projectPytorchRelations(bands){
  const visible=new Set(bands.flatMap(b=>b.nodes.map(n=>n.id))),groups=new Map();
  const project=id=>getPytorchTrail(id).reverse().find(n=>visible.has(n.id))?.id;
  for(const relation of PYTORCH_RELATIONS){
    const from=project(relation.from),to=project(relation.to);
    if(!from||!to||from===to)continue;
    const id=`${from}:${to}:${relation.type}`;
    if(!groups.has(id))groups.set(id,{id,from,to,type:relation.type,members:[]});
    groups.get(id).members.push(relation);
  }
  return [...groups.values()].map(edge=>({...edge,label:edge.members.length===1?edge.members[0].label:`${PYTORCH_RELATION_TYPES[edge.type].name} · ${edge.members.length} 项`}));
}

export function getPytorchRelationView(bands,selected,{mode='focus',type='all',enabled=true}={}){
  const projected=projectPytorchRelations(bands);
  const edges=enabled?projected.filter(e=>(type==='all'||e.type===type)&&(mode==='all'||e.members.some(r=>isPytorchWithin(r.from,selected)||isPytorchWithin(r.to,selected)))):[];
  const neighbors=new Map();
  const mark=(id,direction)=>neighbors.set(id,neighbors.has(id)&&neighbors.get(id)!==direction?'both':direction);
  for(const edge of edges){
    if(isPytorchWithin(selected,edge.from)||isPytorchWithin(edge.from,selected))mark(edge.to,'downstream');
    if(isPytorchWithin(selected,edge.to)||isPytorchWithin(edge.to,selected))mark(edge.from,'upstream');
  }
  return {edges,neighbors};
}

export function describePytorchDirection(relation,id){
  const from=isPytorchWithin(relation.from,id),to=isPytorchWithin(relation.to,id);
  return from&&to?'内部协作':from?'下游 / 指向':'上游 / 来自';
}
