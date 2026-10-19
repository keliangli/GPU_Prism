// Public CUDA/Hopper reference models, deliberately separate from physical layouts.
export function sharedAccess(stride = 1, offset = 0) {
  const safeStride = Math.max(0, Math.min(64, Math.trunc(Number(stride) || 0)));
  const safeOffset = Math.max(0, Math.min(31, Math.trunc(Number(offset) || 0)));
  const lanes = Array.from({ length: 32 }, (_, lane) => {
    const word = safeOffset + lane * safeStride;
    return { lane, word, bank: word % 32 };
  });
  const requests = Array.from({ length: 32 }, () => new Set());
  const laneCounts = Array(32).fill(0);
  for (const lane of lanes) { requests[lane.bank].add(lane.word); laneCounts[lane.bank]++; }
  const bankCounts = requests.map(words => words.size);
  return { lanes, bankCounts, laneCounts, usedBanks: bankCounts.filter(Boolean).length,
    conflictDegree: Math.max(...bankCounts), broadcast: safeStride === 0,
    stride: safeStride, offset: safeOffset };
}

export function registerBudget(registersPerThread = 64, threadsPerBlock = 256, sharedKiB = 0) {
  const registers = Math.max(16, Math.min(255, Math.trunc(Number(registersPerThread) || 64)));
  const threads = [128,256,512,1024].includes(Number(threadsPerBlock)) ? Number(threadsPerBlock) : 256;
  const shared = Math.max(0, Math.min(228, Number(sharedKiB) || 0));
  const perBlock = registers * threads;
  const capacities = { registers: Math.floor(65536 / perBlock), threads: Math.floor(2048 / threads),
    shared: shared > 227 ? 0 : shared ? Math.floor(228 / shared) : 32, blocks: 32 };
  const residentBlocks = Math.min(...Object.values(capacities));
  const residentWarps = residentBlocks * (threads / 32);
  return { registers, threads, shared, perBlock, residentBlocks, residentWarps,
    occupancy: residentWarps / 64, allocatedRegisters: perBlock * residentBlocks,
    unusedRegisters: 65536 - perBlock * residentBlocks,
    limits: Object.keys(capacities).filter(key => capacities[key] === residentBlocks), capacities };
}

export const WARP_STAGES = [
  { id:'fetch', name:'取指 / 译码', short:'取指', component:'fetch', description:'取指与译码逻辑提供指令。这里从一条待执行指令开始，展示它经过各功能单元的关系。' },
  { id:'scoreboard', name:'依赖检查', short:'依赖检查', component:'scoreboard', description:'Scoreboard 跟踪尚未完成的依赖。源操作数未就绪、访存未返回或同步未满足时，该 Warp 暂时不能发射。' },
  { id:'scheduler', name:'Warp 调度', short:'调度', component:'scheduler', description:'调度器从满足依赖与资源条件的 Warp 中选择指令。等待中的 Warp 可以保留上下文，让其他就绪 Warp 先执行。' },
  { id:'dispatch', name:'指令发射', short:'发射', component:'dispatch', description:'发射逻辑把指令送往对应的执行管线。可发射条件还取决于执行单元和管线资源是否可用。' },
  { id:'operand', name:'操作数收集', short:'读操作数', component:'operand', description:'从寄存器读取源操作数并送往执行单元。收集与读端口在此作功能示意，端口数和时序不代表具体 GPU 的物理实现。' },
  { id:'execute', name:'计算 / 访存', short:'执行', component:'execute', description:'ALU、Tensor Core、SFU 或 LSU 处理相应操作。不同操作具有不同延迟；这七个教学阶段不对应七个时钟周期。' },
  { id:'writeback', name:'结果写回', short:'写回', component:'writeback', description:'执行结果写回目标寄存器，相关依赖随完成状态更新。后续依赖这份数据的指令才可能变为就绪。' }
];

export const INITIAL_WARPS = [
  { id:0, instruction:'FADD R12, R8, R10', ready:false, wait:'等待前序加载写入 R8', kind:'FP32' },
  { id:1, instruction:'FFMA R12, R4, R6, R8', ready:true, wait:'源操作数就绪', kind:'FP32' },
  { id:2, instruction:'FFMA R20, R6, R8, R10', ready:false, wait:'等待前序线程块同步', kind:'FP32' },
  { id:3, instruction:'IADD3 R9, R3, 1', ready:true, wait:'源操作数就绪', kind:'INT' }
];

export function advanceWarp(stageIndex, ready) {
  if (stageIndex === 1 && !ready) return { stageIndex:1, stalled:true, complete:false };
  const last = WARP_STAGES.length - 1;
  // complete 只表示“已经在最后一个阶段”，进入 writeback 本身还不算完成。
  return { stageIndex: Math.min(last, stageIndex + 1), stalled:false, complete: stageIndex >= last };
}
