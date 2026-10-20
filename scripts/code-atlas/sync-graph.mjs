// 把抽取产物同步到 public/，让 dev 与 build 都能以 /graph.json 访问同一份数据。
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function sync(source, target) {
  if (!existsSync(source)) return false;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log(`已同步 ${source} -> ${target}`);
  return true;
}

// 项目数据独立同步，生成 DeepInfer 时不覆盖 SGLang 快照或基线。
if (process.argv[2] === 'deepinfer') {
  if (!sync(resolve('data/code-atlas/deepinfer-graph.json'), resolve('public/code-atlas/deepinfer/graph.json'))) {
    console.error('找不到 data/code-atlas/deepinfer-graph.json，请先运行 python tools/code_atlas/extract_deepinfer.py');
    process.exit(1);
  }
  process.exit(0);
}
if (process.argv[2]) {
  console.error(`未知项目：${process.argv[2]}`);
  process.exit(1);
}

// 当前快照：前端主数据源，缺失即失败。
if (!sync(resolve('data/code-atlas/sglang-graph.json'), resolve('public/code-atlas/sglang/graph.json'))) {
  console.error(`找不到 ${resolve('data/code-atlas/sglang-graph.json')}，请先运行 python tools/code_atlas/extract_graph.py`);
  process.exit(1);
}

// 可选基线缺失时同步移除旧目标，避免新数据继续与无关旧基线比较。
if (!sync(resolve('data/code-atlas/sglang-graph.previous.json'), resolve('public/code-atlas/sglang/graph.previous.json'))) {
  rmSync(resolve('public/code-atlas/sglang/graph.previous.json'), { force: true });
  console.log('未找到源基线，已清除旧的 public 基线（可用 npm run graph:previous 生成）');
}
