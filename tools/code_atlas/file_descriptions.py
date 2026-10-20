"""Deterministic, source-grounded reading guides; never execute analysed code."""
import ast
import re
from pathlib import PurePosixPath

try:
    from .deepinfer_guides import DISTRICT_GUIDES, FILE_GUIDES
except ImportError:
    from deepinfer_guides import DISTRICT_GUIDES, FILE_GUIDES


# Reading guides for the runtime's main entry points. All other files still get
# a guide from their own definitions, docstrings and package responsibility.
CORE_GUIDES = {
    "managers/scheduler.py": ("请求调度器", "管理 GPU 工作进程的请求调度：组织等待队列与运行批，协调 prefill、decode、缓存资源和模型执行。"),
    "managers/tokenizer_manager.py": ("请求接入与分词管理", "接收上层推理请求，处理输入分词与请求管理，并与调度进程交换请求和生成结果。"),
    "managers/detokenizer_manager.py": ("生成结果解码", "把生成的 token ID 还原为文本，维护增量解码状态，并把处理后的结果交给请求接入侧。"),
    "managers/schedule_batch.py": ("请求与执行批的数据结构", "定义请求及调度批次的数据结构，组织 token、序列长度、采样参数和缓存位置，供调度与执行阶段共享。"),
    "managers/schedule_policy.py": ("调度策略", "为等待请求计算调度优先级，支持按缓存匹配等条件决定请求进入执行批的顺序。"),
    "managers/io_struct.py": ("进程间请求与结果协议", "定义推理请求、批量输入和输出结果等消息结构，连接请求管理、调度和结果返回等进程。"),
    "model_executor/model_runner.py": ("模型执行器", "初始化并执行推理模型，准备前向计算所需的运行状态，协调设备、模型权重和执行路径。"),
    "model_executor/forward_batch_info.py": ("模型前向批次描述", "定义模型前向计算使用的批次信息，将调度侧的请求与缓存状态组织为注意力和模型层可使用的输入。"),
    "mem_cache/memory_pool.py": ("请求与 KV 缓存内存池", "维护请求到 token 位置的映射及实际 KV 缓存存储，为推理过程提供缓存读写和内存池管理。"),
    "mem_cache/radix_cache.py": ("前缀缓存索引", "使用 radix tree 管理可复用的请求前缀，提供前缀匹配、插入和淘汰，减少重复的 prefill 计算。"),
    "entrypoints/http_server.py": ("HTTP 服务入口", "组织 HTTP 推理服务及相关接口，将外部请求接入 SGLang 的运行时处理流程。"),
    "entrypoints/engine.py": ("推理引擎接口", "提供在 Python 中启动和使用推理引擎的接口，连接运行时初始化、请求提交与结果获取。"),
    "configs/model_config.py": ("模型配置解释", "读取并解释模型配置，整理模型架构、上下文长度及运行时所需的模型属性。"),
    "server_args.py": ("服务启动参数", "定义和处理服务启动参数，将命令行与配置选项整理为运行时设置。"),
    "environ.py": ("环境变量配置", "集中声明和访问运行时环境变量，用于控制功能开关、调试和执行行为。"),
    "runtime_context.py": ("运行时共享上下文", "组织运行时各领域的共享配置与上下文，为模型、调度、内存和服务组件提供统一访问入口。"),
    "layers/linear.py": ("并行线性层", "实现推理模型使用的线性层及并行切分方式，衔接权重加载、量化方法与前向计算。"),
    "layers/radix_attention.py": ("注意力层接口", "提供模型层调用注意力计算的接口，连接 Q/K/V 输入、KV 缓存与具体注意力后端。"),
    "layers/logits_processor.py": ("模型输出 logits 处理", "处理模型输出的 logits，整理下一 token 预测及对数概率等结果，供生成与评分流程使用。"),
    "model_loader/loader.py": ("模型加载", "组织模型与权重的加载流程，将存储中的参数转换为执行器可以使用的模型。"),
    "model_loader/weight_utils.py": ("权重加载工具", "提供权重文件读取、迭代及参数处理工具，支持不同格式的模型权重加载。"),
}

# Longest matching prefix wins; a profile describes the subsystem, while the
# file's own key definitions and responsibilities distinguish individual files.
PACKAGE_ROLES = {
    "models": ("模型实现", "组织模型结构、前向计算与参数装载"),
    "layers/attention": ("注意力计算", "处理注意力后端、执行元数据或注意力算子"),
    "layers/quantization": ("模型量化", "处理量化权重、精度格式与对应计算路径"),
    "layers/moe": ("混合专家计算", "组织专家路由、专家并行或专家层计算"),
    "layers": ("模型计算层", "提供模型推理使用的计算层或算子支持"),
    "mem_cache/allocator": ("缓存空间分配", "管理缓存索引、槽位与空间回收"),
    "mem_cache/storage": ("缓存存储", "对接缓存的持久化或外部存储"),
    "mem_cache": ("推理缓存管理", "管理请求状态、KV 缓存及缓存复用"),
    "managers": ("请求与进程管理", "衔接推理请求、批次调度和结果处理"),
    "model_executor": ("模型执行", "准备和执行模型前向计算"),
    "model_loader": ("模型与权重加载", "读取模型权重并适配执行时的参数布局"),
    "entrypoints/openai": ("OpenAI 兼容接口", "处理兼容接口的请求协议与结果响应"),
    "entrypoints": ("服务接入", "连接外部调用与推理运行时"),
    "distributed": ("分布式执行", "管理进程组、并行通信与跨设备协作"),
    "disaggregation": ("分离式推理", "协调分离部署中的请求、状态和数据传输"),
    "speculative": ("推测解码", "组织候选 token 的提出、验证与相关状态"),
    "multimodal/processors": ("多模态输入处理", "将图像、视频或音频等输入转换为模型输入"),
    "multimodal": ("多模态推理", "衔接多模态数据、模型组件和执行流程"),
    "configs": ("模型配置", "解释模型属性并提供配置适配"),
    "arg_groups": ("启动参数分组", "声明与整理某个领域的服务参数"),
    "hardware_backend": ("硬件后端适配", "适配特定设备的计算与运行时接口"),
    "platforms": ("运行平台检测与适配", "识别硬件平台并提供平台相关能力"),
    "lora": ("LoRA 适配", "管理适配器权重及低秩增量计算"),
    "sampling": ("生成采样", "处理采样参数与 token 选择"),
    "constrained": ("约束生成", "管理语法约束并限制可生成的 token"),
    "function_call": ("工具调用解析", "识别并整理模型输出中的工具调用"),
    "parser": ("生成内容解析", "解析模型输出中的推理段、内容或结构化字段"),
    "debug_utils": ("运行时调试", "收集、检查或辅助定位运行时问题"),
    "observability": ("运行状态观测", "记录运行指标、事件或追踪信息"),
    "compilation": ("编译执行支持", "管理编译、图捕获或编译相关配置"),
    "eplb": ("专家并行负载均衡", "协调专家负载和部署布局"),
    "beam_search": ("束搜索解码", "维护搜索候选、分数及搜索状态"),
    "batch_overlap": ("批次重叠执行", "协调批次执行阶段之间的重叠"),
    "batch_invariant_ops": ("批次一致性算子", "提供与批次形状变化相关的一致性计算支持"),
    "weight_sync": ("权重同步", "协调运行时权重的更新和传输"),
    "weight_cache": ("权重缓存", "管理可复用的模型权重数据"),
    "tokenizer": ("分词支持", "处理文本与 token 之间的转换"),
    "session": ("会话管理", "维护多轮请求关联的会话状态"),
    "connector": ("外部服务连接", "适配外部数据或服务接口"),
    "plugins": ("插件接入", "发现、注册或接入扩展组件"),
    "ray": ("Ray 执行集成", "组织 Ray 环境下的进程与执行资源"),
    "rust_server": ("Rust 服务集成", "连接 Python 运行时与 Rust 服务组件"),
    "rust_extensions": ("Rust 扩展集成", "提供 Rust 扩展的 Python 接口"),
    "elastic_ep": ("弹性专家并行", "支持专家并行资源的动态管理"),
    "state_capturer": ("运行状态捕获", "捕获并组织可供检查的执行状态"),
    "checkpoint_engine": ("检查点管理", "组织模型状态或权重检查点的传输与加载"),
    "multiplex": ("多路执行协调", "协调多路请求或执行资源"),
    "kv_canary": ("KV 缓存检查", "提供 KV 缓存相关检查与辅助逻辑"),
    "dllm": ("扩散语言模型支持", "适配扩散语言模型的生成过程"),
    "utils": ("公共运行时工具", "提供跨模块复用的辅助逻辑"),
}

CAPABILITIES = [
    (r"(^|_)(alloc|allocate|free|release|evict)(_|$)", "分配、回收或淘汰运行资源"),
    (r"(^|_)(forward|prefill|decode)(_|$)", "执行前向计算或生成阶段处理"),
    (r"(^|_)(load|save|download|weights|weight)(_|$)", "读取、保存或转换模型参数"),
    (r"(^|_)(encode|tokenize|detokenize|process)(_|$)", "转换或处理输入与输出数据"),
    (r"(^|_)(send|recv|receive|broadcast|gather|reduce)(_|$)", "执行数据传输或并行通信"),
    (r"(^|_)(parse|validate|check)(_|$)", "解析、校验或检查数据与配置"),
    (r"(^|_)(register|dispatch|create|build)(_|$)", "创建、注册或选择运行组件"),
    (r"(^|_)(sample|sampling|logits)(_|$)", "处理生成采样或预测分数"),
    (r"(^|_)(match|insert|cache)(_|$)", "匹配、写入或维护缓存状态"),
]


def clean_doc(value, limit=1400):
    """Keep useful documentation, dropping license boilerplate paragraphs."""
    paragraphs = []
    for paragraph in re.split(r"\n\s*\n", value or ""):
        if re.search(r"copyright|licensed under|you may obtain|www.apache.org|unless required|limitations under|spdx-license", paragraph, re.I):
            continue
        paragraph = paragraph.strip()
        if paragraph:
            paragraphs.append(paragraph)
    return "\n\n".join(paragraphs)[:limit]


def describe_file(rel, tree, *, prefix="sglang.srt", parse_error=False):
    path = PurePosixPath(rel)
    if tree is None:
        return {"title": "源码解析失败" if parse_error else "源码不可读", "summary": "未能读取此文件的定义，暂时无法生成可靠的功能说明。", "basis": "unavailable", "responsibilities": [], "keySymbols": [], "moduleDoc": ""}
    module_doc = clean_doc(ast.get_docstring(tree))
    definitions = [node for node in tree.body if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))]
    ranked = sorted(definitions, key=lambda node: (not isinstance(node, ast.ClassDef), -(getattr(node, "end_lineno", node.lineno) - node.lineno), node.lineno))
    keys = [{"name": node.name, "id": f"{rel}#{node.name}", "kind": "class" if isinstance(node, ast.ClassDef) else "function", "start": node.lineno, "doc": clean_doc(ast.get_docstring(node), 360)} for node in ranked[:4]]
    symbol_names = [node.name for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]
    responsibilities = []
    for pattern, text in CAPABILITIES:
        examples = list(dict.fromkeys(name for name in symbol_names if re.search(pattern, name)))[:3]
        if examples:
            responsibilities.append({"text": text, "symbols": examples})
    responsibilities = responsibilities[:3]
    profile = next((PACKAGE_ROLES[key] for key in sorted(PACKAGE_ROLES, key=len, reverse=True) if rel.startswith(key + "/")), ("Python 模块", "提供此模块定义的运行逻辑"))
    stem = path.stem.replace("_", " ")
    is_sglang = prefix == "sglang.srt"
    if not is_sglang:
        profile = ("Python 模块", "提供此模块定义的运行逻辑")
    is_deepinfer = prefix == "" and rel.startswith(("deepinfer/", "deep_cluster/", "examples/", "eval/", "tests/"))
    if is_deepinfer:
        profile = next((DISTRICT_GUIDES[key] for key in sorted(DISTRICT_GUIDES, key=len, reverse=True) if rel.startswith(key + "/")), profile)
    if is_deepinfer and rel in FILE_GUIDES:
        title, summary = FILE_GUIDES[rel]
        basis = "guide"
    elif is_sglang and rel in CORE_GUIDES:
        title, summary = CORE_GUIDES[rel]
        basis = "guide"
    elif path.name == "__init__.py":
        title = f"{path.parent.as_posix()} 包入口"
        imports = [node for node in tree.body if isinstance(node, (ast.Import, ast.ImportFrom))]
        if not imports and not definitions and not [node for node in tree.body if not isinstance(node, ast.Expr)]:
            summary = "标记 Python 包的边界。本文件没有可执行的功能定义；具体功能由同目录下的子模块实现。"
        else:
            summary = f"作为 {path.parent.as_posix()} 包的入口，组织包级定义或导入。"
            if imports:
                summary += "其中的导入为包提供模块接入或对外访问入口。"
        basis = "structure"
    elif path.name.startswith("test_") or "/tests/" in "/" + rel:
        title, summary, basis = f"{stem} 测试", "组织该模块相关的测试用例，用于检查对应行为是否符合预期。", "structure"
    else:
        title = f"{stem} · {profile[0]}"
        summary = f"{path.stem} 属于{profile[0]}模块，用于{profile[1]}。"
        if keys:
            summary += "主要定义 " + "、".join(item["name"] for item in keys[:3]) + "。"
        elif any(isinstance(node, (ast.Assign, ast.AnnAssign)) for node in tree.body):
            summary += "本文件以常量、配置或模块级装配为主。"
        elif not tree.body or all(isinstance(node, ast.Expr) for node in tree.body):
            summary = "本文件没有可执行的功能定义，当前仅包含说明或占位内容。"
        basis = "structure"
    return {"title": title, "summary": summary, "basis": basis, "responsibilities": responsibilities, "keySymbols": keys, "moduleDoc": module_doc}
