import * as THREE from 'three';
import { colorFor } from './palette.js';

// These are functional teaching diagrams. Repeated blocks are visual samples,
// never an assertion about the installed chip's core count or floorplan.
function text(s, parent, value, x, y, z, width = 1.4, id) {
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.font = '600 43px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e7efff';
  ctx.fillText(value, 384, 64, 735);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  s.textures.add(texture);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  s.materials.add(material);
  const plane = s.mesh(new THREE.PlaneGeometry(width, width / 6), material, parent, x, y, z, id);
  plane.rotation.x = -Math.PI / 2;
  plane.castShadow = false; plane.receiveShadow = false;
}

function base(s, level, width = 7.5, depth = 5.7) {
  const root = s.groups[level] = s.group(s.scene, level);
  s.targets[level] ??= {};
  s.box(root, width, .13, depth, 0, -.13, 0, s.mats.graphite, null, .055);
  s.box(root, width - .12, .04, depth - .12, 0, -.025, 0, s.mats.metal, null, .035);
  s.box(root, width - .25, .13, depth - .25, 0, .065, 0, s.mats.silicon, null, .025);
  s.box(root, width - .4, .025, depth - .4, 0, .145, 0, s.mats.board, null, .018);
  s.modelBadge(root, 0, .17, depth / 2 - .2, 2.0, { compact: true, id: null });
  return root;
}

function block(s, root, level, id, x, z, w, d, material, title, height = .22) {
  const group = s.group(root, id, level, [x, .22, z]);
  s.box(group, w + .08, .055, d + .08, 0, 0, 0, s.mats.interposer, id, .02);
  s.box(group, w, height, d, 0, height / 2 + .035, 0, material, id, .025);
  s.box(group, w - .14, .018, d - .14, 0, height + .045, 0, material, id, .01);
  if (title) text(s, group, title, 0, height + .064, 0, Math.max(.45, w - .12), id);
  s.explosion(group, .35 + height);
  return group;
}

function flow(s, root, level, a, b, count = 3) {
  s.line(root, [[a[0], .185, a[1]], [b[0], .185, b[1]]], s.mats.etch);
  s.addFlow(root, level, [new THREE.Vector3(a[0], .74, a[1]), new THREE.Vector3(b[0], .74, b[1])], count);
}

function tileArray(s, parent, id, width, depth, material, columns = 6, rows = 3, y = .45) {
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    s.box(parent, width / columns * .7, .05, depth / rows * .65,
      -width / 2 + (col + .5) * width / columns, y,
      -depth / 2 + (row + .5) * depth / rows, material, id, .006);
  }
}

export function createPciePackage(s) {
  const root = s.groups.package = s.group(s.scene, 'package');
  const board = s.group(root, 'substrate', 'package');
  s.box(board, 8.1, .16, 5.3, 0, -.04, 0, s.mats.graphite, 'substrate', .07);
  s.box(board, 7.98, .035, 5.18, 0, .065, 0, s.mats.metal, 'substrate', .035);
  s.box(board, 7.85, .07, 5.06, 0, .115, 0, s.mats.board, 'substrate', .035);
  for (let i = 0; i < 24; i++) {
    const z = -2.21 + i * .184;
    s.line(board, [[-3.5, .16, z], [-2.9, .16, z], [-2.25, .16, z * .65]], s.mats.trace);
    s.line(board, [[3.5, .16, z], [2.9, .16, z], [2.25, .16, z * .65]], s.mats.trace);
    for (const x of [-3.52, 3.52]) s.box(board, .18, .07, .1, x, .195, z, i % 3 ? s.mats.graphite : s.mats.gold, 'substrate', .008);
  }
  // PCIe card edge contacts, distinct from an SXM/HBM interposer module.
  const pcie = s.group(root, 'pcie', 'package', [0, .04, 2.63]);
  s.box(pcie, 5.42, .055, .38, 0, 0, 0, s.mats.boardEdge, 'pcie', .01);
  for (let i = 0; i < 60; i++) {
    if (i === 14 || i === 15) continue;
    s.box(pcie, .06, .02, .3, -2.62 + i * .089, .043, .03, s.mats.gold, 'pcie', .003);
  }
  const bracket = s.group(root, 'substrate', null, [-3.95, .3, 0]);
  s.box(bracket, .14, .62, 5.46, 0, 0, 0, s.mats.metal, 'substrate', .02);
  for (let i = 0; i < 9; i++) s.box(bracket, .15, .16, .24, .005, .035, -1.7 + i * .42, s.mats.dark, 'substrate', .01);
  const gpu = block(s, root, 'package', 'gpu', 0, -.16, 2.85, 2.95, s.mats.silicon, null, .25);
  s.box(gpu, 2.48, .025, 2.58, 0, .304, 0, s.mats.computeDark, 'gpu', .015);
  tileArray(s, gpu, 'gpu', 2.25, 2.35, s.mats.compute, 5, 5, .345);
  s.modelBadge(gpu, 0, .39, -.03, 2.3);
  // Flat GDDR packages are outside the GPU package. Their count is illustrative.
  const memory = s.group(root, 'hbm', 'package');
  for (const x of [-2.22, 2.22]) for (let row = 0; row < 3; row++) {
    const chip = s.group(memory, 'hbm', null, [x, .2, -.16 + (row - 1) * 1.05]);
    s.box(chip, .88, .035, .82, 0, 0, 0, s.mats.gold, 'hbm', .015);
    s.box(chip, .82, .14, .76, 0, .085, 0, s.mats.memoryDark, 'hbm', .02);
    s.box(chip, .73, .018, .67, 0, .166, 0, s.mats.memory, 'hbm', .01);
    text(s, chip, s.gpu.memoryType || 'GDDR', 0, .181, 0, .7, 'hbm');
    flow(s, root, 'package', [x * .63, -.16 + (row - 1) * 1.05], [x, -.16 + (row - 1) * 1.05], 2);
  }
  s.explosion(memory, .8);
  if (s.gpu.id === 'a40') {
    const nvlink = block(s, root, 'package', 'nvlink', -.9, -2.46, 2.0, .23, s.mats.interconnect, 'NVLINK 3', .12);
    s.label('package', nvlink, 'nvlink', 'NVLINK 3.0', [0, .25, 0], [-28, -20]);
  }
  s.label('package', gpu, 'gpu', `${s.modelCode} · ${String(s.gpu.architecture || '').toUpperCase()}`, [0, .52, 0], [0, -25]);
  s.label('package', memory, 'hbm', `${s.gpu.memoryGB} GB ${s.gpu.memoryType} · FLAT PACKAGES`, [2.22, .49, -.16], [28, 0]);
  s.label('package', pcie, 'pcie', s.gpu.family === 'ampere' ? 'PCIe 4.0 ×16' : 'PCIe 5.0 ×16', [0, .2, .1], [0, 35]);
  s.label('package', board, 'substrate', 'PCIe CARD · SCHEMATIC', [-2.95, .25, 1.8], [-35, 10]);
}

function ascendPackage(s) {
  const root = base(s, 'package', 7.7, 5.8);
  s.targets.package.substrate = root;
  const dual = s.gpu.id === 'ascend-910c';
  const gpu = s.group(root, 'gpu', 'package');
  const positions = dual ? [-1.05, 1.05] : [0];
  for (let index = 0; index < positions.length; index++) {
    const die = block(s, gpu, 'package', 'gpu', positions[index], -.25, dual ? 1.85 : 2.9, 2.48, s.mats.computeDark, null, .28);
    tileArray(s, die, 'gpu', dual ? 1.6 : 2.55, 2.14, s.mats.compute, dual ? 3 : 4, 4, .36);
    text(s, die, dual ? `COMPUTE DIE ${index + 1}` : 'COMPUTE DOMAIN', 0, .435, -.06, dual ? 1.6 : 2.2, 'gpu');
  }
  // Two HBM regions denote external stacked memory, without claiming stack count.
  const memory = s.group(root, 'hbm', 'package');
  for (const x of [-2.85, 2.85]) {
    const hbm = s.group(memory, 'hbm', null, [x, .3, -.25]);
    for (let layer = 0; layer < 4; layer++) s.box(hbm, .72, .075, 2.3, 0, layer * .09, 0, layer === 3 ? s.mats.memory : s.mats.memoryDark, 'hbm', .014);
    text(s, hbm, 'HBM', 0, .334, 0, .66, 'hbm');
    flow(s, root, 'package', [Math.sign(x) * 1.3, -.25], [x, -.25]);
  }
  s.explosion(memory, .75);
  const hccs = block(s, root, 'package', 'nvlink', 0, -2.25, 3.9, .35, s.mats.interconnect, dual ? 'DIE / UNIFIED BUS INTERCONNECT' : 'HCCS / ACCELERATOR FABRIC', .14);
  const io = block(s, root, 'package', 'pcie', 0, 2.12, 3.9, .32, s.mats.transfer, 'HOST / SYSTEM I/O', .13);
  s.label('package', gpu, 'gpu', dual ? '910C · DUAL COMPUTE DIES' : '910B4 · COMPUTE DOMAIN', [0, .8, -.25], [0, -30]);
  s.label('package', memory, 'hbm', `${s.gpu.memoryGB ? `${s.gpu.memoryGB} GB ` : ''}HBM · SCHEMATIC`, [2.85, .75, -.25], [15, 8]);
  s.label('package', hccs, 'nvlink', dual ? 'DIE / UB SYSTEM INTERCONNECT' : 'HCCS INTERCONNECT', [0, .34, 0], [0, -20]);
  s.label('package', io, 'pcie', 'SYSTEM I/O', [0, .3, 0], [0, 25]);
  s.label('package', root, 'substrate', 'ASCEND · FUNCTIONAL PACKAGE', [-2.6, .25, 1.85], [-18, 8]);
}

function ascendDie(s) {
  const root = base(s, 'die');
  const dual = s.gpu.id === 'ascend-910c';
  const cores = s.group(root, 'gpc', 'die');
  const count = dual ? 2 : 1;
  for (let die = 0; die < count; die++) {
    const x = count === 1 ? 0 : -1.7 + die * 3.4;
    const panel = s.group(cores, 'gpc', null, [x, .22, -.23]);
    s.box(panel, count === 1 ? 5.9 : 2.95, .07, 3.55, 0, 0, 0, s.mats.interposer, 'gpc', .02);
    const columns = count === 1 ? 3 : 2;
    for (let row = 0; row < 2; row++) for (let col = 0; col < columns; col++) {
      const core = s.group(panel, 'sm', null, [count === 1 ? -1.9 + col * 1.9 : -.72 + col * 1.44, .15, -.86 + row * 1.66]);
      s.targets.die.sm ??= core;
      s.box(core, count === 1 ? 1.63 : 1.22, .18, 1.32, 0, 0, 0, s.mats.graphite, 'sm', .025);
      s.box(core, .55, .16, .94, -.23, .13, 0, s.mats.tensor, 'sm', .015);
      for (let vector = 0; vector < 2; vector++) s.box(core, .34, .12, .41, .34, .11, -.25 + vector * .5, s.mats.compute, 'sm', .01);
    }
    text(s, panel, count === 1 ? 'AIC + AIV ARRAY · SAMPLE BLOCKS' : `DIE ${die + 1} · SAMPLE BLOCKS`, 0, .48, 1.42, count === 1 ? 4.7 : 2.66, 'gpc');
  }
  s.explosion(cores, .8);
  const l2 = block(s, root, 'die', 'l2', 0, 1.88, 5.9, .3, s.mats.register, 'L2 / GLOBAL MEMORY FABRIC', .14);
  const hbm = block(s, root, 'die', 'hbm', 0, -2.25, 5.9, .28, s.mats.memory, 'HBM / GLOBAL MEMORY INTERFACE', .14);
  s.label('die', cores, 'gpc', dual ? 'DUAL-DIE COMPUTE ARRAYS' : 'AIC / AIV COMPUTE ARRAY', [-1.3, .7, -.3], [-30, -30]);
  s.label('die', s.targets.die.sm, 'sm', 'AIC + AIV · FUNCTIONAL GROUP', [0, .34, 0], [15, 45]);
  s.label('die', l2, 'l2', 'L2 / GM FABRIC', [0, .3, 0], [15, 26]);
  s.label('die', hbm, 'hbm', 'HBM INTERFACE', [0, .3, 0], [0, -24]);
  for (const x of [-2.5, 0, 2.5]) flow(s, root, 'die', [x, -2.25], [x, 1.88]);
}

function ascendCore(s) {
  const root = base(s, 'sm');
  s.targets.sm.sm = root;
  // AIC and AIV have separate scalar control and local memories. GM is their
  // exchange boundary; there is no CUDA-like shared register file between them.
  const aic = s.group(root, 'sm', null, [-1.65, .2, -.25]);
  s.box(aic, 3.05, .055, 3.95, 0, 0, 0, s.mats.interposer, 'sm', .025);
  text(s, aic, 'AIC · MATRIX DOMAIN', 0, .055, -1.76, 2.8, 'sm');
  const cube = block(s, root, 'sm', 'tensor', -1.65, -.1, 2.2, 1.18, s.mats.tensor, 'CUBE · MATRIX', .42);
  tileArray(s, cube, 'tensor', 1.85, .8, s.mats.tensorDark, 5, 3, .52);
  const scalar = block(s, root, 'sm', 'registers', -1.65, -1.55, 2.4, .42, s.mats.control, 'AIC SCALAR / INSTRUCTION', .15);
  const shared = s.group(root, 'shared', 'sm');
  block(s, shared, 'sm', 'shared', -1.65, 1.18, 2.35, .58, s.mats.memory, 'L1 + L0A / L0B / L0C', .19);
  const vector = s.group(root, 'cuda', 'sm');
  for (let index = 0; index < 2; index++) {
    const x = .88 + index * 1.47;
    const panel = s.group(vector, 'cuda', null, [x, .2, -.25]);
    s.box(panel, 1.3, .055, 3.95, 0, 0, 0, s.mats.interposer, 'cuda', .02);
    text(s, panel, `AIV ${index + 1}`, 0, .055, -1.76, 1.15, 'cuda');
    block(s, vector, 'sm', 'cuda', x, -.1, 1.08, 1.2, s.mats.compute, 'VECTOR', .34);
    block(s, root, 'sm', 'scheduler', x, -1.55, 1.08, .42, s.mats.control, 'SCALAR', .15);
    block(s, shared, 'sm', 'shared', x, 1.18, 1.08, .58, s.mats.memory, 'UB', .19);
  }
  const gm = block(s, root, 'sm', 'lsu', 0, 2.06, 6.4, .3, s.mats.lsu, 'GM · AIC / AIV EXCHANGE VIA GLOBAL MEMORY', .14);
  const mte = block(s, root, 'sm', 'tma', 0, -.1, .34, 2.9, s.mats.transfer, null, .2);
  const barrier = block(s, root, 'sm', 'barrier', 0, -1.92, .6, .28, s.mats.interconnect, 'SYNC', .15);
  for (const x of [-1.65, .88, 2.35]) flow(s, root, 'sm', [x, 2.06], [x, 1.18]);
  s.label('sm', cube, 'tensor', 'AIC · CUBE', [0, .64, 0], [-25, -5]);
  s.label('sm', vector, 'cuda', 'AIV · VECTOR', [2, .75, -.1], [30, 5]);
  s.label('sm', scalar, 'registers', 'SEPARATE SCALAR CONTROL', [0, .3, 0], [-25, -27]);
  s.label('sm', shared, 'shared', 'AIC L1/L0 · AIV UB', [0, .65, 1.18], [0, 19]);
  s.label('sm', gm, 'lsu', 'GM EXCHANGE BOUNDARY', [0, .3, 0], [10, 39]);
  s.label('sm', mte, 'tma', 'MTE DATA MOVEMENT', [0, .55, 0], [0, -35]);
  s.label('sm', barrier, 'barrier', 'EVENT SYNCHRONIZATION', [0, .3, 0], [30, -28]);
}

function ascendLocalMemory(s) {
  const root = base(s, 'shared');
  const gm = block(s, root, 'shared', 'address', 0, -2.18, 5.9, .43, s.mats.control, 'GM · GLOBAL MEMORY', .15);
  const l1 = block(s, root, 'shared', 'banks', -1.85, -.28, 2.65, 1.65, s.mats.memoryDark, 'L1 · AIC LOCAL MEMORY', .31);
  tileArray(s, l1, 'banks', 2.23, 1.0, s.mats.memory, 6, 3, .42);
  const ub = block(s, root, 'shared', 'bank', 1.85, -.28, 2.65, 1.65, s.mats.memoryDark, 'UB · AIV LOCAL MEMORY', .31);
  tileArray(s, ub, 'bank', 2.23, 1.0, s.mats.memory, 6, 3, .42);
  const mte2 = block(s, root, 'shared', 'tma', 0, -1.36, 2.0, .4, s.mats.transfer, 'MTE2 · GM → L1 / UB', .17);
  const mte1 = block(s, root, 'shared', 'lsu', -1.85, 1.3, 2.65, .58, s.mats.lsu, 'MTE1 · L1 → L0A / L0B', .21);
  const mte3 = block(s, root, 'shared', 'writeback', 1.85, 1.3, 2.65, .58, s.mats.transfer, 'MTE3 · UB → GM', .21);
  const sync = block(s, root, 'shared', 'barrier', 0, 2.12, 3.8, .31, s.mats.interconnect, 'EVENTS · PRODUCER / CONSUMER SYNC', .14);
  flow(s, root, 'shared', [0, -2.18], [0, -1.36]);
  for (const x of [-1.85, 1.85]) flow(s, root, 'shared', [0, -1.36], [x, -.28]);
  flow(s, root, 'shared', [-1.85, -.28], [-1.85, 1.3]);
  flow(s, root, 'shared', [1.85, -.28], [1.85, 1.3]);
  flow(s, root, 'shared', [1.85, 1.3], [3.25, -2.18]);
  s.label('shared', gm, 'address', 'GM / GLOBAL MEMORY', [0, .3, 0], [0, -25]);
  s.label('shared', l1, 'banks', 'L1 · AIC', [0, .6, 0], [-45, 0]);
  s.label('shared', ub, 'bank', 'UB · AIV', [0, .6, 0], [45, 0]);
  s.label('shared', mte2, 'tma', 'MTE2 · GM → L1 / UB', [0, .4, 0], [0, -25]);
  s.label('shared', mte1, 'lsu', 'MTE1 · L1 → L0A/B', [0, .4, 0], [-35, 23]);
  s.label('shared', mte3, 'writeback', 'MTE3 · UB → GM', [0, .4, 0], [35, 23]);
  s.label('shared', sync, 'barrier', 'EVENT SYNCHRONIZATION', [0, .3, 0], [0, 29]);
}

function ascendMatrix(s) {
  const root = base(s, 'registers');
  const buffers = s.group(root, 'registerBank', 'registers');
  const a = block(s, buffers, 'registers', 'registerBank', -2.2, -1.03, 1.6, 1.13, s.mats.register, 'L0A · MATRIX A', .27);
  const b = block(s, buffers, 'registers', 'registerBank', 0, -1.7, 1.6, .7, s.mats.registerLight, 'L0B · MATRIX B', .27);
  const cube = block(s, root, 'registers', 'tensor', 0, -.1, 1.65, 1.45, s.mats.tensor, 'CUBE · A × B + C', .4);
  const c = block(s, root, 'registers', 'registerFile', 2.2, -.1, 1.6, 1.8, s.mats.register, 'L0C · ACCUMULATOR', .32);
  tileArray(s, c, 'registerFile', 1.23, 1.35, s.mats.registerLight, 4, 5, .42);
  const mte1 = block(s, root, 'registers', 'operand', -2.2, 1.08, 1.6, .66, s.mats.transfer, 'MTE1 · FROM L1', .2);
  const fixpipe = block(s, root, 'registers', 'writeback', 1.2, 1.8, 3.55, .45, s.mats.transfer, 'FIXPIPE · L0C → GM / L1', .21);
  const gm = block(s, root, 'registers', 'spill', 0, -2.38, 4.9, .28, s.mats.interconnect, 'GM / L1 · RESULT DESTINATION', .13);
  flow(s, root, 'registers', [-2.2, 1.08], [-2.2, -1.03]);
  flow(s, root, 'registers', [-2.2, -1.03], [0, -.1]);
  flow(s, root, 'registers', [0, -1.7], [0, -.1]);
  flow(s, root, 'registers', [0, -.1], [2.2, -.1]);
  flow(s, root, 'registers', [2.2, -.1], [1.2, 1.8]);
  flow(s, root, 'registers', [1.2, 1.8], [3.25, -2.38]);
  s.label('registers', a, 'registerBank', 'L0A / L0B · INPUT BUFFERS', [0, .47, 0], [-35, -10]);
  s.label('registers', b, 'registerBank', 'L0B', [0, .47, 0], [20, -17]);
  s.label('registers', cube, 'tensor', 'CUBE MATRIX ENGINE', [0, .65, 0], [0, -15]);
  s.label('registers', c, 'registerFile', 'L0C · MATRIX ACCUMULATOR', [0, .55, 0], [45, 0]);
  s.label('registers', mte1, 'operand', 'MTE1 · L1 → L0A / L0B', [0, .4, 0], [-40, 25]);
  s.label('registers', fixpipe, 'writeback', 'FIXPIPE · RESULT CONVERSION', [0, .4, 0], [25, 30]);
  s.label('registers', gm, 'spill', 'GM / L1 DESTINATION', [0, .3, 0], [0, -23]);
}

function ascendPipeline(s) {
  const root = base(s, 'warp', 7.5, 6.0);
  s.warpStageMaterials = {}; s.warpStages = {};
  const entries = [
    ['warpPool', -2.35, -2.18, 'TASK QUEUE', 1.7, .5],
    ['fetch', 0, -2.18, 'FETCH / DECODE', 1.7, .5],
    ['scheduler', 2.35, -2.18, 'SCALAR CONTROL', 1.7, .5],
    ['dispatch', 2.35, -.6, 'INSTRUCTION DISPATCH', 1.7, .65],
    ['operand', 0, -.6, 'MTE · DATA READY', 1.7, .65],
    ['execute', -2.35, -.6, 'CUBE / VECTOR', 1.7, 1.0],
    ['writeback', -1.18, 1.38, 'FIXPIPE · CUBE RESULT', 2.7, .56],
    ['scoreboard', 1.52, 1.38, 'EVENT WAIT / SET', 2.1, .56],
  ];
  for (const [id, x, z, title, width, depth] of entries) {
    const material = s.material(colorFor(id), .34, .46, colorFor(id), .045);
    s.warpStageMaterials[id] = material;
    s.warpStages[id] = block(s, root, 'warp', id, x, z, width, depth, material, title, id === 'execute' ? .4 : .22);
  }
  const mte3 = block(s, root, 'warp', 'writeback', -1.18, 2.22, 2.7, .35, s.mats.transfer, 'MTE3 · UB → GM', .16);
  const sync = block(s, root, 'warp', 'simt', 1.52, 2.22, 2.1, .35, s.mats.interconnect, 'PIPELINE BARRIER', .16);
  s.warpStages.simt = sync;
  // Flow indices match the eight explanation steps in ASCEND_FLOWS.warp.
  const routes = [
    ['fetch', 'scheduler'], ['scheduler', 'dispatch'], ['dispatch', 'warpPool'],
    ['warpPool', 'scoreboard'], ['scoreboard', 'execute'], ['operand', 'execute'],
    ['execute', 'writeback'], ['writeback', 'simt'],
  ];
  for (const [from, to] of routes) {
    const a = s.warpStages[from].position;
    const b = s.warpStages[to].position;
    flow(s, root, 'warp', [a.x, a.z], [b.x, b.z]);
  }
  s.line(root, [[-2.35, .185, -.6], [-3.36, .185, -.6], [-3.36, .185, 2.22], [-1.18, .185, 2.22]], s.mats.etch);
  s.label('warp', s.warpStages.warpPool, 'warpPool', 'TASK / INSTRUCTION QUEUE', [0, .4, 0], [-25, -28]);
  s.label('warp', s.warpStages.scheduler, 'scheduler', 'AIC / AIV SCALAR CONTROL', [0, .4, 0], [30, -26]);
  s.label('warp', s.warpStages.operand, 'operand', 'DATA MOVEMENT / READINESS', [0, .4, 0], [0, -12]);
  s.label('warp', s.warpStages.execute, 'execute', 'CUBE / VECTOR PIPELINES', [0, .63, 0], [-40, 15]);
  s.label('warp', s.warpStages.writeback, 'writeback', 'CUBE → FIXPIPE', [0, .4, 0], [-20, 18]);
  s.label('warp', mte3, 'writeback', 'UB → MTE3 → GM', [0, .35, 0], [-20, 35]);
  s.label('warp', s.warpStages.scoreboard, 'scoreboard', 'EVENT SYNCHRONIZATION', [0, .4, 0], [30, 15]);
  s.label('warp', sync, 'simt', 'PIPELINE BARRIER', [0, .35, 0], [30, 35]);
}

export function createAscendScenes(s) {
  ascendPackage(s);
  ascendDie(s);
  ascendCore(s);
  ascendLocalMemory(s);
  ascendMatrix(s);
  ascendPipeline(s);
}
