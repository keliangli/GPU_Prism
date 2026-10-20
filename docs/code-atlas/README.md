# SGLang / DeepInfer 融合说明

两个源码可视化已融入 INFAR 的共享导航与路由，直接在当前页面加载，无需另一个站点或服务。

| 入口 | 数据范围 | 当前快照 |
| --- | --- | --- |
| `#/sglang` | `python/sglang/srt` | 1,904 个文件、44 个街区、11,293 条 import 边 |
| `#/deepinfer` | DeepInfer 项目自身的 Python、类型桩与 C++ | 306 个文件、31 个街区、762 条依赖边 |

保留文件功能说明、依赖清单、符号楼层、同文件调用、热度着色、相机预设、全屏、路径搜索和请求生命周期讲解。SGLang 保留 v0.5.12 基线，用户开启对比时才下载；DeepInfer 无基线，不显示对比入口。数据及查看器均按需加载。

街区、文件和内部视图可直接分享，例如：

- `#/sglang/d/mem_cache`
- `#/sglang/f/managers%2Fscheduler.py`
- `#/deepinfer/i/deepinfer%2Fengine%2Fllm_engine.py`

页面切换会释放场景、事件、计时器与未完成的数据请求。样式和 DOM 查询限定在 Code Atlas 容器内，与 GPU / PyTorch 视图共存。

## 快照与原项目

此次迁入的是用户提供目录里的实际工作副本，包含当时尚未提交的改动。没有重置或修改原项目。原查看器提交与快照 SHA-256 记录在 [import-manifest.json](import-manifest.json)。快照的源代码提交、分支和本地修改标记原样保留；SGLang 快照包含本地修改，不能等同于纯上游提交。

这些连接表示静态结构。import / include、扩展绑定、同文件调用及按设计整理的讲解分别看待；不推断全量运行调用，不采集真实耗时。

## 重新生成数据

在当前仓库根目录执行。抽取器使用 Python 标准库，只读分析源代码，不运行目标仓库。

```powershell
python tools/code_atlas/extract_graph.py --root '你的 SGLang/python/sglang/srt 路径'
node scripts/code-atlas/sync-graph.mjs

python tools/code_atlas/extract_deepinfer.py --root '你的 DeepInfer 仓库路径'
node scripts/code-atlas/sync-graph.mjs deepinfer
```

也可以设置 `SGLANG_SRT_ROOT` / `DEEPINFER_ROOT` 后运行 `npm run graph:sglang` / `npm run graph:deepinfer`。中间输出在忽略的 `data/code-atlas/`，站点读取已提交的 `public/code-atlas/`，部署不依赖本地源码目录。

SGLang 历史基线可通过 `SGLANG_REPO`、`SGLANG_BASELINE_REF` 指定来源，再运行 `npm run graph:previous`。

验证命令：

```powershell
node --test
python -m unittest discover -s test/code-atlas -p 'test_*.py'
npm run build
```

DeepInfer 原有架构导读见 [deepinfer-analysis.md](deepinfer-analysis.md)。
