#!/usr/bin/env python
"""Build a self-contained, first-party DeepInfer repository snapshot."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

try:
    from .deepinfer_guides import DISTRICT_GUIDES
    from .extract_graph import extract
    from .native_sources import NATIVE_SUFFIXES
except ImportError:
    from deepinfer_guides import DISTRICT_GUIDES
    from extract_graph import extract
    from native_sources import NATIVE_SUFFIXES

SOURCE_DIRS = ("deepinfer", "deep_cluster", "csrc", "examples", "tests", "eval")
BINDINGS = (
    ("deepinfer/_C/__init__.pyi", "csrc/pybind.cpp"),
    ("deepinfer/_C/engine.pyi", "csrc/engine/pybind.cpp"),
    ("deepinfer/_C/cuda_utils.pyi", "csrc/cuda_utils.cpp"),
    ("deepinfer/_C/cuda_utils.pyi", "csrc/asc_utils.cpp"),
    ("deepinfer/_C/graph_timer.pyi", "csrc/graph_timer/pybind.cpp"),
)


def extract_repository(root, *, with_timestamp=True):
    sources = [path for directory in SOURCE_DIRS for path in (root / directory).rglob("*")
               if path.is_file() and path.suffix in ({".py", ".pyi"} | NATIVE_SUFFIXES)
               and not {"__pycache__", ".venv", "node_modules", ".git"}.intersection(path.relative_to(root).parts)]
    graph = extract(root, "DeepInfer", "", with_timestamp, source_files=sources,
                    district_roots=tuple(DISTRICT_GUIDES), extra_edges=BINDINGS)
    for district in graph["districts"]:
        title, summary = DISTRICT_GUIDES[district["id"]]
        district["name"] = title
        district["description"] = {"title": title, "summary": summary + "。"}
    counts = {}
    for file in graph["files"]:
        counts[file["language"]] = counts.get(file["language"], 0) + 1
    kinds = {}
    for edge in graph["imports"]:
        kinds[edge["kind"]] = kinds.get(edge["kind"], 0) + 1
    graph["meta"].update({
        "project": "deepinfer", "languageCounts": counts, "edgeKinds": kinds,
        "scope": list(SOURCE_DIRS), "excluded": ["vendor", "scripts", "setup.py", "文档与非源码资源"],
        "analysis": {
            "summary": "DeepInfer 是面向 DeepSeek 模型的推理框架。这份开源代码以离线批量推理为入口：Python 管理请求和设备执行，C++ 负责批调度与序列状态，模型层连接 CUDA / Ascend 算子。",
            "notes": [
                "阅读主线：LLM → LLMEngine → C++ Scheduler → Worker → ModelRunner → 模型 / Sampler → 输出回收。",
                "ZOS 把 CPU 调度和后处理与设备计算重叠；MTP / DFlash、置信度验证和 YOCO 让执行依赖跨越相邻步骤。讲解是设计流程，不是运行时 trace。",
                "开源版本包含引擎内 KV / 状态缓存管理；README 列出的完整服务 KV 缓存系统、分离式部署和 DP 副本负载均衡仍需外部实现。",
                "vendor 子模块不计入建筑。动态 importlib 后端分派和外部 FlashMLA / DeepGEMM / DeepEP 等库没有被展开成静态依赖边。",
                "Python 与 .pyi 用 AST 解析；类型桩楼层是接口声明。C++ 仅统计行数和本地 #include，不提供符号楼层；绑定边依据 csrc 的 pybind 注册手工确认。cuda_utils 的两条绑定由构建平台择一。",
            ],
            "entryFiles": ["deepinfer/entrypoints/llm.py", "deepinfer/engine/llm_engine.py", "csrc/engine/scheduler.hpp", "deepinfer/worker/worker.py", "deepinfer/worker/model_runner.py", "deepinfer/model_executor/models/deepseek.py", "deepinfer/model_executor/layers/tilelang_ops/ops.py"],
        },
    })
    return graph


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=os.environ.get("DEEPINFER_ROOT", r"D:\code\deepinfar"))
    parser.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "data/code-atlas/deepinfer-graph.json"))
    parser.add_argument("--no-timestamp", action="store_true")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    if not (root / "deepinfer").is_dir():
        print(f"error: DeepInfer source root not found: {root}", file=sys.stderr)
        return 2
    graph = extract_repository(root, with_timestamp=not args.no_timestamp)

    def git(*args):
        try:
            return subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, check=True).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            return None

    graph["meta"]["source"] = {"ref": git("symbolic-ref", "--short", "-q", "HEAD"),
                                "commit": git("rev-parse", "HEAD"),
                                "dirty": bool(git("status", "--porcelain", "--", "."))}
    if graph["meta"]["sourceErrors"]:
        for error in graph["meta"]["sourceErrors"]:
            print(f"error: {error}", file=sys.stderr)
        return 1
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    meta = graph["meta"]
    print(f"DeepInfer: {meta['fileCount']} files, {meta['districtCount']} districts, {meta['locTotal']} lines, {meta['edgeCount']} edges")
    print(f"languages={meta['languageCounts']} edges={meta['edgeKinds']} errors={meta['parseErrors']}")
    print(f"written: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
