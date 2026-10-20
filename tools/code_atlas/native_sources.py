"""Read local C/C++ include relationships without claiming to parse C++ symbols."""
import posixpath
import re

try:
    from .deepinfer_guides import FILE_GUIDES
except ImportError:
    from deepinfer_guides import FILE_GUIDES

NATIVE_SUFFIXES = {".cpp", ".cc", ".c", ".cu", ".h", ".hpp", ".cuh"}


def strip_comments(text):
    # Preserve quoted strings and physical lines, including // inside strings.
    pattern = r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*.*?\*/'
    return re.sub(pattern, lambda m: "\n" * m[0].count("\n") if m[0].startswith(("//", "/*")) else m[0], text, flags=re.S)


def native_includes(rel, text, file_ids):
    targets = []
    unresolved = 0
    for name in re.findall(r'^\s*#\s*include\s*["<]([^">]+)[">]', strip_comments(text), re.M):
        candidates = [posixpath.normpath(posixpath.join(posixpath.dirname(rel), name)), f"csrc/{name}", name]
        target = next((candidate for candidate in candidates if candidate in file_ids), None)
        if target and target != rel:
            targets.append(target)
        elif not target:
            unresolved += 1
    return targets, unresolved


def native_description(rel):
    if rel in FILE_GUIDES:
        title, summary = FILE_GUIDES[rel]
    elif rel.startswith("csrc/engine/input_metadata/"):
        title, summary = "原生输入元数据", "构造调度后执行批需要的输入元数据、位置或块加载计划。"
    elif rel.startswith("csrc/engine/"):
        title, summary = "原生调度与序列管理", "实现推理引擎的调度、序列状态、采样输入或输出处理，供 Python 引擎通过绑定使用。"
    elif rel.startswith("csrc/graph_timer/"):
        title, summary = "设备图计时", "提供 CUDA/Ascend 设备图执行的计时实现或 Python 绑定。"
    elif rel.startswith("csrc/utils/"):
        title, summary = "C++ 基础工具", "提供对象池、锁或日志等原生代码基础工具。"
    else:
        title, summary = "原生扩展接口", "提供设备工具或扩展模块入口，将原生实现接入 Python。"
    return {"title": title, "summary": summary + " 此文件仅统计行数与本地 #include 依赖，未解析 C++ 函数和调用关系。", "basis": "guide" if rel in FILE_GUIDES else "structure", "responsibilities": [], "keySymbols": [], "moduleDoc": ""}
