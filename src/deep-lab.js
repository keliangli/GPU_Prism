import { AscendLab } from './ascend-lab.js';
import { icon } from './icons.js';
import { sharedAccess, registerBudget, WARP_STAGES, INITIAL_WARPS, advanceWarp } from './hardware-models.js';

export class DeepLab {
  constructor({ onExperiment=()=>{}, onSelect=()=>{}, onNavigate=()=>{} }={}) {
    this.onExperiment=onExperiment;this.onSelect=onSelect;this.onNavigate=onNavigate;this.ascendLab=new AscendLab({onExperiment,onSelect,onNavigate});
    this.gpu={id:'h20',name:'H20'};this.level='package';this.stride=1;this.offset=0;this.selectedBank=null;
    this.registers=64;this.threads=256;this.shared=0;this.warps=INITIAL_WARPS.map(w=>({...w}));
    this.activeWarp=1;this.stageIndex=0;this.stalled=false;
  }
  mount(container,level,gpu={id:'h20',name:'H20'}) {
    this.gpu=gpu;
    if(gpu.family==='davinci'){this.ascendLab.mount(container,level,gpu);return;}
    this.shared=Math.min(this.shared,gpu.smLimits?.sharedBlockKiB??227);
    this.container=container;this.level=level;this.render();this.emit();
    if(level==='warp')this.onSelect(WARP_STAGES[this.stageIndex].component);
  }
  selectBank(index) { this.selectedBank=Number.isInteger(index)?index:null;this.render();this.emit(); }
  emit() {
    if(this.gpu.family==='davinci')return;
    if(this.level==='shared')this.onExperiment({...sharedAccess(this.stride,this.offset),selectedBank:this.selectedBank});
    if(this.level==='registers')this.onExperiment({registerUsage:this.registers});
    if(this.level==='warp')this.onExperiment({stage:WARP_STAGES[this.stageIndex].id,activeWarp:this.activeWarp,stalled:this.stalled});
  }
  render() {
    if(!this.container)return;
    this.container.dataset.labKind=this.level;
    this.container.innerHTML=this.level==='shared'?this.sharedView():this.level==='registers'?this.registerView():this.level==='warp'?this.warpView():this.gatewayView();
    this.container.onclick=e=>this.click(e);
    // 按控件类型分流：range 用 input 实时预览，select 用 change 提交，避免同一次交互被两个事件重复处理。
    this.container.oninput=e=>{if(e.target.tagName!=='SELECT')this.input(e);};
    this.container.onchange=e=>{if(e.target.tagName==='SELECT')this.input(e);};
  }
  heading(kicker,title,text) {return `<div class="lab-heading"><div><span class="small-kicker">${kicker}</span><h2>${title}</h2><p>${text}</p></div><span class="lab-reference">${icon('info',13)} 可交互原理演示</span></div>`;}
  gatewayView() {
    return `<section class="deep-gateway">${this.heading('GO DEEPER · SM INTERNALS','计算单元之下，还有什么？',`进入 ${this.gpu.name} 的 ${this.gpu.architecture||'Hopper'} SM，追踪数据如何存储、指令如何执行。`)}<div class="deep-gateway-grid">${[
      ['shared','memory','共享内存','32 个 bank，怎样同时服务一个 Warp？',this.gpu.family==='hopper'?'BANKS / ADDRESS / TMA':'BANKS / ASYNC COPY'],
      ['registers','layers','寄存器文件','每个线程的操作数，究竟放在哪里？','REGISTER FILE / OPERANDS'],
      ['warp','flow','Warp 执行流水线','等待的 Warp 与就绪的 Warp，如何交替前进？','SCHEDULER / SCOREBOARD / ISSUE']
    ].map(([id,ic,title,text,en])=>`<button class="deep-entry" data-lab-navigate="${id}"><span class="deep-entry-icon">${icon(ic,23)}</span><span class="small-kicker">${en}</span><h3>${title}</h3><p>${text}</p><span class="deep-entry-link">进入内部结构 ${icon('arrow',16)}</span></button>`).join('')}</div></section>`;
  }
  sharedView() {
    const m=sharedAccess(this.stride,this.offset),bank=this.selectedBank;
    const selectedLanes=bank===null?m.lanes:m.lanes.filter(x=>x.bank===bank);
    return `<section class="micro-lab">${this.heading('SHARED MEMORY LAB','一个 Warp，32 条访存请求。','改变访问步长，看地址如何映射到 bank；同址读取会广播，不计为 bank 冲突。')}<div class="lab-two-column"><div class="lab-controls"><label class="lab-field">访问模式<select id="bank-stride" aria-label="共享内存访问步长">${[[1,'连续访问 · stride 1'],[2,'跨步访问 · stride 2'],[4,'跨步访问 · stride 4'],[8,'跨步访问 · stride 8'],[16,'跨步访问 · stride 16'],[32,'列访问 · stride 32'],[33,'加一列 padding · stride 33'],[0,'同址广播 · stride 0']].map(([v,t])=>`<option value="${v}" ${this.stride===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="lab-field">起始 word 偏移 <strong id="bank-offset-value">${this.offset}</strong><input id="bank-offset" type="range" min="0" max="31" value="${this.offset}" aria-label="起始 word 偏移"></label><div class="lab-formula">word = offset + lane × stride<br>bank = word mod 32</div><div class="lab-result ${m.conflictDegree>1?'has-conflict':''}"><strong>${m.broadcast?'同址广播':m.conflictDegree===1?'无 bank 冲突':`${m.conflictDegree} 路 bank 冲突`}</strong><span>${m.usedBanks} 个 bank 被访问 · 最多 ${m.conflictDegree} 个不同 word / bank</span></div><p class="lab-caveat">限定：32 个活跃 lane，每个 lane 读取一个对齐的 32-bit word；不模拟向量访存、实际周期或带宽。</p></div><div class="bank-experiment"><div class="lab-grid-heading"><span>32 BANKS <small>点击 bank 查看请求</small></span><button data-lab-action="all-banks">显示全部 ${icon('rotate',12)}</button></div><div class="bank-grid">${m.bankCounts.map((count,i)=>`<button class="bank-cell ${count?'is-active':''} ${count>1?'is-conflict':''} ${bank===i?'is-selected':''}" data-lab-bank="${i}" aria-label="Bank ${i}，${m.laneCounts[i]} 条 lane 请求，${count} 个不同 word" aria-pressed="${bank===i}"><span>B${String(i).padStart(2,'0')}</span><strong>${m.laneCounts[i]||'—'}</strong></button>`).join('')}</div><div class="lane-map-heading"><span>${bank===null?'LANE → WORD → BANK':`BANK ${String(bank).padStart(2,'0')} 的请求`}</span><span>${selectedLanes.length} / 32 LANES</span></div><div class="lane-map">${selectedLanes.length?selectedLanes.map(x=>`<span class="lane-token"><i>L${String(x.lane).padStart(2,'0')}</i><strong>${x.word}</strong><em>B${String(x.bank).padStart(2,'0')}</em></span>`).join(''):'<p class="empty-bank">当前没有 lane 访问这个 bank。</p>'}</div></div></div></section>`;
  }
  registerView() {
    const limits={registers:65536,warps:64,threads:2048,blocks:32,sharedKiB:228,sharedBlockKiB:227,...this.gpu.smLimits};
    const m=registerBudget(this.registers,this.threads,this.shared,limits);
    const limitNames={registers:'寄存器容量',threads:'线程容量',shared:'共享内存',blocks:'线程块数量'};
    return `<section class="micro-lab">${this.heading('REGISTER FILE LAB','寄存器用得多，并行上下文会怎样？','调整每线程用量和线程块大小，观察所选架构的资源预算如何限制驻留 Warp。')}<div class="lab-two-column"><div class="lab-controls"><label class="lab-field">寄存器 / 线程 <strong>${this.registers}</strong><input id="register-count" type="range" min="16" max="255" value="${this.registers}" aria-label="每线程寄存器数量"></label><label class="lab-field">线程 / 线程块<select id="block-threads" aria-label="线程块大小">${[128,256,512,1024].map(v=>`<option value="${v}" ${this.threads===v?'selected':''}>${v} threads · ${v/32} warps</option>`).join('')}</select></label><label class="lab-field">共享内存 / 线程块 <strong>${this.shared} KiB</strong><input id="register-shared" type="range" min="0" max="${Math.min(128,limits.sharedBlockKiB)}" step="8" value="${this.shared}" aria-label="每线程块共享内存用量"></label><div class="lab-formula">${this.registers} registers × ${this.threads} threads<br>= ${m.perBlock.toLocaleString()} registers / block</div><p class="lab-caveat">采用 ${this.gpu.architecture||'Hopper'} 公开参考模型：${limits.registers.toLocaleString()} 个 32-bit 寄存器、${limits.warps} Warp、${limits.threads.toLocaleString()} 线程、${limits.blocks} 个线程块及最高 ${limits.sharedKiB} KiB 共享内存 / SM。忽略分配粒度、分区、编译器和其他限制，不代表 ${this.gpu.name} 的实际内核占用率。</p></div><div class="register-experiment"><div class="register-resource-grid"><div><span>驻留线程块上限</span><strong>${m.residentBlocks}<small>blocks</small></strong></div><div><span>驻留 Warp 上限</span><strong>${m.residentWarps}<small>/ ${limits.warps}</small></strong></div><div><span>理论 Warp 占用率</span><strong>${Math.round(m.occupancy*100)}<small>%</small></strong></div></div><div class="lab-grid-heading"><span>${limits.warps} WARP SLOTS <small>每格代表一个 Warp 上下文</small></span></div><div class="warp-slot-grid">${Array.from({length:limits.warps},(_,i)=>`<span class="warp-slot ${i<m.residentWarps?'occupied':''}" title="Warp slot ${i}">${String(i).padStart(2,'0')}</span>`).join('')}</div><div class="register-bar-label"><span>寄存器预算分配</span><strong>${m.allocatedRegisters.toLocaleString()} / ${limits.registers.toLocaleString()}</strong></div><div class="register-budget-bar"><span style="width:${m.allocatedRegisters/limits.registers*100}%"></span></div><p class="resource-limit">${icon('info',14)} 当前限制：${m.limits.map(x=>limitNames[x]).join('、')}。${m.residentBlocks===0?'当前配置无法装入一个完整线程块。':'更高占用率不必然带来更高性能。'}</p><button class="lab-inline-link" data-lab-select="spill">寄存器不够时，spill 到哪里？ ${icon('arrow',15)}</button></div></div></section>`;
  }
  warpView() {
    const stage=WARP_STAGES[this.stageIndex],warp=this.warps[this.activeWarp];
    return `<section class="micro-lab">${this.heading('WARP EXECUTION LAB','一条指令，如何抵达执行单元？','选择一个 Warp，逐步追踪依赖检查、调度、发射、操作数收集和结果写回。')}<div class="warp-lab-layout"><div class="warp-pool"><span class="lab-section-label">示例驻留 WARPS</span>${this.warps.map(w=>`<button class="warp-pool-item ${w.id===this.activeWarp?'selected':''} ${w.ready?'ready':'waiting'}" data-lab-warp="${w.id}" aria-pressed="${w.id===this.activeWarp}"><span>W${w.id}<i>${w.ready?'READY':'WAIT'}</i></span><code>${w.instruction}</code><small>${w.wait}</small></button>`).join('')}<p class="lab-caveat">这些 Warp 的状态是独立示例，不共享代码中的寄存器编号。Warp 是 32 个线程的逻辑分组。</p></div><div class="warp-sequencer"><div class="pipeline-track">${WARP_STAGES.map((s,i)=>`<button class="pipeline-stage ${i===this.stageIndex?'current':''} ${i<this.stageIndex?'passed':''}" data-lab-stage="${i}" ${i>this.stageIndex?'disabled':''}><span>${String(i+1).padStart(2,'0')}</span><strong>${s.short}</strong>${i<this.stageIndex?icon('check',12):''}</button>`).join('')}</div><div class="current-instruction"><span>W${this.activeWarp} <small>${warp.kind}</small></span><code>${warp.instruction}</code></div><div class="pipeline-explanation ${this.stalled?'is-stalled':''}"><div><span class="small-kicker">${this.stalled?'DEPENDENCY NOT READY':`STAGE ${this.stageIndex+1} / 7`}</span><h3>${this.stalled?'当前 Warp 正在等待':stage.name}</h3><p>${this.stalled?`W${warp.id}：${warp.wait}。可以选择就绪的 W1 或 W3，让执行单元继续工作；也可以用下方按钮模拟等待完成。`:stage.description}</p></div>${icon(this.stalled?'pause':'flow',28)}</div><div class="warp-step-controls"><button class="lab-reset" data-lab-action="reset-warp">${icon('rotate',14)} 重置</button><button class="release-warp" data-lab-action="release-warp" ${warp.ready?'disabled':''}>模拟等待完成</button><button class="primary-button" data-lab-action="step-warp">${this.stageIndex===6?'重新追踪':'下一阶段'} ${icon('arrow',16)}</button></div><p class="lab-caveat">功能关系的教学顺序，不是 ${this.gpu.name} 的真实流水线深度、调度策略或周期数。不同功能单元会并行、重叠工作。</p></div></div></section>`;
  }
  click(e) {
    const nav=e.target.closest('[data-lab-navigate]');if(nav){this.onNavigate(nav.dataset.labNavigate);return;}
    const comp=e.target.closest('[data-lab-select]');if(comp){this.onSelect(comp.dataset.labSelect);return;}
    const bank=e.target.closest('[data-lab-bank]');if(bank){this.selectedBank=Number(bank.dataset.labBank);this.onSelect('bank');this.render();this.emit();return;}
    const warp=e.target.closest('[data-lab-warp]');if(warp){this.activeWarp=Number(warp.dataset.labWarp);this.stageIndex=0;this.stalled=false;this.onSelect('warpPool');this.render();this.emit();return;}
    const phase=e.target.closest('[data-lab-stage]');if(phase&&!phase.disabled){this.stageIndex=Number(phase.dataset.labStage);this.stalled=false;this.onSelect(WARP_STAGES[this.stageIndex].component);this.render();this.emit();return;}
    const button=e.target.closest('[data-lab-action]');if(!button)return;
    const action=button.dataset.labAction;
    if(action==='all-banks'){this.selectedBank=null;this.onSelect('banks');}
    if(action==='reset-warp'){this.stageIndex=0;this.activeWarp=1;this.stalled=false;this.warps=INITIAL_WARPS.map(w=>({...w}));this.onSelect('fetch');}
    if(action==='release-warp'){this.warps[this.activeWarp].ready=true;this.warps[this.activeWarp].wait='示例依赖已解除';this.stalled=false;}
    if(action==='step-warp'){
      if(this.stageIndex===6){this.stageIndex=0;this.stalled=false;}else{const next=advanceWarp(this.stageIndex,this.warps[this.activeWarp].ready);this.stageIndex=next.stageIndex;this.stalled=next.stalled;}
      this.onSelect(WARP_STAGES[this.stageIndex].component);
    }
    this.render();this.emit();
  }
  input(e) {
    const id=e.target.id,value=Number(e.target.value);
    if(id==='bank-stride'){this.stride=value;this.selectedBank=null;this.onSelect('banks');}
    else if(id==='bank-offset')this.offset=value;
    else if(id==='register-count')this.registers=value;
    else if(id==='block-threads')this.threads=value;
    else if(id==='register-shared')this.shared=value;
    else return;
    // Keep the active control node alive, so ranges work with mouse, touch and keyboard.
    const focusedId=document.activeElement?.id,selection=e.target.value;
    if(e.type==='input'&&e.target.type==='range'){
      const replacement=document.createElement('div');replacement.innerHTML=this.level==='shared'?this.sharedView():this.registerView();
      const oldControls=this.container.querySelector('.lab-controls');
      const newControls=replacement.querySelector('.lab-controls');
      oldControls.querySelectorAll('.lab-field strong').forEach((node,i)=>{node.textContent=newControls.querySelectorAll('.lab-field strong')[i]?.textContent||node.textContent;});
      oldControls.querySelector('.lab-formula').innerHTML=newControls.querySelector('.lab-formula').innerHTML;
      const result=oldControls.querySelector('.lab-result');if(result)result.outerHTML=newControls.querySelector('.lab-result').outerHTML;
      const panel=this.container.querySelector('.bank-experiment,.register-experiment');panel.replaceWith(replacement.querySelector('.bank-experiment,.register-experiment'));
    }else{this.render();const current=focusedId?this.container.querySelector(`#${CSS.escape(focusedId)}`):null;if(current){current.value=selection;current.focus();}}
    this.emit();
  }
}
