import './style.css';
import { CodeScene } from './scene.js';
import { escapeHtml, fileExplanationHtml } from './file-details.js';
import { PROJECTS, RELATION_LABELS, projectHref, parseCodeAtlasRoute } from './projects.js';
import {
  buildDiff, buildIndex, CHANGE_LABELS, diffColor, districtColor, formatNumber, orderSymbols, searchFiles,
  symbolColor, symbolNeighbors, summarizeDistrict
} from './derive.js';

// 请求生命周期的讲解步骤：每个步骤都指向抽取结果中真实存在的文件，避免出现悬空引用。
const SGLANG_STORY = [
  {
    title: '请求进入与分词',
    file: 'managers/tokenizer_manager.py',
    detail: '外部请求先到这里：校验参数、分词、组装成内部请求对象，再交给调度侧。这一步决定了后续批处理里有“什么内容”。'
  },
  {
    title: '调度循环',
    file: 'managers/scheduler.py',
    detail: '整个运行时的心跳。维护等待队列与运行批、决定 prefill 与 decode 的取舍、向显存池申请 KV 空间，并把工作交给模型执行侧。'
  },
  {
    title: '批的组织',
    file: 'managers/schedule_batch.py',
    detail: '把若干请求组织成一个可执行的批，记录每个请求的序列长度、采样参数与前缀匹配结果，形成执行侧需要的输入描述。'
  },
  {
    title: 'KV 池与显存分配',
    file: 'mem_cache/memory_pool.py',
    detail: '按 token 粒度管理 KV 池：分配、回收与复用。前缀命中由 radix cache 决定，命中部分直接复用已有 KV，未命中才需要计算。'
  },
  {
    title: '模型前向执行',
    file: 'model_executor/model_runner.py',
    detail: '准备输入张量、调用模型 forward、处理 logits 与采样，并把输出写回结果队列。CUDA graph 与 eager 的差异也发生在这里。'
  },
  {
    title: '输出回传',
    file: 'managers/detokenizer_manager.py',
    detail: '把生成的 token 还原成文本并按请求流式返回；至此一次迭代闭环，调度侧继续下一轮。'
  }
];

export function createCodeAtlas(container,{projectId='sglang',hash=location.hash}={}) {
const project=PROJECTS.find(item=>item.id===projectId)||PROJECTS[0];
const controller=new AbortController();let disposed=false,routeHash=hash,blurTimer=null;
const STORY = project.story || SGLANG_STORY;

const app = container;
let graph = null;
let index = null;
let scene = null;
let storyTimer = null;
let toastTimer = null;
let baselineAvailable = false;   // public/graph.previous.json 是否存在
let diff = null;                 // buildDiff 结果，首次开启对比时按需构建
let compareLoading = false;
let inspectorContext = null;

const state = {
  district: null, file: null, symbol: null, interior: null, colorMode: 'district', labels: true,
  story: false, storyIndex: 0, view: 'iso', compare: false, removed: null
};

const ready=boot().catch(error => {
  if(disposed||error.name==='AbortError')return;
  console.error(error);
  scene?.dispose();
  app.innerHTML = `<div class="app"><div class="panel panel-block"><h2>启动失败 · ${project.name}</h2><p>${escapeHtml(error.name)}: ${escapeHtml(error.message || error)}<br />数据快照暂未加载，请刷新页面或切换项目后重试。</p><a href="${escapeAttr(projectHref('sglang', location.href))}">返回 SGLang 地图</a></div></div>`;
});

async function boot() {
  app.className = 'code-atlas';
  app.innerHTML = shell();
  document.title = `${project.name} 源码地图 · INFAR`;
  app.querySelector('#stage-title').textContent = '正在加载依赖图…';
  const response = await fetch(`${import.meta.env.BASE_URL}${project.graph}`,{signal:controller.signal});
  if (!response.ok) throw new Error(`${project.graph} ${response.status}`);
  graph = await response.json();
  if(disposed)return;
  index = buildIndex(graph);
  renderHeaderStats();
  renderLegend();
  renderDistricts();
  renderTopFanIn();
  scene = new CodeScene(app.querySelector('#stage-canvas'), {
    onSelect: hit => (hit?.removed ? showRemovedFile(hit.id) : selectNode(hit, { toggle: true })),
    onHover: hit => setHint(hit)
  });
  scene.build(index);
  renderInspector();
  renderStory();
  renderCrumbs();
  updateCityButton();
  updateCompareButton();
  wireEvents();
  applyRoute();
  probeBaseline();
}

// 只探测基线文件是否存在（HEAD，不下载内容）；真正的数据在用户开启对比时才拉。
async function probeBaseline() {
  if (!project.baseline) { baselineAvailable = false; updateCompareButton(); return; }
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${project.baseline}`, { method: 'HEAD', cache: 'no-store',signal:controller.signal });
    if(disposed)return;baselineAvailable = response.ok;
  } catch {
    if(disposed)return;baselineAvailable = false;
  }
  updateCompareButton();
}

function shell() {
  return `<header class="ca-project-header">
    <div class="ca-project-brand">${project.name}<span>源码依赖地图</span><small>${project.root}</small></div>

    <div class="header-stats" id="header-stats"></div>
  </header>
  <div class="layout">
    <aside class="panel nav-panel">
      <div class="panel-block"><h2>街区（${project.id === 'deepinfer' ? '架构模块' : '一级子包'}）</h2><div class="list" id="nav-districts"></div></div>
      <div class="panel-block"><h2>被依赖最多</h2><div class="list" id="nav-fanin"></div></div>
      <div class="panel-block"><h2>图例</h2><div class="legend" id="legend"></div></div>
    </aside>
    <section class="stage">
      <div class="toolbar">
        <div class="group">
          <button data-view="iso" class="active">透视</button>
          <button data-view="top">俯视</button>
          <button data-view="front">侧视</button>
        </div>
        <span class="divider"></span>
        <button data-action="overview">回到概览</button>
        <button data-action="city" hidden>返回城市</button>
        <button data-action="labels" class="active">标签</button>
        <button data-action="heat">热度着色</button>
        <button data-action="compare" title="需要先提供此项目的历史基线快照">版本对比</button>
        <span class="divider"></span>
        <button data-action="story">数据流讲解</button>
        <button data-action="fullscreen">全屏</button>
        <label class="search"><input id="search" type="search" placeholder="按路径搜索文件" aria-label="按路径搜索文件" autocomplete="off" /></label>
        <div class="suggest" id="suggest" hidden></div>
      </div>
      <div class="viewport">
        <div class="stage-canvas" id="stage-canvas">
          <div class="stage-caption"><h1 id="stage-title">概览</h1><span id="stage-subtitle"></span></div>
          <div class="canvas-hint" id="hint">点击街区看文件构成，点击建筑看依赖</div>
          <div class="zoom-controls">
            <button data-action="zoom-in" aria-label="放大">＋</button>
            <button data-action="zoom-out" aria-label="缩小">－</button>
            <button data-action="reset" aria-label="重置视角">◎</button>
          </div>
        </div>
        <div class="story" id="story" hidden>
          <div class="story-head">
            <div><span class="kicker">REQUEST LIFECYCLE · 步骤讲解</span><h3>一次请求在 ${project.name} 里经过哪些模块</h3><p>按设计流程阅读真实源码；讲解顺序不代表运行时 trace。点击步骤可定位对应建筑。</p></div>
            <div class="story-controls">
              <button data-action="story-prev">上一步</button>
              <button data-action="story-play" id="story-play">播放</button>
              <button data-action="story-next">下一步</button>
              <button data-action="story-close">关闭</button>
            </div>
          </div>
          <div class="story-steps" id="story-steps"></div>
          <div class="story-current" id="story-current"></div>
        </div>
      </div>
    </section>
    <aside class="panel inspector" id="inspector"></aside>
  </div><div id="code-atlas-toast" role="status" aria-live="polite"></div>`;
}

function renderHeaderStats() {
  const { meta } = graph;
  const cell = (label, value) => `<div><span>${label}</span><strong>${value}</strong></div>`;
  const rows = [
    ['文件', formatNumber(meta.fileCount)],
    ['总行数', formatNumber(meta.locTotal)],
    ['依赖边', formatNumber(meta.edgeCount)],
    [project.id === 'deepinfer' ? '架构模块' : '一级子包', formatNumber(meta.districtCount)],
    ['未解析 import', formatNumber(meta.unresolvedImports)]
  ];
  let html = rows.map(([label, value]) => cell(label, value)).join('');
  if (state.compare && diff) html += compareHeaderHtml(diff);
  app.querySelector('#header-stats').innerHTML = html;
}

// 顶部统计区的对比块：四个总量各给出“旧 → 新（Δ）”，再列出四类变化的计数。
function compareHeaderHtml(data) {
  const meters = [
    ['文件', data.stats.fileCount],
    ['总行数', data.stats.locTotal],
    ['依赖边', data.stats.edgeCount],
    ['符号数', data.stats.symbolTotal]
  ];
  const metersHtml = meters.map(([label, meter]) =>
    `<div><span>Δ ${label}</span><strong>${formatNumber(meter.old)} → ${formatNumber(meter.new)} <i class="${deltaClass(meter.delta)}">${signedDelta(meter.delta)}</i></strong></div>`).join('');
  const countsHtml = ['added', 'removed', 'grown', 'shrunk'].map(change =>
    `<div><span>${CHANGE_LABELS[change]}</span><strong><i class="d-dot" style="background:${diffColor(change)}"></i>${formatNumber(data.stats.counts[change])}</strong></div>`).join('');
  return `<div class="stat-divider"></div>${metersHtml}${countsHtml}`;
}

function renderLegend() {
  const edgeKinds = graph.meta.edgeKinds;
  const sourceNote = edgeKinds
    ? `依赖边：${formatNumber(edgeKinds.import)} 条 Python import · ${formatNumber(edgeKinds.include)} 条本地 #include · ${formatNumber(edgeKinds.binding)} 条已核对的扩展绑定。动态算子分派与外部库未展开；C++ 未解析符号楼层。`
    : '依赖边表示 import 关系，不等于运行时调用关系；注册表、插件与 hook 造成的动态装配不在图中。';
  const diffRows = state.compare && diff
    ? ['added', 'removed', 'grown', 'shrunk', 'stable'].map(change =>
      `<div class="row"><span><i class="d-dot" style="background:${diffColor(change)}"></i>${CHANGE_LABELS[change]}</span><span>${formatNumber(diff.stats.counts[change])}</span></div>`).join('')
    : '';
  app.querySelector('#legend').innerHTML = `
    <div class="bar"></div>
    <div class="row"><span>建筑高度 ∝ 文件行数（对数）</span><span>最高 ${formatNumber(index.maxLoc)} 行</span></div>
    <div class="row"><span>颜色：默认按街区区分</span><span>切换“热度着色”看被依赖程度</span></div>
    ${diffRows}
    <p class="note">数据来自 <code>${escapeHtml(graph.meta.root)}</code> 的静态分析${graph.meta.generatedAt ? `，生成于 ${new Date(graph.meta.generatedAt).toLocaleString('zh-CN')}` : ''}。${sourceNote}</p>
    ${graph.meta.languageCounts ? `<p class="note">${Object.entries(graph.meta.languageCounts).map(([language, count]) => `${escapeHtml(language)} ${count} 文件`).join(' · ')}。函数和类仅统计 Python / 类型桩。</p>` : ''}`;
}

function districtRow(district, indexInList) {
  return `<button data-district="${district.id}" class="${state.district === district.id ? 'active' : ''}">
    <span class="dot" style="background:${districtColor(indexInList)}"></span>
      <span class="path" title="${escapeAttr(district.id)}">${escapeHtml(district.name || district.id)}</span>
    <span class="meta">${district.fileCount} · ${formatNumber(district.loc)}</span>
  </button>`;
}

function renderDistricts() {
  // 展示全部街区：layoutDistricts 与这里都按 loc 降序，列表序号与 3D 中的街区色相保持一致。
  const list = [...graph.districts].sort((a, b) => b.loc - a.loc);
  app.querySelector('#nav-districts').innerHTML = list.map((district, i) => districtRow(district, i)).join('');
}

function renderTopFanIn() {
  const list = graph.topFanIn.slice(0, 10);
  app.querySelector('#nav-fanin').innerHTML = list.map((entry, i) => `
    <button data-file="${escapeAttr(entry.id)}" class="${state.file === entry.id ? 'active' : ''}">
      <span class="rank">${String(i + 1).padStart(2, '0')}</span>
      <span class="path">${entry.id}</span>
      <span class="meta">${entry.fanIn}</span>
    </button>`).join('');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function edgeList(title, edges, emptyText, scroll = false) {
  const rows = edges.length
    ? edges.map(edge => `<button data-${edge.kind}="${escapeAttr(edge.id)}"><span class="path">${edge.label ?? edge.id}</span><span class="meta">${edge.meta ?? `×${edge.weight}`}</span></button>`).join('')
    : `<span class="note">${emptyText}</span>`;
  return `<div class="panel-block"><h2>${title}</h2><div class="list${scroll ? ' scroll' : ''}">${rows}</div></div>`;
}

function symbolRow(symbol, active) {
  return `<button data-symbol="${escapeAttr(symbol.id)}" class="${active ? 'active' : ''}">
    <span class="dot" style="background:${symbolColor(symbol.kind)}"></span>
    <span class="path">${symbol.name}</span>
    <span class="meta">${symbol.kind} · ${symbol.start}–${symbol.end} · ${symbol.loc} 行</span>
  </button>`;
}

function renderInspector() {
  renderInspectorContents();
  const context = state.removed ? `removed:${state.removed}`
    : state.interior ? `interior:${state.interior}:${state.symbol || ''}`
      : state.file ? `file:${state.file}` : `district:${state.district || ''}`;
  if (context !== inspectorContext) app.querySelector('#inspector').scrollTop = 0;
  inspectorContext = context;
}

function renderInspectorContents() {
  const el = app.querySelector('#inspector');
  if (state.removed) {
    const entry = diff?.entries.get(state.removed);
    if (entry) {
      el.innerHTML = `
        <div class="panel-block identity">
          <h2>建筑检查器 · 已删除文件</h2>
          <code>${entry.id}</code>
          <span>${entry.district || '—'} · 当前快照中已不存在，仅列出基线快照的旧指标</span>
        </div>
        <div class="panel-block"><div class="stat-grid">
          <div><span>旧总行数</span><strong>${formatNumber(entry.loc.old ?? 0)}</strong></div>
          <div><span>旧符号数</span><strong>${formatNumber(entry.symbols.old ?? 0)}</strong></div>
          <div><span>旧被依赖</span><strong>${formatNumber(entry.fanIn.old ?? 0)}</strong></div>
          <div><span>变化</span><strong><i class="d-dot" style="background:${diffColor('removed')}"></i>${CHANGE_LABELS.removed}</strong></div>
        </div></div>
        ${fileExplanationHtml(entry, { historical: true })}
        <div class="panel-block"><p class="note">该文件存在于基线快照、在当前快照中被删除：3D 里用红色影板占位（所属街区没有空网格时不做 3D 表达）。</p></div>
        ${compareBoardsHtml()}`;
      bindInspector();
      return;
    }
  }
  if (state.interior) {
    const file = index.filesById.get(state.interior);
    const symbols = orderSymbols(file.symbols);
    if (state.symbol && !symbols.some(item => item.id === state.symbol)) state.symbol = null;
    const symbol = state.symbol ? symbols.find(item => item.id === state.symbol) : null;
    if (!symbol) {
      const kinds = { class: 0, function: 0, method: 0 };
      let callEdges = 0;
      for (const item of symbols) { kinds[item.kind] = (kinds[item.kind] || 0) + 1; callEdges += item.calls?.length || 0; }
      el.innerHTML = `
        <div class="panel-block identity">
          <h2>建筑检查器 · 内部视图</h2>
          <code>${file.id}</code>
          <span>${file.symbols.length} 个符号 · ${formatNumber(file.loc)} 行 · 自下而上按起始行排列</span>
        </div>
        ${fileExplanationHtml(file)}
        <div class="panel-block"><div class="stat-grid">
          <div><span>类</span><strong>${formatNumber(kinds.class || 0)}</strong></div>
          <div><span>函数</span><strong>${formatNumber(kinds.function || 0)}</strong></div>
          <div><span>方法</span><strong>${formatNumber(kinds.method || 0)}</strong></div>
          <div><span>调用边（同文件）</span><strong>${formatNumber(callEdges)}</strong></div>
        </div></div>
        <div class="panel-block"><div class="list scroll">
          ${symbols.map(item => symbolRow(item, false)).join('')}
        </div></div>
        <div class="panel-block"><button class="action" data-action="city">返回城市</button></div>`;
      bindInspector();
      return;
    }
    const { out, in: incoming } = symbolNeighbors(file, symbol.id);
    el.innerHTML = `
      <div class="panel-block identity">
        <h2>楼层检查器 · 符号</h2>
        <code>${symbol.name}</code>
        <span>${file.id} · ${symbol.kind} · 行 ${symbol.start}–${symbol.end} · ${formatNumber(symbol.loc)} 行</span>
      </div>
      <div class="panel-block"><div class="stat-grid">
        <div><span>类型</span><strong>${symbol.kind}</strong></div>
        <div><span>行数</span><strong>${formatNumber(symbol.loc)}</strong></div>
        <div><span>调用出去</span><strong>${out.length}</strong></div>
        <div><span>被调用</span><strong>${incoming.length}</strong></div>
      </div></div>
      ${edgeList('它调用（同文件符号）', out.map(item => ({ id: item.id, kind: 'symbol', label: item.name, meta: item.kind })), '没有调用同文件里的其他符号。', true)}
      ${edgeList('被哪些同文件符号调用', incoming.map(item => ({ id: item.id, kind: 'symbol', label: item.name, meta: item.kind })), '没有被同文件符号调用。', true)}
      <div class="panel-block"><button class="back" data-action="symbols-back">← 返回符号列表</button></div>`;
    bindInspector();
    return;
  }
  if (state.file) {
    const file = index.filesById.get(state.file);
    const edgeRow = edge => ({ ...edge, kind: 'file', meta: `${RELATION_LABELS[edge.relation] || 'import'} ×${edge.weight}` });
    const out = (index.outMap.get(file.id) || []).slice(0, 10).map(edgeRow);
    const incoming = (index.inMap.get(file.id) || []).slice(0, 10).map(edgeRow);
    const native = file.language === 'C++';
    const symbolCount = file.symbols?.length || 0;
    el.innerHTML = `
      <div class="panel-block identity">
        <h2>建筑检查器 · 文件</h2>
        <code>${file.id}</code>
        <span>${file.language ? escapeHtml(file.language) + ' · ' : ''}${escapeHtml(file.district)}${file.sub ? ' / ' + escapeHtml(file.sub) : ''} · 静态依赖图中的一个节点</span>
      </div>
      ${fileExplanationHtml(file)}
      <div class="panel-block"><div class="stat-grid">
        <div><span>总行数</span><strong>${formatNumber(file.loc)}</strong></div>
        <div><span>代码行</span><strong>${formatNumber(file.codeLines)}</strong></div>
        <div><span>函数 / 方法</span><strong>${native ? '未解析' : formatNumber(file.defs)}</strong></div>
        <div><span>类</span><strong>${native ? '未解析' : formatNumber(file.classes)}</strong></div>
        <div><span>依赖出去</span><strong>${file.fanOut}</strong></div>
        <div><span>被依赖</span><strong>${file.fanIn}</strong></div>
      </div></div>
      <div class="panel-block">
        <button class="action" data-enter-interior="${escapeAttr(file.id)}" ${symbolCount ? '' : 'disabled'}>
          进入内部视图${symbolCount ? ` · ${symbolCount} 个符号${file.language === 'Python stub' ? '声明' : ''}` : native ? '（C++ 未解析楼层）' : '（没有抽取到符号）'}
        </button>
      </div>
      ${edgeList('它依赖', out, '没有解析到内部依赖。')}
      ${edgeList('谁依赖它', incoming, '没有同根文件引用它。')}
      ${fileDiffHtml(file.id)}
      ${compareBoardsHtml()}`;
    bindInspector();
    return;
  }
  if (state.district) {
    const district = index.districtById.get(state.district);
    const out = (index.districtOut.get(district.id) || []).map(edge => ({ ...edge, kind: 'district' }));
    const incoming = (index.districtIn.get(district.id) || []).map(edge => ({ ...edge, kind: 'district' }));
    const biggest = [...district.files].map(id => index.filesById.get(id)).sort((a, b) => b.loc - a.loc).slice(0, 8)
      .map(file => ({ id: file.id, weight: file.loc, kind: 'file' }));
    el.innerHTML = `
      <div class="panel-block identity">
        <h2>街区检查器 · 子包</h2>
        <code>${district.id}</code>
        <span>${district.path} · ${district.fileCount} 个文件</span>
      </div>
      ${district.description ? `<div class="panel-block file-guide"><h3>${escapeHtml(district.description.title)}</h3><p>${escapeHtml(district.description.summary)}</p></div>` : ''}
      <div class="panel-block"><div class="stat-grid">
        <div><span>总行数</span><strong>${formatNumber(district.loc)}</strong></div>
        <div><span>代码行</span><strong>${formatNumber(district.codeLines)}</strong></div>
        <div><span>函数 / 方法</span><strong>${formatNumber(district.defs)}</strong></div>
        <div><span>类</span><strong>${formatNumber(district.classes)}</strong></div>
        <div><span>依赖出去</span><strong>${district.fanOut}</strong></div>
        <div><span>被依赖</span><strong>${district.fanIn}</strong></div>
      </div></div>
      ${district.subs?.length ? `<div class="panel-block"><h2>二级目录</h2><div class="list">${district.subs.map(sub => `<span class="note">${sub.name} · ${sub.fileCount} 文件 · ${formatNumber(sub.loc)} 行</span>`).join('')}</div></div>` : ''}
      ${edgeList('依赖的街区', out, '没有跨街区依赖。')}
      ${edgeList('被哪些街区依赖', incoming, '没有其他街区依赖它。')}
      ${edgeList('最大的文件（点击进入）', biggest, '该街区没有文件。')}
      ${districtDiffHtml(district.id)}
      ${compareBoardsHtml()}`;
    bindInspector();
    return;
  }
  const top = graph.topFiles.slice(0, 8).map(entry => ({ id: entry.id, weight: entry.loc, kind: 'file' }));
  const analysis = graph.meta.analysis;
  el.innerHTML = `
    <div class="panel-block identity">
      <h2>概览 · ${project.name}</h2>
      <span>点击 3D 中的街区或建筑，或在左侧列表中选择，查看它的体量、依赖与邻居。</span>
    </div>
    <div class="panel-block"><div class="stat-grid">
      <div><span>建筑总数</span><strong>${formatNumber(graph.meta.fileCount)}</strong></div>
      <div><span>街区总数</span><strong>${formatNumber(graph.meta.districtCount)}</strong></div>
      <div><span>函数 / 方法</span><strong>${formatNumber(graph.meta.defTotal)}</strong></div>
      <div><span>类</span><strong>${formatNumber(graph.meta.classTotal)}</strong></div>
    </div></div>
    ${analysis ? `<div class="panel-block file-guide"><h3>架构导读</h3><p>${escapeHtml(analysis.summary)}</p>${analysis.notes.map(note => `<p class="analysis-note">${escapeHtml(note)}</p>`).join('')}</div>
      ${edgeList('建议阅读入口', analysis.entryFiles.map(id => ({ id, kind: 'file', label: index.filesById.get(id)?.description?.title || id, meta: '定位' })), '暂无入口。')}
      <div class="panel-block"><p>来源：${escapeHtml(graph.meta.source?.ref || '未标记版本')} · ${escapeHtml(graph.meta.source?.commit?.slice(0, 12) || '未知提交')}${graph.meta.source?.dirty ? ' · 含本地改动' : ''}。范围：${graph.meta.scope.map(escapeHtml).join(' / ')}。</p></div>` : ''}
    ${edgeList('最大的文件（点击进入）', top, '暂无数据。')}
    ${compareBoardsHtml()}`;
  bindInspector();
}

// 变化量的符号化展示与配色类名（供统计区与检查器复用）。
function signedDelta(value) {
  return value === 0 ? '±0' : `${value > 0 ? '+' : ''}${formatNumber(value)}`;
}

function deltaClass(value) {
  return value > 0 ? 'd-up' : value < 0 ? 'd-down' : 'd-flat';
}

// 文件检查器里的“版本对比”块：旧值 / 新值 / Δ 与变化类别。
function fileDiffHtml(fileId) {
  if (!state.compare || !diff) return '';
  const entry = diff.entries.get(fileId);
  if (!entry) return '';
  const rows = [['loc', '总行数'], ['symbols', '符号数'], ['fanIn', '被依赖']]
    .map(([key, label]) => {
      const meter = entry[key];
      return `<div><span>${label}</span><strong>${meter.old ?? '—'} → ${meter.new ?? '—'} <i class="${deltaClass(meter.delta)}">${signedDelta(meter.delta)}</i></strong></div>`;
    }).join('');
  return `<div class="panel-block diff-block">
    <h2>版本对比 · <i class="d-dot" style="background:${diffColor(entry.change)}"></i>${CHANGE_LABELS[entry.change]}</h2>
    <div class="stat-grid">${rows}</div>
  </div>`;
}

// 街区检查器里的“版本对比”块：本街区的四类变化计数。
function districtDiffHtml(districtId) {
  if (!state.compare || !diff) return '';
  const counts = summarizeDistrict(diff, districtId);
  const parts = ['added', 'removed', 'grown', 'shrunk'].map(change =>
    `<div><span>${CHANGE_LABELS[change]}</span><strong><i class="d-dot" style="background:${diffColor(change)}"></i>${formatNumber(counts[change])}</strong></div>`).join('');
  return `<div class="panel-block diff-block"><h2>版本对比 · 本街区</h2><div class="stat-grid">${parts}</div></div>`;
}

// 右侧的四个变化榜单：增长最多 / 缩小最多 / 新增 / 删除，各取前 8 条。
function compareBoardsHtml() {
  if (!state.compare || !diff) return '';
  const changeMeta = entry => {
    if (entry.loc.delta !== 0) return `${entry.loc.delta > 0 ? '+' : ''}${formatNumber(entry.loc.delta)} 行`;
    if (entry.symbols.delta !== 0) return `${entry.symbols.delta > 0 ? '+' : ''}${entry.symbols.delta} 符号`;
    return `${entry.fanIn.delta > 0 ? '+' : ''}${entry.fanIn.delta} 被依赖`;
  };
  const board = (title, entries, meta) => {
    const rows = entries.length
      ? entries.map(entry => `<button data-${entry.change === 'removed' ? 'removed-file' : 'file'}="${escapeAttr(entry.id)}">
          <span class="dot" style="background:${diffColor(entry.change)}"></span>
          <span class="path">${entry.id}</span>
          <span class="meta">${meta(entry)}</span>
        </button>`).join('')
      : '<span class="note">这一类没有变化。</span>';
    return `<div class="panel-block"><h2>${title}</h2><div class="list scroll">${rows}</div></div>`;
  };
  return board('增长最多', diff.boards.grown, changeMeta)
    + board('缩小最多', diff.boards.shrunk, changeMeta)
    + board('新增文件', diff.boards.added, entry => `${formatNumber(entry.loc.new || 0)} 行`)
    + board('删除文件', diff.boards.removed, entry => `旧 ${formatNumber(entry.loc.old || 0)} 行`);
}

function bindInspector(scope = app.querySelector('#inspector')) {
  scope.querySelectorAll('[data-inspect-symbol]').forEach(node => node.addEventListener('click', () => {
    enterInterior(node.dataset.ownerFile);
    selectSymbol(node.dataset.inspectSymbol);
  }));
  scope.querySelectorAll('[data-district]').forEach(node => node.addEventListener('click', () => selectNode({ kind: 'district', id: node.dataset.district })));
  scope.querySelectorAll('[data-file]').forEach(node => node.addEventListener('click', () => selectNode({ kind: 'file', id: node.dataset.file })));
  scope.querySelectorAll('[data-removed-file]').forEach(node => node.addEventListener('click', () => showRemovedFile(node.dataset.removedFile)));
  scope.querySelectorAll('[data-symbol]').forEach(node => node.addEventListener('click', () => selectSymbol(node.dataset.symbol)));
  scope.querySelectorAll('[data-enter-interior]').forEach(node => node.addEventListener('click', () => enterInterior(node.dataset.enterInterior)));
  scope.querySelectorAll('[data-action="city"]').forEach(node => node.addEventListener('click', () => exitInterior()));
  scope.querySelectorAll('[data-action="symbols-back"]').forEach(node => node.addEventListener('click', () => selectSymbol(null)));
}

function renderStory() {
  const steps = app.querySelector('#story-steps');
  steps.innerHTML = STORY.map((step, i) => `
    <button class="story-node ${i === state.storyIndex ? 'is-active' : ''} ${i < state.storyIndex ? 'is-done' : ''}" data-story="${i}">
      <span class="story-node-index">${String(i + 1).padStart(2, '0')}</span>
      <span class="story-node-title">${step.title}</span>
    </button>${i < STORY.length - 1 ? '<span class="story-arrow">›</span>' : ''}`).join('');
  const current = STORY[state.storyIndex];
  app.querySelector('#story-current').innerHTML = `
    <span class="kicker">STEP ${String(state.storyIndex + 1).padStart(2, '0')} / ${String(STORY.length).padStart(2, '0')}</span>
    <h4>${current.title}</h4>
    <p>${current.detail}</p>
    <div class="story-refs"><button data-file="${escapeAttr(current.file)}">${current.file}</button></div>`;
  app.querySelector('#story-play').textContent = storyTimer ? '暂停' : '播放';
  steps.querySelectorAll('[data-story]').forEach(node => node.addEventListener('click', () => gotoStory(Number(node.dataset.story))));
  bindInspector(app.querySelector('#story-current'));
}

function renderCrumbs() {
  setHint(null);
  const removedEntry = state.removed ? diff?.entries.get(state.removed) : null;
  if (removedEntry) {
    app.querySelector('#stage-title').textContent = `${removedEntry.id.split('/').pop()} · 已删除`;
    app.querySelector('#stage-subtitle').textContent = `基线快照中 ${formatNumber(removedEntry.loc.old ?? 0)} 行 · 当前快照已不存在`;
    return;
  }
  const file = state.interior ? index.filesById.get(state.interior) : null;
  const title = file
    ? `${state.interior.split('/').pop()} · 内部`
    : state.file ? state.file.split('/').pop() : state.district || '概览';
  app.querySelector('#stage-title').textContent = title;
  if (!graph.files.length) {
    app.querySelector('#stage-title').textContent = '暂无 Python 文件';
    app.querySelector('#stage-subtitle').textContent = '所选源码目录为空，请选择包含 Python 文件的目录重新生成依赖图。';
    return;
  }
  if (file) {
    app.querySelector('#stage-subtitle').textContent = `${file.symbols.length} 个符号 · ${formatNumber(file.loc)} 行 · 每层一个符号`;
    return;
  }
  const district = state.file ? index.filesById.get(state.file)?.district : state.district;
  const locus = index.districtById.get(district);
  app.querySelector('#stage-subtitle').textContent = locus
    ? `${locus.path} · ${locus.fileCount} 文件 · ${formatNumber(locus.loc)} 行`
    : `${graph.meta.fileCount} 个文件 · ${graph.meta.districtCount} 个街区 · 高度表示行数`;
}

function setHint(hit) {
  const hint = app.querySelector('#hint');
  if (!hit) {
    hint.textContent = state.interior
      ? '点击楼层看它调用谁、又被谁调用；按 Esc 或“返回城市”退出'
      : '点击街区看文件构成，点击建筑看依赖';
    return;
  }
  if (hit.kind === 'symbol') {
    hint.textContent = `${hit.name} · ${hit.symbolKind} · 行 ${hit.start}–${hit.end}（${hit.loc} 行） · 点击看它的同文件调用`;
    return;
  }
  hint.textContent = hit.kind === 'district'
    ? `${hit.id} · 点击展开这个街区的文件`
    : `${hit.id} · 点击查看它的依赖（已选中时再点一次进入内部视图）`;
}

function selectNode({ kind, id }, options = {}) {
  if (!index) return;
  if (kind === 'symbol') { selectSymbol(id); return; }
  // 已选中同一栋建筑时再次点击，等价于下钻到文件内部。
  if (options.toggle && kind === 'file' && id === state.file && state.interior !== id) { enterInterior(id); return; }
  state.removed = null;
  leaveInterior();
  if (kind === 'district') {
    if (!index.districtById.has(id)) return;
    state.district = id;
    state.file = null;
    scene.setFocusDistrict(id);
    scene.setSelection({ kind: 'district', id });
  } else {
    if (!index.filesById.has(id)) return;
    state.file = id;
    state.district = index.filesById.get(id).district;
    scene.setSelection({ kind: 'file', id });
  }
  if (options.frame !== false) scene.frame({ kind, id });
  renderDistricts();
  renderTopFanIn();
  renderInspector();
  renderCrumbs();
  updateHash();
}

// 点击 removed 榜单条目或它的影子底板：只展示旧指标，不动 3D 选中与镜头。
function showRemovedFile(id) {
  if (!index || !diff || !diff.entries.has(id)) return;
  state.removed = id;
  renderInspector();
  renderCrumbs();
  notify(`${id} 在当前快照中已被删除，仅显示基线快照的旧指标。`);
}

// ---- 版本对比：按需加载基线并切换差异着色 ----
async function toggleCompare() {
  if (!project.baseline) { notify('DeepInfer 尚未提供历史基线快照。'); return; }
  if (compareLoading) return;
  if (state.compare) { setCompare(false); return; }
  const button = app.querySelector('[data-action="compare"]');
  compareLoading = true;
  updateCompareButton();
  button.textContent = '版本对比 · 加载中…';
  try {
    if (!diff) {
      const response = await fetch(`${import.meta.env.BASE_URL}${project.baseline}`,{signal:controller.signal});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const baseline=await response.json();
      if(disposed)return;
      diff = buildDiff(graph,baseline);
      if (!diff) throw new Error('基线格式或数据来源与当前快照不一致');
      baselineAvailable = true;
    }
    setCompare(true);
  } catch (error) {
    if(disposed)return;
    diff = null;
    baselineAvailable = false;
    notify(`基线快照加载失败（${error.message}）。请检查此项目的历史基线快照。`);
  } finally {
    if(disposed)return;
    compareLoading = false;
    button.textContent = '版本对比';
    updateCompareButton();
  }
}

function setCompare(on) {
  state.compare = !!on;
  if (!state.compare) state.removed = null;
  scene.setDiff(state.compare ? diff : null);
  const button = app.querySelector('[data-action="compare"]');
  button.classList.toggle('active', state.compare);
  updateCompareButton();
  renderHeaderStats();
  renderLegend();
  renderInspector();
  renderCrumbs();
  if (state.compare) {
    const { counts } = diff.stats;
    notify(`版本对比已开启：${counts.grown} 个文件增长、${counts.shrunk} 个缩小、${counts.added} 个新增、${counts.removed} 个删除。`);
  } else {
    notify('已关闭版本对比，颜色恢复为普通着色。');
  }
}

// 按钮可用性：基线缺失时只做视觉提示而不禁用，因为禁用会让点击事件直接失效，
// 用户就无法触发 toggleCompare 里的"重新探测 + 明确提示"兜底路径。
function updateCompareButton() {
  const button = app.querySelector('[data-action="compare"]');
  if (!button) return;
  button.hidden = !project.baseline;
  const unavailable = !state.compare && !baselineAvailable;
  button.disabled = compareLoading;
  button.classList.toggle('is-unavailable', unavailable);
  button.title = unavailable
    ? '需要先提供此项目的历史基线快照 才能启用版本对比（点击可重试探测）'
    : '对比当前快照与已保存的历史基线';
}

// ---- 内部视图：状态与场景同步 ----
function enterInterior(fileId) {
  if (!index) return;
  const file = index.filesById.get(fileId);
  if (!file) return;
  if (!(file.symbols?.length)) { notify(`${fileId} 没有抽取到符号，无法进入内部视图。`); return; }
  if (state.story) setStory(false);
  if (!scene.setInterior(fileId)) { notify(`${fileId} 无法进入内部视图。`); return; }
  state.removed = null;
  state.interior = fileId;
  state.symbol = null;
  state.file = fileId;
  state.district = file.district;
  scene.setSelection({ kind: 'file', id: fileId });
  scene.frame({ kind: 'file', id: fileId });
  renderDistricts();
  renderTopFanIn();
  renderInspector();
  renderCrumbs();
  updateCityButton();
  updateHash();
  notify(`内部视图：${file.symbols.length} 个符号已展开；点击右侧符号可放大定位该层，查看同文件调用。`);
}

function exitInterior() {
  if (!state.interior) return;
  state.removed = null;
  const file = state.interior;
  state.interior = null;
  state.symbol = null;
  scene.clearInterior();
  if (state.file) {
    scene.setSelection({ kind: 'file', id: state.file });
    scene.frame({ kind: 'file', id: state.file });
  } else {
    scene.setSelection(null);
    scene.frameAll();
  }
  renderInspector();
  renderCrumbs();
  updateCityButton();
  updateHash();
  notify(`已回到城市视图：${file} 恢复为建筑。`);
}

// 退出内部视图但不重渲染面板（供切换选中项时复用）。
function leaveInterior() {
  if (!state.interior) return;
  state.interior = null;
  state.symbol = null;
  scene.clearInterior();
  updateCityButton();
}

function selectSymbol(symbolId) {
  if (!state.interior) return;
  const file = index.filesById.get(state.interior);
  if (symbolId && !file?.symbols?.some(symbol => symbol.id === symbolId)) return;
  state.removed = null;
  state.symbol = symbolId || null;
  scene.setSelection(state.symbol
    ? { kind: 'symbol', id: state.symbol, file: state.interior }
    : { kind: 'file', id: state.interior });
  scene.frame(state.symbol ? { kind: 'symbol', id: state.symbol } : { kind: 'file', id: state.interior });
  renderInspector();
  renderCrumbs();
}

function updateCityButton() {
  const button = app.querySelector('[data-action="city"]');
  if (button) button.hidden = !state.interior;
}

function showOverview() {
  leaveInterior();
  state.removed = null;
  state.district = null;
  state.file = null;
  scene.setSelection(null);
  scene.setFocusDistrict(null);
  scene.frameAll();
  renderDistricts();
  renderTopFanIn();
  renderInspector();
  renderCrumbs();
  updateHash();
}

function gotoStory(stepIndex) {
  if (!state.story) return;
  state.storyIndex = Math.min(Math.max(stepIndex, 0), STORY.length - 1);
  renderStory();
  selectNode({ kind: 'file', id: STORY[state.storyIndex].file });
}

function setStory(on) {
  state.story = !!on;
  app.querySelector('#story').hidden = !on;
  app.querySelector('[data-action="story"]').classList.toggle('active', on);
  if (on) {
    state.storyIndex = 0;
    gotoStory(0);
    notify('数据流讲解按模块顺序播放：步骤只表达设计与代码结构上的顺序，不代表真实运行时刻的调用时序。');
  } else {
    stopStoryTimer();
    renderStory();
  }
}

function startStoryTimer() {
  stopStoryTimer();
  if (!state.story) return;
  storyTimer = setInterval(() => {
    if (state.storyIndex >= STORY.length - 1) { stopStoryTimer(); renderStory(); return; }
    gotoStory(state.storyIndex + 1);
  }, 4200);
  renderStory();
}

function stopStoryTimer() {
  if (storyTimer) { clearInterval(storyTimer); storyTimer = null; }
}

function updateHash() {
  const hash = state.interior
    ? `#/i/${encodeURIComponent(state.interior)}`
    : state.file ? `#/f/${encodeURIComponent(state.file)}` : state.district ? `#/d/${encodeURIComponent(state.district)}` : '#/';
  const next=`#/${project.id}${hash==='#/'?'':hash.slice(1)}`;
  routeHash=next;history.replaceState(null,'',next);
}

async function toggleFullscreen() {
  const viewport = app.querySelector('.viewport');
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await viewport.requestFullscreen();
  } catch {
    notify('当前浏览器不支持全屏，可用浏览器缩放代替。');
  }
}

function applyRoute() {
  const route=parseCodeAtlasRoute(routeHash);
  const match=route&&!route.invalid&&route.projectId===project.id?[null,route.kind,route.id]:null;
  if (!match || !match[1]) { showOverview(); return; }
  let id;
  try { id = match[2]; }
  catch { showOverview(); notify('链接中的路径格式无效，已回到概览。'); return; }
  if (!(match[1] === 'd' ? index.districtById : index.filesById).has(id)) {
    showOverview(); notify('当前快照中没有链接指向的对象。'); return;
  }
  if (match[1] === 'i') {
    selectNode({ kind: 'file', id });
    if (state.file === id) enterInterior(id);
    return;
  }
  selectNode({ kind: match[1] === 'd' ? 'district' : 'file', id });
}

function wireEvents() {
  // 列表每次重渲染只替换 innerHTML，监听器统一挂在外层容器上，避免重复绑定。
  app.querySelector('#nav-districts').addEventListener('click', event => {
    const target = event.target.closest('[data-district]');
    if (target) selectNode({ kind: 'district', id: target.dataset.district });
  });
  app.querySelector('#nav-fanin').addEventListener('click', event => {
    const target = event.target.closest('[data-file]');
    if (target) selectNode({ kind: 'file', id: target.dataset.file });
  });
  app.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view;
    app.querySelectorAll('[data-view]').forEach(node => node.classList.toggle('active', node === button));
    scene.setView(state.view);
  }));

  app.querySelector('.stage').addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'overview') showOverview();
    if (action === 'city') exitInterior();
    if (action === 'labels') {
      state.labels = !state.labels;
      target.classList.toggle('active', state.labels);
      scene.setLabels(state.labels);
    }
    if (action === 'heat') {
      state.colorMode = state.colorMode === 'heat' ? 'district' : 'heat';
      target.classList.toggle('active', state.colorMode === 'heat');
      scene.setColorMode(state.colorMode);
      notify(state.colorMode === 'heat' ? '按被依赖程度着色：越暖表示被同根文件依赖得越多。' : '按街区着色。');
    }
    if (action === 'story') setStory(!state.story);
    if (action === 'compare') toggleCompare();
    if (action === 'fullscreen') toggleFullscreen();
    if (action === 'zoom-in') scene.zoom(1);
    if (action === 'zoom-out') scene.zoom(-1);
    if (action === 'reset') scene.reset();
    if (action === 'story-prev') gotoStory(state.storyIndex - 1);
    if (action === 'story-next') gotoStory(state.storyIndex + 1);
    if (action === 'story-play') { storyTimer ? stopStoryTimer() : startStoryTimer(); renderStory(); }
    if (action === 'story-close') setStory(false);
  });

  const search = app.querySelector('#search');
  const suggest = app.querySelector('#suggest');
  const renderSuggest = () => {
    const hits = searchFiles(graph, search.value, 8);
    if (!hits.length) { suggest.hidden = true; suggest.innerHTML = ''; return; }
    suggest.innerHTML = hits.map(file => `<button data-file="${escapeAttr(file.id)}"><span class="path">${file.id}</span><span class="meta">${formatNumber(file.loc)} 行</span></button>`).join('');
    suggest.hidden = false;
    suggest.querySelectorAll('[data-file]').forEach(node => node.addEventListener('click', () => {
      selectNode({ kind: 'file', id: node.dataset.file });
      suggest.hidden = true;
    }));
  };
  search.addEventListener('input', renderSuggest);
  search.addEventListener('focus', renderSuggest);
  search.addEventListener('blur', () => {clearTimeout(blurTimer);blurTimer=setTimeout(() => {if(!disposed)suggest.hidden=true;},150);});
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') { suggest.hidden = true; return; }
    if (event.key !== 'Enter') return;
    const hits = searchFiles(graph, search.value, 1);
    if (!hits.length) { notify('没有匹配该路径的文件。'); return; }
    selectNode({ kind: 'file', id: hits[0].id });
    suggest.hidden = true;
    notify(`定位到 ${hits[0].id}（${formatNumber(hits[0].loc)} 行）`);
  });

  document.addEventListener('keydown', event => {
    if(disposed||document.querySelector('#modal-root')?.innerHTML)return;
    if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.metaKey || event.ctrlKey) return;
    if (['1', '2', '3'].includes(event.key)) {
      const view = ['iso', 'top', 'front'][Number(event.key) - 1];
      state.view = view;
      app.querySelectorAll('[data-view]').forEach(node => node.classList.toggle('active', node.dataset.view === view));
      scene.setView(view);
    }
    // Esc：内部视图先退回该文件的城市视图，再按一次才回概览。
    if (event.key === 'Escape') {
      if (state.interior) exitInterior();
      else showOverview();
    }
    if (state.story && event.key === 'ArrowRight') { event.preventDefault(); gotoStory(state.storyIndex + 1); }
    if (state.story && event.key === 'ArrowLeft') { event.preventDefault(); gotoStory(state.storyIndex - 1); }
  },{signal:controller.signal});
}

function notify(message) {
  const el = app.querySelector('#code-atlas-toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3200);
}

return {projectId:project.id,ready,navigate(hash){routeHash=hash;if(index)applyRoute();},dispose(){disposed=true;controller.abort();stopStoryTimer();clearTimeout(toastTimer);clearTimeout(blurTimer);scene?.dispose();scene=null;},modalContent(type){
 const meta=graph?.meta;
 if(type==='sources')return `<div class="eyebrow">SOURCE SNAPSHOT / ${project.name.toUpperCase()}</div><h2>${project.name} 源码地图</h2><p class="modal-intro">基于本地代码仓的静态分析快照，保留文件说明、依赖与符号楼层。</p><div class="model-disclaimer"><div><strong>源码快照</strong><p>提交：${escapeHtml(meta?.source?.commit||'加载中')}<br>分支 / 版本：${escapeHtml(meta?.source?.ref||'—')} · ${meta?.source?.dirty?'包含本地修改':'无本地修改'}<br>范围：${escapeHtml(meta?.root||project.root)}</p></div></div><p class="modal-intro">街区表示功能模块，建筑表示文件，高度按总行数映射。连接表示静态 import、include 或注明的扩展绑定，不等同于完整运行时调用。符号楼层显示 Python 定义及同文件调用；C++ 仅展示行数与 include。</p>`;
 return `<div class="eyebrow">EXPLORE / ${project.name.toUpperCase()}</div><h2>从街区走进源码。</h2><p class="modal-intro">点击街区查看文件分布，点击建筑查看说明与依赖，再进入内部查看类、函数和方法。搜索框可按文件路径定位。</p><div class="guide-steps"><div><span>01</span><div><h3>查看依赖</h3><p>检查器列出依赖谁、被谁依赖。符号楼层区分出向与入向连接。</p></div></div><div><span>02</span><div><h3>沿数据流阅读</h3><p>打开「数据流讲解」，按步骤定位请求生命周期中的关键文件。</p></div></div><div><span>03</span><div><h3>比较与切换</h3><p>SGLang 支持版本对比，基线按需加载。顶部导航可随时切换 GPU、PyTorch 和两个推理项目。</p></div></div></div>`;
}};
}
