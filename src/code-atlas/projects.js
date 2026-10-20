export const PROJECTS = [
  { id: 'sglang', name: 'SGLang', root: 'python/sglang/srt', graph: 'code-atlas/sglang/graph.json', baseline: 'code-atlas/sglang/graph.previous.json' },
  {
    id: 'deepinfer', name: 'DeepInfer', root: 'Python · C++ · CUDA / Ascend', graph: 'code-atlas/deepinfer/graph.json', baseline: null,
    story: [
      { title: '离线请求入口', file: 'deepinfer/entrypoints/llm.py', detail: 'LLM.generate 接收提示词或 token；_add_request 准备采样参数和请求 ID，必要时分词，再把请求交给 LLMEngine。_run_engine 循环推进引擎并收集输出。' },
      { title: '引擎推进', file: 'deepinfer/engine/llm_engine.py', detail: 'LLMEngine.step 推进一次迭代，调用原生 Scheduler，组织 Worker 执行并处理结果。ZOS 路径让 CPU 调度、后处理与设备计算重叠，因此它不是单纯串行调用链。' },
      { title: 'C++ 批调度', file: 'csrc/engine/scheduler.hpp', detail: 'Scheduler 在原生层选择 prefill / decode，组织批、缓存块和序列元数据，并处理可变长度 MTP。Python 从 deepinfer._C.engine 导入它；类型桩与 pybind 的连接在地图中标记为“扩展绑定”。' },
      { title: '设备工作步骤', file: 'deepinfer/worker/worker.py', detail: 'Worker.execute_model_step 协调前向、后处理和采样。ZOS 模式下 decode 后处理可延迟到下一轮，以共享状态和回调连接相邻步骤。' },
      { title: '模型执行器', file: 'deepinfer/worker/model_runner.py', detail: 'ModelRunner 组织主模型执行和采样，处理执行输入及设备图路径。模型权重、并行通信、KV / 状态缓存为执行提供支撑。' },
      { title: '模型与专家层', file: 'deepinfer/model_executor/models/deepseek.py', detail: 'DeepseekModel 与 DeepseekForCausalLM 连接具体模型前向和采样；V4 模块实现注意力、MoE、Engram 与跨层共享，DFlash 为推测解码提供草稿路径。' },
      { title: '设备算子分派', file: 'deepinfer/model_executor/layers/tilelang_ops/ops.py', detail: 'ops 根据平台通过 importlib 动态导入 CUDA 或 Ascend 后端并导出 *_tl 工厂。静态 AST 图只显示明确写出的导入，不把动态分派猜测为运行时依赖边。' },
      { title: '生成采样', file: 'deepinfer/model_executor/layers/sampler.py', detail: 'Sampler 结合 logits 和采样参数生成 token；推测解码还需验证草稿结果并更新序列状态。结构化输出约束通过匹配器与 token 掩码参与生成。' },
      { title: '输出与资源回收', file: 'deepinfer/engine/llm_engine.py', detail: '引擎处理生成结果和完成状态，DeferredRelease 延后释放上轮资源；LLM._run_engine 收集 RequestOutput，按需解码为文本。下一次迭代继续处理尚未完成的请求。' },
    ],
  },
];

export function resolveProject(search = '') {
  const id = new URLSearchParams(search).get('project');
  return PROJECTS.find(project => project.id === id) || PROJECTS[0];
}

// Keep the deployment subpath, discard the old project's file/district route.
export function projectHref(id, currentUrl) {
  const url = new URL(currentUrl);
  url.searchParams.delete('project');
  url.hash = `/${PROJECTS.some(p=>p.id===id)?id:'sglang'}`;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function parseCodeAtlasRoute(hash='') {
  const match=/^#\/(sglang|deepinfer)(?:\/([dif])\/(.+))?\/?$/.exec(hash);
  if(!match)return null;
  try{return {projectId:match[1],kind:match[2]||null,id:match[3]?decodeURIComponent(match[3]):null};}
  catch{return {projectId:match[1],kind:null,id:null,invalid:true};}
}

export const RELATION_LABELS = { import: 'import', include: '#include', binding: '扩展绑定' };
