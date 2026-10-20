import { icon } from './icons.js';

// Functional paths use the same component keys as the 3D scenes. They describe
// producer/consumer relationships, not clock cycles or a simulated CANN kernel.
const paths = {
  shared: [
    ['address','GM → 片上','MTE2 把全局内存的数据送往 AIC 的 L1 或 AIV 的 UB。'],
    ['banks','AIC · L1','矩阵输入先在 L1 复用；L1 属于 AIC 数据通路。'],
    ['bank','AIV · UB','向量操作在 AIV 的 Unified Buffer 中准备输入与输出。'],
    ['tma','搬运与计算重叠','不同搬运管线与计算管线可并行，仍需按依赖同步。'],
    ['barrier','同步后消费','生产者完成后通知消费者；事件不是 CUDA Warp 屏障。']
  ],
  registers: [
    ['operand','准备矩阵输入','数据先从 GM 进入 L1，再由 MTE1 装载到 L0A / L0B；不是按 CUDA 线程分配寄存器。'],
    ['registerBank','L1 → L0A / L0B','MTE1 将矩阵 A、B 分块送入 Cube 的输入缓冲。'],
    ['registerFile','Cube → L0C','Cube 执行矩阵乘加，L0C 保存累加结果。'],
    ['writeback','FixPipe 写出','FixPipe 将 L0C 结果写向 GM / L1，并可进行格式转换。'],
    ['spill','GM 中间结果','AIC 与 AIV 通过 Global Memory 交换数据；不把两者缓冲合成统一池。']
  ],
  warp: [
    ['warpPool','任务与代码段','AIC、AIV 运行各自的代码段，由运行时组织任务。'],
    ['fetch','Scalar 控制','Scalar 执行控制、地址与指令准备，各计算核心有自己的控制逻辑。'],
    ['dispatch','分发到管线','Cube、Vector 与搬运指令进入各自的执行管线。'],
    ['execute','计算与搬运','AIC 进行矩阵计算，AIV 进行向量计算；MTE 管线准备数据。'],
    ['scoreboard','依赖与同步','用事件与同步机制等待数据就绪，避免消费者提前读取。'],
    ['writeback','结果完成','Cube 结果由 FixPipe 写出；AIV 的 UB 数据由 MTE3 写回 GM。']
  ]
};

export class AscendLab {
  constructor(callbacks) {Object.assign(this,callbacks);this.step=0;this.level=null;}
  mount(container,level,gpu) {
    if(this.level!==level)this.step=0;
    this.container=container;this.level=level;this.gpu=gpu;this.render();
  }
  render() {
    const path=paths[this.level];
    this.container.dataset.labKind='davinci';
    const heading=(title,text)=>`<div class="lab-heading"><div><span class="small-kicker">DA VINCI · AIC / AIV</span><h2>${title}</h2><p>${text}</p></div><span class="lab-reference">${icon('info',13)} 功能通路示意</span></div>`;
    if(!path) {
      this.container.innerHTML=`<section class="deep-gateway">${heading('从计算组，走进片上数据通路。','AIC 与 AIV 分别承担矩阵和向量计算；沿着存储与同步关系继续探索。')}<div class="deep-gateway-grid">${[['shared','memory','片上缓冲','区分 AIC 的 L1 与 AIV 的 UB。'],['registers','layers','Cube 数据通路','追踪 L0A、L0B 与 L0C 的分工。'],['warp','flow','流水与同步','查看计算、搬运和事件如何配合。']].map(([id,ic,title,text])=>`<button class="deep-entry" data-ascend-navigate="${id}"><span class="deep-entry-icon">${icon(ic,23)}</span><h3>${title}</h3><p>${text}</p><span class="deep-entry-link">进入内部结构 ${icon('arrow',16)}</span></button>`).join('')}</div></section>`;
    } else {
      const current=path[this.step];
      this.container.innerHTML=`<section class="micro-lab ascend-lab">${heading(this.level==='shared'?'数据存在哪里，决定怎样搬运。':this.level==='registers'?'一块矩阵，如何进入 Cube？':'不同管线，怎样等待与交接？',`沿 ${this.gpu.name} 的公开编程模型逐步追踪；点击阶段会同步定位 3D 组件。`)}<div class="ascend-path" role="group" aria-label="昇腾数据通路步骤">${path.map(([id,title],i)=>`<button data-ascend-step="${i}" class="${i===this.step?'current':''}" aria-pressed="${i===this.step}"><span>${String(i+1).padStart(2,'0')}</span><strong>${title}</strong>${icon('chevron',14)}</button>`).join('')}</div><div class="ascend-step"><div><span class="small-kicker">STEP ${this.step+1} / ${path.length}</span><h3>${current[1]}</h3><p>${current[2]}</p></div><div class="warp-step-controls"><button class="lab-reset" data-ascend-prev ${this.step===0?'disabled':''}>${icon('back',14)} 上一步</button><button class="primary-button" data-ascend-next>${this.step===path.length-1?'重新追踪':'下一阶段'} ${icon('arrow',16)}</button></div></div><p class="lab-caveat">此处展示功能和依赖关系，不表示真实流水线深度、物理模块数量或周期数。片上缓冲容量见上方统计；不使用 CUDA Warp、32-bank 或线程寄存器占用率模型。</p></section>`;
    }
    this.container.onclick=e=>{
      const nav=e.target.closest('[data-ascend-navigate]');if(nav){this.onNavigate(nav.dataset.ascendNavigate);return;}
      const step=e.target.closest('[data-ascend-step]');
      if(step)this.step=Number(step.dataset.ascendStep);
      else if(e.target.closest('[data-ascend-prev]'))this.step=Math.max(0,this.step-1);
      else if(e.target.closest('[data-ascend-next]'))this.step=(this.step+1)%path.length;
      else return;
      this.render();this.onSelect(path[this.step][0]);this.onExperiment({stage:path[this.step][0]});
    };
    this.container.oninput=null;this.container.onchange=null;
  }
}
