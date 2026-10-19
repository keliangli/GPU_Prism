// Shared visual vocabulary for the 3D hardware, inspector, labels and legends.
export const ROLE_COLORS = {
  compute:'#729dff', tensor:'#fa927e', memory:'#4ac8da', registers:'#edbc67',
  control:'#b49af7', interconnect:'#d08cde', transfer:'#56c9b0', substrate:'#91a4bf',
  conflict:'#fa927e', inactive:'#43536c'
};

export const COMPONENT_COLORS = {
  gpu:ROLE_COLORS.compute, gpc:ROLE_COLORS.compute, sm:ROLE_COLORS.compute,
  cuda:ROLE_COLORS.compute, tensor:ROLE_COLORS.tensor, execute:ROLE_COLORS.tensor,
  hbm:ROLE_COLORS.memory, shared:ROLE_COLORS.memory, banks:ROLE_COLORS.memory,
  bank:'#71d7e5', lsu:'#64c6db', tma:ROLE_COLORS.transfer, writeback:ROLE_COLORS.transfer,
  l2:ROLE_COLORS.registers, registers:ROLE_COLORS.registers, registerFile:ROLE_COLORS.registers,
  registerBank:'#f1c77e', operand:ROLE_COLORS.registers, scoreboard:ROLE_COLORS.registers,
  scheduler:ROLE_COLORS.control, warpPool:ROLE_COLORS.control, address:ROLE_COLORS.control,
  fetch:ROLE_COLORS.compute, dispatch:ROLE_COLORS.interconnect, simt:ROLE_COLORS.interconnect,
  nvlink:ROLE_COLORS.interconnect, pcie:ROLE_COLORS.interconnect,
  barrier:ROLE_COLORS.interconnect, spill:ROLE_COLORS.interconnect,
  substrate:ROLE_COLORS.substrate
};

export function colorFor(id) { return COMPONENT_COLORS[id] || ROLE_COLORS.substrate; }

export const ARCHITECTURE_LEGEND = [
  {className:'legend-compute',color:ROLE_COLORS.compute,title:'计算',description:'蓝色：CUDA 与通用计算'},
  {className:'legend-tensor',color:ROLE_COLORS.tensor,title:'Tensor',description:'珊瑚色：Tensor 与执行单元'},
  {className:'legend-memory',color:ROLE_COLORS.memory,title:'存储',description:'青色：HBM 与共享内存'},
  {className:'legend-register',color:ROLE_COLORS.registers,title:'寄存器 / L2',description:'琥珀色：寄存器、L2 与操作数'},
  {className:'legend-control',color:ROLE_COLORS.control,title:'调度',description:'紫色：Warp 调度与控制'},
  {className:'legend-io',color:ROLE_COLORS.interconnect,title:'互联',description:'品红色：互联、发射与同步；薄荷青：异步搬运'}
];
