import './style.css';
import { GPUScene } from './gpu-scene.js';
import { icon } from './icons.js';
import { DeepLab } from './deep-lab.js';
import './deep.css';
import './color-theme.css';
import { ARCHITECTURE_LEGEND } from './palette.js';
import { components, sources, levels, levelComponents } from './data.js';

const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
let scene;
let state = { level:'package', selected:'gpu', exploded:false, labels:true, autoRotate:false, flow:false, filter:'all', search:'', tab:'overview' };
let lastFocus;
let toastTimer;
const lab = new DeepLab({onExperiment:data=>scene?.setExperiment?.(data),onSelect:selectComponent,onNavigate:id=>{
  setLevel(id);document.querySelector('.explorer-workspace')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}});

const logo = `<span class="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m16 3 13 7-13 7L3 10zM3 16l13 7 13-7M3 22l13 7 13-7" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg></span><span class="brand-name">infar<span class="brand-period">.</span></span>`;
function header(explorer = false) { return `<header class="site-header"><a class="brand" href="#/gpus" aria-label="INFAR 首页">${logo}<span class="brand-divider"></span><span class="brand-caption">硬件架构图鉴</span></a><nav aria-label="主导航"><a class="nav-item active" href="#/gpus">GPU 图鉴</a><button class="nav-item" data-action="guide">探索指南</button><button class="nav-item" data-action="sources">数据来源 ${icon('external',13)}</button></nav><div class="header-right"><span class="live-status"><i></i> 为理解算力而构建</span><span class="edition">BETA 0.3</span></div></header>`; }
function footer() { return `<footer class="site-footer"><span>INFAR <span class="footer-dot">/</span> 看见硬件，理解算力。</span><span>独立架构学习项目 <i>·</i> 非 NVIDIA 官方产品</span><button data-action="sources">规格来源与模型说明 ${icon('external',12)}</button></footer>`; }

function home() {
  destroyScene();
  document.title = 'INFAR · GPU 架构图鉴';
  app.innerHTML = `${header()}<main class="catalog-page"><section class="intro"><div><div class="eyebrow"><span class="tiny-cross">+</span> INSIDE THE COMPUTE</div><h1>算力的世界，<br>从<span class="underlined">芯片内部</span>开始。</h1><p>走进 GPU 的微观世界。以交互式 3D 视角，<br class="desktop-break">探索每一层硬件如何协同，让计算发生。</p></div><div class="intro-aside"><span class="outline-orb">${icon('cube',30)}</span><span>从封装，到每个计算单元。<br><strong>不止看参数，更理解架构。</strong></span></div></section><section class="gpu-library" aria-labelledby="library-title"><div class="library-header"><div class="library-title"><h2 id="library-title">选择一颗 GPU</h2><span>开始你的架构探索</span></div><div class="library-tools"><div class="filter-group" role="group" aria-label="架构筛选"><button data-filter="all" class="filter-button active">全部</button><button data-filter="hopper" class="filter-button">Hopper</button><button data-filter="blackwell" class="filter-button">Blackwell</button></div><label class="search-field">${icon('search',16)}<input id="gpu-search" type="search" placeholder="搜索 GPU" aria-label="搜索 GPU" /></label></div></div><div id="gpu-results"><article class="featured-gpu" data-family="hopper" data-name="nvidia h20 hopper"><div class="featured-visual"><div class="visual-header"><span><i></i> INTERACTIVE 3D MODEL</span><span>001 / HOPPER</span></div><div id="home-scene" class="home-scene" aria-label="H20 可旋转 3D 封装预览"></div><div class="visual-caption"><span>H20 <small>SXM5</small></span><span>${icon('mouse',14)} 拖动，换个角度看</span></div></div><div class="featured-info"><div class="card-kicker"><span class="manufacturer">NVIDIA</span><span class="available-badge"><i></i> 可探索</span></div><div class="featured-title">H20<span>Hopper Architecture</span></div><p class="card-description">为 AI 计算而生。拆解计算、显存与互联，<br>看清大模型推理背后的硬件逻辑。</p><div class="card-specs"><div><strong>96 <small>GB</small></strong><span>HBM3 显存</span></div><div><strong>SXM5</strong><span>模块形态</span></div><div><strong>6 <small>个</small></strong><span>架构探索视图</span></div></div><a href="#/gpu/h20" class="primary-button explore-button">探索 H20 架构 ${icon('arrow',20)}</a><div class="card-footnote">${icon('cube',13)} 3D 封装 <i>·</i> 芯片架构 <i>·</i> SM 微架构</div></div></article><div class="upcoming-grid"><article class="upcoming-gpu" data-family="hopper" data-name="nvidia h100 hopper"><div class="mini-chip">${icon('chip',27)}</div><div><span class="small-kicker">NVIDIA · HOPPER</span><h3>H100</h3></div><span class="soon-badge">即将收录</span><span class="upcoming-arrow">↗</span></article><article class="upcoming-gpu" data-family="blackwell" data-name="nvidia b200 blackwell"><div class="mini-chip purple">${icon('layers',27)}</div><div><span class="small-kicker">NVIDIA · BLACKWELL</span><h3>B200</h3></div><span class="soon-badge">即将收录</span><span class="upcoming-arrow">↗</span></article></div><div id="no-results" class="no-results" hidden>${icon('search',26)}<h3>没有找到匹配的 GPU</h3><p>试试 H20、Hopper 或其他架构名称。</p><button class="text-button" data-action="clear-search">清除筛选</button></div></div></section><section class="learning-strip"><span class="strip-index">01 — 06</span><div><h3>从整体到细节，建立你的架构地图。</h3><p>从封装、芯片到 SM，再深入共享内存、寄存器与 Warp 执行。</p></div><button class="text-button" data-action="guide">第一次探索？查看指南 ${icon('arrow',16)}</button></section></main>${footer()}`;
  scene = new GPUScene(document.querySelector('#home-scene'), {onSelect:()=>{ location.hash='/gpu/h20'; }});
  scene.setLabels(false);
  scene.setAutoRotate(!matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.querySelector('#gpu-search').addEventListener('input',e=>{state.search=e.target.value;filterGpus();});
  state.filter='all'; state.search='';
}

function explorer() {
  destroyScene();
  document.title = '探索 H20 · INFAR';
  app.innerHTML = `${header(true)}<main class="explorer-page"><div class="explorer-heading"><div class="breadcrumbs"><a href="#/gpus">GPU 图鉴</a>${icon('chevron',12)}<span>NVIDIA H20</span>${icon('chevron',12)}<strong id="breadcrumb-level">${levels[state.level].name}</strong></div><div class="model-status"><i></i> 3D 实时渲染 <span>·</span><button data-action="sources">教学示意模型 ${icon('info',13)}</button></div></div><section class="gpu-heading"><div class="gpu-heading-title"><a class="back-button" href="#/gpus" aria-label="返回 GPU 图鉴">${icon('back',19)}</a><h1>NVIDIA <strong>H20</strong></h1><span class="architecture-pill">HOPPER</span><span class="module-type">SXM5 · 96 GB HBM3</span></div><button class="subtle-button" data-action="guide">${icon('book',16)} 探索指南</button></section><div class="explorer-workspace"><aside class="architecture-sidebar"><div class="sidebar-heading"><span>架构层级</span><span class="mono">LEVELS</span></div><div class="level-navigation">${Object.entries(levels).map(([id,l])=>`<button class="level-button ${l.parent?'sublevel':''} ${state.level===id?'active':''}" data-level="${id}" aria-pressed="${state.level===id}"><span class="level-number">${l.index}</span><span>${id==='warp'?'Warp 流水线':l.name}<small>${l.en}</small></span>${icon('chevron',15)}</button>`).join('')}</div><div class="sidebar-rule"></div><div class="sidebar-heading component-heading"><span>硬件组件</span><span id="component-count" class="mono">05</span></div><div id="component-list"></div><div class="sidebar-bottom"><span class="keyboard-hint">${icon('keyboard',15)} 快捷操作 <kbd>?</kbd></span><button data-action="guide" class="sidebar-tip">点击模型或组件，<br>开始探索它的工作原理。 ${icon('arrow',15)}</button></div></aside><section class="viewport-column" aria-label="3D 架构查看器"><div class="viewport-toolbar"><div class="view-tabs" role="group" aria-label="摄像机视角"><button data-view="iso" class="active">${icon('cube',14)} 透视</button><button data-view="top">${icon('grid',14)} 俯视</button><button data-view="front">${icon('layers',14)} 侧视</button></div><div class="viewport-actions"><button data-action="toggle-labels" class="icon-button ${state.labels?'active':''}" title="显示或隐藏标签" aria-label="显示或隐藏标签" aria-pressed="${state.labels}">${icon('label',17)}</button><button data-action="auto-rotate" class="icon-button ${state.autoRotate?'active':''}" title="自动旋转" aria-label="自动旋转" aria-pressed="${state.autoRotate}">${icon('rotate',17)}</button><span class="toolbar-divider"></span><button data-action="fullscreen" class="icon-button" title="全屏查看" aria-label="全屏查看">${icon('expand',17)}</button></div></div><div class="scene-stage"><div class="stage-title"><span class="stage-eyebrow">H20 / ARCHITECTURE EXPLORER</span><h2 id="stage-title">${levels[state.level].name}</h2><span id="stage-subtitle">${levels[state.level].title}</span></div><button id="stage-back" class="stage-back" data-action="parent-level" ${levels[state.level].parent?'':'hidden'}>${icon('back',13)} 返回 SM</button><div class="stage-coordinate">Y<br><span>↗</span> X ─ Z</div><div id="explorer-scene" class="explorer-scene" aria-label="可交互 NVIDIA H20 架构 3D 模型"></div><div class="canvas-help" id="canvas-help">${icon('target',14)} 点击任意组件，探索内部细节</div><div class="scene-navigation"><button data-action="zoom-in" aria-label="放大" title="放大">${icon('plus',18)}</button><button data-action="zoom-out" aria-label="缩小" title="缩小">${icon('minus',18)}</button><span></span><button data-action="reset" aria-label="重置视角" title="重置视角（R）">${icon('target',18)}</button></div><div class="stage-bottom"><div class="model-legend">${ARCHITECTURE_LEGEND.map(item=>`<span title="${item.description}"><i class="${item.className}" style="background:${item.color}"></i>${item.title}</span>`).join('')}</div><span class="scale-note">结构与比例为教学示意</span></div></div><div class="viewport-bottom"><div class="interaction-hints"><span>${icon('mouse',14)} 拖动旋转</span><span>${icon('move',14)} 右键平移</span><span>${icon('plus',13)} 滚轮缩放</span></div><button class="explode-button ${state.exploded?'active':''}" data-action="explode" aria-pressed="${state.exploded}">${icon('layers',16)}<span>分层展开</span><span class="toggle-switch"></span></button></div></section><aside class="detail-sidebar" aria-label="组件详情"><div class="detail-topline"><span>组件检查器</span><span class="mono">INSPECTOR ${icon('target',13)}</span></div><div id="component-detail" aria-live="polite"></div></aside></div><div id="deep-lab-root"></div><div class="explorer-bottom"><div><span class="bottom-label">H20 AT A GLANCE</span><div class="bottom-stat"><span>显存容量</span><strong>96 <small>GB</small></strong></div><div class="bottom-stat"><span>模块形态</span><strong>SXM5</strong></div><div class="bottom-stat"><span>互联</span><strong>NVLink</strong></div><div class="bottom-stat"><span>计算架构</span><strong>Hopper</strong></div></div><button class="flow-button ${state.flow?'active':''}" data-action="data-flow" aria-pressed="${state.flow}">${icon('flow',17)}<span>${state.flow?'停止数据流演示':'演示数据流'}</span>${icon('play',13)}</button></div><div class="explorer-note">${icon('info',13)} 模型用于理解架构关系，组件数量、位置与尺寸经过简化。<button data-action="sources">查看数据来源 ${icon('external',11)}</button></div></main>${footer()}`;
  scene = new GPUScene(document.querySelector('#explorer-scene'), {onSelect:id=>{if(id==='bank'&&state.level==='shared')lab.selectBank(scene.lastBank);selectComponent(id);},onHover:id=>{const h=document.querySelector('#canvas-help'); if(h) h.innerHTML=id&&components[id]?`${icon('target',14)} ${components[id].title} · 点击查看`:`${icon('target',14)} 点击任意组件，探索内部细节`;}});
  scene.setLevel(state.level, state.selected);scene.setLabels(state.labels);scene.setExploded(state.exploded);scene.setAutoRotate(state.autoRotate);scene.setDataFlow(state.flow);
  renderComponentList(); renderDetail();lab.mount(document.querySelector('#deep-lab-root'),state.level);
}

function renderComponentList() {
  const el=document.querySelector('#component-list');if(!el)return;
  el.innerHTML=levelComponents[state.level].map(id=>{const c=components[id];return `<button class="component-button ${state.selected===id?'active':''}" data-component="${id}" aria-pressed="${state.selected===id}"><span class="component-dot" style="--component-color:${c.color}"></span><span>${(c.shortTitle||c.title).replace('Hopper GPU 核心','GPU 核心').replace('HBM3 高带宽显存','HBM3 显存').replace('NVLink 高速互联','NVLink 互联').replace('PCIe 主机接口','PCIe 接口').replace('第四代 Tensor Core','Tensor Core').replace('CUDA 通用计算核心','CUDA Core').replace('线程束调度与寄存器','调度与寄存器')}</span>${icon('chevron',12)}</button>`;}).join('');
  document.querySelector('#component-count').textContent=String(levelComponents[state.level].length).padStart(2,'0');
}

function renderDetail() {
  const el=document.querySelector('#component-detail');if(!el)return;
  const c=components[state.selected]||components.gpu;
  el.closest('.detail-sidebar').style.setProperty('--inspect-accent',c.color);
  el.innerHTML=`<div class="detail-identity"><span class="detail-icon" style="--component-color:${c.color}">${icon(c.icon,26)}</span><span class="detail-en">${c.en}</span><h2>${state.level==='shared'&&state.selected==='bank'&&lab.selectedBank!==null?`Bank ${String(lab.selectedBank).padStart(2,'0')} · SRAM`:c.title}</h2><p>${c.subtitle}</p></div><div class="detail-tabs"><button data-detail-tab="overview" class="${state.tab==='overview'?'active':''}">概览</button><button data-detail-tab="inference" class="${state.tab==='inference'?'active':''}">与推理的关系 ${icon('bolt',12)}</button></div>${state.tab==='overview'?`<p class="detail-description">${c.description}</p><dl class="detail-stats">${c.stats.map(s=>`<div><dt>${s[0]}</dt><dd>${s[1]}</dd></div>`).join('')}</dl><div class="insight-box"><span>${icon('bolt',14)} 架构洞察</span><p>${c.insight}</p></div>`:`<div class="inference-detail"><span class="small-kicker">HARDWARE → INFERENCE</span><h3>这对大模型推理意味着什么？</h3><p>${c.insight}</p><div class="inference-path"><span>模型数据</span>${icon('arrow',14)}<span>${c.title}</span>${icon('arrow',14)}<span>推理结果</span></div><p class="detail-description">${c.description}</p></div>`}${c.next&&c.next!==state.level?`<button class="detail-next" data-next-level="${c.next}">${c.nextLabel} ${icon('arrow',17)}</button>`:''}<a class="detail-source" href="${sources[c.source]?.url||sources[1].url}" target="_blank" rel="noopener noreferrer">${icon('book',13)} 参考：${sources[c.source]?.kind||'NVIDIA 官方文档'} ${icon('external',11)}</a>`;
}

function selectComponent(id) { if(!components[id]||!levelComponents[state.level].includes(id)){scene?.setSelected(state.selected);return;} state.selected=id;state.tab='overview';scene?.setSelected(id);renderComponentList();renderDetail(); }
// 层级相关的标题、面包屑与深度样式只在这里同步，避免多处重复赋值。
function syncLevelChrome(id) {
  const level=levels[id];
  document.querySelector('#breadcrumb-level').textContent=(level.parent?'SM 微架构 / ':'')+level.name;
  document.querySelector('#stage-title').textContent=level.name;
  document.querySelector('#stage-subtitle').textContent=level.title;
  document.querySelector('#stage-back').hidden=!level.parent;
  document.querySelector('.explorer-workspace').classList.toggle('is-deep',!!level.parent);
}
function setLevel(id) {
  if(!levels[id])return;
  state.level=id;state.selected=levels[id].default;state.tab='overview';
  scene?.setLevel(id,state.selected);scene?.setExploded(state.exploded);scene?.setDataFlow(state.flow);
  document.querySelectorAll('[data-level]').forEach(el=>{el.classList.toggle('active',el.dataset.level===id);el.setAttribute('aria-pressed',el.dataset.level===id);});
  syncLevelChrome(id);
  history.replaceState(null,'',`#/gpu/h20${id==='package'?'':`/${id}`}`);
  renderComponentList();renderDetail();lab.mount(document.querySelector('#deep-lab-root'),id);
}
function filterGpus() {
  let count=0;
  document.querySelectorAll('[data-family]').forEach(el=>{const show=(state.filter==='all'||el.dataset.family===state.filter)&&el.dataset.name.includes(state.search.toLowerCase().trim());el.hidden=!show;if(show)count++;});
  document.querySelectorAll('[data-filter]').forEach(el=>el.classList.toggle('active',el.dataset.filter===state.filter));
  document.querySelector('#no-results').hidden=count>0;
  document.querySelector('.upcoming-grid').hidden=![...document.querySelectorAll('.upcoming-gpu')].some(el=>!el.hidden);
  requestAnimationFrame(()=>scene?.resize());
}
function destroyScene() {scene?.dispose();scene=null;}
function route() {
  closeModal();
  if(location.hash.startsWith('#/gpu/h20')){
    const requested=location.hash.split('/')[3]||'package';
    state.level=levels[requested]?requested:'package';state.selected=levels[state.level].default;
    explorer();syncLevelChrome(state.level);
  }else home();
  window.scrollTo(0,0);
}
function notify(message) {const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2800);}

function showModal(type) {
  lastFocus=document.activeElement;
  let content;
  if(type==='sources')content=`<div class="eyebrow">BUILT ON PUBLIC DOCUMENTATION</div><h2>有来源的知识，<br>有边界的模型。</h2><p class="modal-intro">本项目以 NVIDIA H20 SXM5 96GB 为起点，结合 Hopper 架构公开文档，帮助你理解硬件之间的关系。</p><div class="source-list">${sources.map((s,i)=>`<a href="${s.url}" target="_blank" rel="noopener noreferrer"><span class="source-number">0${i+1}</span><div><span class="small-kicker">${s.kind}</span><h3>${s.title}</h3><p>${s.label}</p></div>${icon('external',17)}</a>`).join('')}</div><div class="model-disclaimer">${icon('info',20)}<div><strong>关于 3D 模型</strong><p>模型是可交互的教学示意，而非芯片逆向或精确 CAD。裸片布局、HBM 数量、SM 数量、尺寸与布线不对应制造图纸。SM 内部参考 Hopper 通用架构。32 个共享内存 bank 是 CUDA 公开模型；寄存器物理分区、端口与流水线位置仅作功能示意。资源预算采用 Hopper 参考上限，不作为 H20 的实测参数。不同 H20 版本与服务器配置的参数可能不同。</p></div></div>`;
  else content=`<div class="eyebrow">A LITTLE CURIOSITY GOES A LONG WAY</div><h2>你的 GPU 探索指南。</h2><p class="modal-intro">不需要芯片设计背景。从整体开始，再一点点走进细节。</p><div class="guide-steps"><div><span>01</span><div><h3>先看连接：封装总览</h3><p>找到 GPU 核心、HBM 显存和互联接口。打开「分层展开」，看看它们如何组合在一起。</p></div>${icon('cube',25)}</div><div><span>02</span><div><h3>再看组织：芯片架构</h3><p>看看计算集群与 L2 缓存。点击组件，理解数据如何抵达计算单元。</p></div>${icon('grid',25)}</div><div><span>03</span><div><h3>走进计算：SM 微架构</h3><p>认识 Tensor Core、CUDA Core、共享内存与调度器，连接起硬件与推理的关系。</p></div>${icon('chip',25)}</div><div><span>04—06</span><div><h3>继续深入：共享内存、寄存器与 Warp</h3><p>在 SM 视图中点选组件进入内部结构。调整访问步长观察 bank 冲突，计算资源预算，逐步追踪 Warp 调度与指令执行。</p></div>${icon('flow',25)}</div></div><div class="keyboard-guide"><span>${icon('mouse',18)} 左键拖动 <strong>旋转</strong></span><span>${icon('move',18)} 右键拖动 <strong>平移</strong></span><span>${icon('plus',18)} 滚轮 <strong>缩放</strong></span><span><kbd>R</kbd> 重置视角</span><span><kbd>1</kbd>—<kbd>6</kbd> 切换视图</span><span><kbd>E</kbd> 分层展开</span></div><a class="primary-button" href="#/gpu/h20" data-action="start-exploring">开始探索 H20 ${icon('arrow',19)}</a>`;
  modalRoot.innerHTML=`<div class="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" class="modal-panel"><button class="modal-close icon-button" data-action="close-modal" aria-label="关闭">${icon('close',21)}</button>${content}</section></div>`;
  const title=modalRoot.querySelector('h2');title.id='dialog-title';document.body.classList.add('modal-open');modalRoot.querySelector('.modal-close').focus();
  modalRoot.querySelector('.modal-backdrop').addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))closeModal();});
}
function closeModal() {if(!modalRoot.innerHTML)return;modalRoot.innerHTML='';document.body.classList.remove('modal-open');lastFocus?.focus();}

document.addEventListener('click', async e=>{
  const filter=e.target.closest('[data-filter]');if(filter){state.filter=filter.dataset.filter;filterGpus();return;}
  const level=e.target.closest('[data-level]');if(level){setLevel(level.dataset.level);return;}
  const comp=e.target.closest('[data-component]');if(comp){selectComponent(comp.dataset.component);return;}
  const next=e.target.closest('[data-next-level]');if(next){setLevel(next.dataset.nextLevel);return;}
  const tab=e.target.closest('[data-detail-tab]');if(tab){state.tab=tab.dataset.detailTab;renderDetail();return;}
  const view=e.target.closest('[data-view]');if(view){scene?.setView(view.dataset.view);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===view));return;}
  const button=e.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action;
  if(action==='parent-level'){setLevel('sm');return;}
  if(action==='guide'||action==='sources'){showModal(action);return;}
  if(action==='close-modal'||action==='start-exploring'){closeModal();return;}
  if(action==='clear-search'){state.filter='all';state.search='';document.querySelector('#gpu-search').value='';filterGpus();return;}
  if(action==='toggle-labels'){state.labels=!state.labels;scene?.setLabels(state.labels);button.classList.toggle('active',state.labels);button.setAttribute('aria-pressed',state.labels);}
  if(action==='auto-rotate'){state.autoRotate=!state.autoRotate;scene?.setAutoRotate(state.autoRotate);button.classList.toggle('active',state.autoRotate);button.setAttribute('aria-pressed',state.autoRotate);}
  if(action==='explode'){state.exploded=!state.exploded;scene?.setExploded(state.exploded);button.classList.toggle('active',state.exploded);button.setAttribute('aria-pressed',state.exploded);}
  if(action==='data-flow'){state.flow=!state.flow;scene?.setDataFlow(state.flow);button.classList.toggle('active',state.flow);button.setAttribute('aria-pressed',state.flow);button.querySelector('span').textContent=state.flow?'停止数据流演示':'演示数据流';if(state.flow)notify('数据流动画仅示意传输路径，不代表实际时序或吞吐量。');}
  if(action==='zoom-in')scene?.zoom(1);
  if(action==='zoom-out')scene?.zoom(-1);
  if(action==='reset'){scene?.reset();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='iso'));notify('已恢复默认视角');}
  if(action==='fullscreen'){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.viewport-column').requestFullscreen();}catch{notify('当前浏览器不支持全屏，可使用浏览器缩放。');}}
});
document.addEventListener('keydown',e=>{
  if(modalRoot.innerHTML){if(e.key==='Escape')closeModal();if(e.key==='Tab'){const items=[...modalRoot.querySelectorAll('a,button,input')];const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}return;}
  if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='?'){e.preventDefault();showModal('guide');return;}
  if(!location.hash.startsWith('#/gpu/h20'))return;
  if(['1','2','3','4','5','6'].includes(e.key))setLevel(Object.keys(levels)[Number(e.key)-1]);
  if(e.key.toLowerCase()==='r')document.querySelector('[data-action="reset"]').click();
  if(e.key.toLowerCase()==='e')document.querySelector('[data-action="explode"]').click();
  if(e.key==='+'||e.key==='=')scene?.zoom(1);
  if(e.key==='-')scene?.zoom(-1);
});
window.addEventListener('hashchange',route);
route();
