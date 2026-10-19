import * as THREE from 'three';
import { colorFor, ROLE_COLORS } from './palette.js';

// Every layout below is an explanatory model, not a recovered silicon floorplan.
// In particular, register subdivisions and displayed ports are illustrative.
const BANK_COLORS = ['#43b8d1', '#62cbdb', '#7cdaea', '#53bedb'];

function plaque(s, parent, text, x, y, z, width = 1.0, color = '#d5e3f5', id) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 96);
  ctx.font = '500 36px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  s.deepTextures ??= [];
  s.deepTextures.push(texture);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  s.materials.add(material);
  const mesh = s.mesh(new THREE.PlaneGeometry(width, width * 96 / 512), material, parent, x, y, z, id);
  mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function foundation(s, level, width = 7.2, depth = 5.6) {
  const root = s.groups[level] = s.group(s.scene, level);
  const base = s.group(root, null);
  s.box(base, width, .13, depth, 0, -.09, 0, s.mats.graphite, null, .06);
  s.box(base, width - .1, .035, depth - .1, 0, .005, 0, s.mats.metal, null, .035);
  s.box(base, width - .24, .12, depth - .24, 0, .085, 0, s.mats.silicon, null, .025);
  s.box(base, width - .42, .024, depth - .42, 0, .16, 0, s.mats.board, null, .018);
  for (let i = 0; i < 18; i++) {
    const x = -width / 2 + .5 + i * (width - 1) / 17;
    for (const z of [-depth / 2 + .28, depth / 2 - .28]) s.box(base, .075, .018, .1, x, .184, z, s.mats.gold, null, .003);
  }
  s.modelBadge(base, 0, .186, depth / 2 - .13, 1.62, { compact: true, id: null });
  return root;
}

function route(s, parent, points, material = s.mats.trace) {
  return s.line(parent, points.map(([x, z]) => [x, .205, z]), material);
}

function chip(s, parent, id, level, position, size, material, text) {
  const group = s.group(parent, id, level, position);
  s.box(group, size[0] + .1, .045, size[1] + .1, 0, 0, 0, s.mats.interposer, id, .018);
  s.box(group, size[0], .18, size[1], 0, .11, 0, material, id, .025);
  s.box(group, size[0] - .14, .018, size[1] - .14, 0, .211, 0, material, id, .008);
  if (text) plaque(s, group, text, 0, .225, size[1] > .7 ? -size[1] / 2 + .13 : 0, size[0] - .08, '#18273b', id);
  return group;
}

export function createSharedScene(s) {
  const root = foundation(s, 'shared', 7.35, 5.65);
  const banks = s.group(root, 'banks', 'shared', [0, .23, -.35]);
  s.bankTiles = [];
  s.bankMaterials = [];
  const cyan = s.material(ROLE_COLORS.memory, .34, .45, 0x175a72, .08);
  const decoder = chip(s, root, 'address', 'shared', [0, .235, -2.22], [5.7, .42], s.mats.control, 'ADDRESS DECODE / BANK ROUTING');
  for (let i = 0; i < 32; i++) {
    const x = -2.65 + (i % 8) * .755;
    const z = -1.075 + Math.floor(i / 8) * .71;
    const bank = s.group(banks, 'bank', null, [x, 0, z]);
    bank.userData.bank = i;
    const material = s.material(BANK_COLORS[Math.floor(i / 8)], .32, .46, 0x175a72, .08);
    s.bankMaterials.push(material);
    s.bankTiles.push(bank);
    s.box(bank, .64, .04, .59, 0, 0, 0, s.mats.gold, 'bank', .012);
    // SRAM layers visually stand in for rows, rather than transistor topology.
    for (let row = 0; row < 3; row++) {
      s.box(bank, .58, .072, .53, 0, .072 + row * .087, 0, row === 2 ? material : s.mats.memoryDark, 'bank', .009);
      s.box(bank, .6, .009, .55, 0, .112 + row * .087, 0, s.mats.metal, 'bank', .006);
    }
    for (let col = 0; col < 4; col++) s.box(bank, .06, .012, .35, -.19 + col * .127, .294, 0, material, 'bank', .003);
    plaque(s, bank, String(i).padStart(2, '0'), 0, .32, .03, .39, '#153247', 'bank');
    const fabricX = -2.65 + (i % 8) * .755;
    route(s, root, [[fabricX, -1.84], [fabricX, z - .35]], s.mats.etch);
  }
  s.targets.shared.bank = s.bankTiles[0];
  s.explosion(banks, .9);
  s.explosion(decoder, .25);
  // This wide fabric separates banked SRAM from the memory service engines.
  const fabric = s.group(root, 'banks', null, [0, .245, 1.42]);
  s.box(fabric, 6.27, .08, .25, 0, 0, 0, cyan, 'banks', .012);
  for (let i = 0; i < 32; i++) s.box(fabric, .018, .015, .19, -3.01 + i * .194, .05, 0, s.mats.gold, 'banks', .002);
  const lsu = chip(s, root, 'lsu', 'shared', [-2.28, .245, 2.03], [1.6, .68], s.mats.lsu, 'LOAD / STORE');
  const tma = chip(s, root, 'tma', 'shared', [0, .245, 2.03], [1.6, .68], s.mats.transfer, 'TMA');
  const barrier = chip(s, root, 'barrier', 'shared', [2.28, .245, 2.03], [1.6, .68], s.mats.interconnect, 'MBARRIER');
  for (const x of [-2.28, 0, 2.28]) route(s, root, [[x, 1.42], [x, 2.03]]);
  s.explosion(lsu, .35);
  s.explosion(tma, .48);
  s.explosion(barrier, .35);
  s.label('shared', banks, 'banks', 'BANK ARRAY ×32', [-1, .45, -.65], [-16, -24]);
  s.label('shared', decoder, 'address', 'ADDRESS DECODE', [0, .27, 0], [0, -18]);
  s.label('shared', lsu, 'lsu', 'LSU', [0, .27, 0], [-45, 32]);
  s.label('shared', tma, 'tma', 'TMA ENGINE', [0, .27, 0], [0, 58]);
  s.label('shared', barrier, 'barrier', 'BARRIER', [0, .27, 0], [44, 28]);
  for (let i = 0; i < 4; i++) s.addFlow(root, 'shared', [new THREE.Vector3(-2.28 + i * 1.52, .62, 2), new THREE.Vector3(-2.28 + i * 1.52, .62, -1.4)], 3);
}

export function createRegistersScene(s) {
  const root = foundation(s, 'registers', 7.35, 5.65);
  const file = s.group(root, 'registerFile', 'registers', [0, .23, -.79]);
  s.registerRowMaterials = Array.from({ length: 8 }, () => s.material(ROLE_COLORS.registers, .34, .47, 0x805518, .06));
  for (let partition = 0; partition < 4; partition++) {
    const x = -2.45 + partition * 1.63;
    const sub = s.group(file, 'registerBank', null, [x, 0, 0]);
    s.targets.registers.registerBank ??= sub;
    s.box(sub, 1.44, .055, 2.56, 0, 0, 0, s.mats.interposer, 'registerBank', .018);
    s.box(sub, 1.32, .13, 2.44, 0, .09, 0, s.mats.graphite, 'registerBank', .018);
    for (let row = 0; row < 8; row++) {
      const z = -.99 + row * .265;
      for (let col = 0; col < 5; col++) {
        s.box(sub, .195, .095, .198, -.46 + col * .231, .208, z, s.registerRowMaterials[row], 'registerBank', .006);
        s.box(sub, .145, .009, .028, -.46 + col * .231, .26, z, s.mats.metal, 'registerBank', 0);
      }
    }
    plaque(s, sub, `PARTITION ${partition}`, 0, .275, 1.09, 1.21, '#f3d39b', 'registerBank');
    for (const side of [-1, 1]) {
      s.box(sub, .063, .08, 2.2, side * .663, .208, -.03, side < 0 ? s.mats.register : s.mats.registerLight, 'registerBank', .006);
    }
  }
  s.explosion(file, .7);
  const operand = s.group(root, 'operand', 'registers', [0, .25, 1.16]);
  const writeback = s.group(root, 'writeback', 'registers', [0, .25, 2.09]);
  for (let partition = 0; partition < 4; partition++) {
    const x = -2.45 + partition * 1.63;
    s.box(operand, 1.4, .18, .53, x, .08, 0, s.mats.register, 'operand', .017);
    s.box(operand, 1.17, .015, .34, x, .18, 0, s.mats.graphite, 'operand', .006);
    for (let i = 0; i < 3; i++) {
      s.box(operand, .24, .04, .24, x - .34 + i * .34, .2, 0, s.mats.registerLight, 'operand', .007);
      route(s, root, [[x - .34 + i * .34, .53], [x - .34 + i * .34, .88]]);
    }
    s.box(writeback, 1.41, .16, .54, x, .08, 0, s.mats.transfer, 'writeback', .015);
    plaque(s, writeback, 'ALU / WRITEBACK', x, .17, 0, 1.28, '#18273b', 'writeback');
    for (const dx of [-.5, .5]) route(s, root, [[x + dx, 1.42], [x + dx, 1.82]]);
    route(s, root, [[x + .73, 2.09], [x + .73, -.8], [x + .65, -.8]]);
    s.addFlow(root, 'registers', [new THREE.Vector3(x, .65, -.6), new THREE.Vector3(x, .65, 2.05)], 3);
  }
  s.explosion(operand, .4);
  s.explosion(writeback, 1.05);
  const spill = chip(s, root, 'spill', 'registers', [0, .24, -2.31], [3.3, .36], s.mats.interconnect, 'LOCAL MEMORY / SPILL PATH');
  for (const x of [-2.45, -.82, .82, 2.45]) route(s, root, [[x, -2.05], [x, -2.31], [0, -2.31]]);
  s.label('registers', file, 'registerFile', 'REGISTER FILE ×4', [0, .45, -.63], [0, -36]);
  s.label('registers', s.targets.registers.registerBank, 'registerBank', 'REGISTER ARRAYS', [0, .36, .3], [-47, 1]);
  s.label('registers', operand, 'operand', 'OPERAND COLLECTORS', [0, .36, 0], [38, 1]);
  s.label('registers', writeback, 'writeback', 'ALU / WRITEBACK', [1.2, .32, 0], [23, 39]);
  s.label('registers', spill, 'spill', 'SPILL PATH', [0, .25, 0], [0, -23]);
}

export function createWarpScene(s) {
  const root = foundation(s, 'warp', 7.35, 5.85);
  s.warpStageMaterials = {};
  s.warpStages = {};
  const pool = s.group(root, 'warpPool', 'warp', [0, .24, -2.29]);
  s.warpPoolMaterials = [];
  for (let warp = 0; warp < 4; warp++) {
    const x = -2.32 + warp * 1.55;
    const material = s.material(colorFor('warpPool'), .34, .46, 0x533382, .06);
    s.warpPoolMaterials.push(material);
    s.box(pool, 1.38, .19, .43, x, .08, 0, material, 'warpPool', .015);
    // A warp has32 logical thread lanes; these marks are not storage cells.
    for (let lane = 0; lane < 32; lane++) s.box(pool, .045, .016, .065, x - .566 + (lane % 16) * .0755, .184, -.12 + Math.floor(lane / 16) * .24, s.mats.gold, 'warpPool', .002);
    plaque(s, pool, `WARP ${warp}`, x, .206, .01, .8, '#242344', 'warpPool');
  }
  // A loop shows the logical instruction path; the geometry is intentionally schematic.
  const stages = [
    ['fetch', -2.3, -1.13, '01 / FETCH + DECODE', .84],
    ['scoreboard', 0, -1.13, '02 / SCOREBOARD', .84],
    ['scheduler', 2.3, -1.13, '03 / WARP SCHEDULER', .84],
    ['dispatch', 2.3, .36, '04 / DISPATCH', .82],
    ['operand', 0, .36, '05 / OPERAND GATHER', .82],
    ['execute', -2.3, .52, '06 / EXECUTION', 1.13],
    ['writeback', 0, 1.9, '07 / WRITEBACK', .58],
  ];
  for (const [id, x, z, text, depth] of stages) {
    const material = s.material(colorFor(id), .34, .46, colorFor(id), .045);
    s.warpStageMaterials[id] = material;
    const group = chip(s, root, id, 'warp', [x, .25, z], [1.72, depth], material, text);
    s.warpStages[id] = group;
    s.explosion(group, id === 'execute' ? .85 : id === 'operand' ? .6 : .35);
    if (id === 'scoreboard') {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 6; j++) s.box(group, .13, .03, .065, -.62 + j * .249, .24, -.04 + i * .16, i === 0 ? s.mats.registerLight : s.mats.graphite, id, .002);
    }
    if (id === 'execute') {
      for (let unit = 0; unit < 4; unit++) {
        s.box(group, .315, .12, .39, -.57 + unit * .38, .28, .1, unit === 2 ? s.mats.compute : s.mats.tensorDark, id, .012);
        for (let i = 0; i < 4; i++) s.box(group, .041, .014, .26, -.68 + unit * .38 + i * .07, .348, .1, s.mats.metal, id, .002);
      }
    }
    if (id === 'scheduler' || id === 'dispatch') {
      for (let i = 0; i < 5; i++) s.box(group, .17, .04, .2, -.56 + i * .28, .24, .1, s.mats.gold, id, .005);
    }
  }
  const simt = chip(s, root, 'simt', 'warp', [2.3, .25, 1.9], [1.72, .58], s.mats.interconnect);
  for (let lane = 0; lane < 32; lane++) s.box(simt, .13, .024, .065, -.66 + (lane % 8) * .189, .24, -.16 + Math.floor(lane / 8) * .107, s.mats.metal, 'simt', .002);
  s.explosion(simt, .5);
  s.explosion(pool, .22);
  for (const [a, b] of [['fetch', 'scoreboard'], ['scoreboard', 'scheduler'], ['scheduler', 'dispatch'], ['dispatch', 'operand'], ['operand', 'execute']]) {
    const p = s.warpStages[a].position;
    const q = s.warpStages[b].position;
    route(s, root, [[p.x, p.z], [q.x, q.z]]);
    s.addFlow(root, 'warp', [new THREE.Vector3(p.x, .65, p.z), new THREE.Vector3(q.x, .65, q.z)], 3);
  }
  route(s, root, [[-2.3, -2.29], [-2.3, -1.13]]);
  route(s, root, [[-2.3, 1.13], [-2.3, 1.9], [0, 1.9]]);
  route(s, root, [[0, 2.2], [0, 2.48], [-3.3, 2.48], [-3.3, -2.29], [-2.3, -2.29]]);
  route(s, root, [[2.3, 1.9], [2.3, .36]]);
  s.addFlow(root, 'warp', [new THREE.Vector3(-2.3, .65, 1.9), new THREE.Vector3(0, .65, 1.9)], 3);
  s.label('warp', pool, 'warpPool', 'WARP POOL', [0, .33, 0], [0, -31]);
  s.label('warp', s.warpStages.fetch, 'fetch', 'FETCH / DECODE', [0, .3, 0], [-50, -12]);
  s.label('warp', s.warpStages.scoreboard, 'scoreboard', 'SCOREBOARD', [0, .3, 0], [0, -17]);
  s.label('warp', s.warpStages.scheduler, 'scheduler', 'WARP SCHEDULER', [0, .32, 0], [48, -4]);
  s.label('warp', s.warpStages.execute, 'execute', 'EXECUTION UNITS', [0, .48, .12], [-51, 20]);
  s.label('warp', s.warpStages.operand, 'operand', 'OPERAND GATHER', [0, .32, 0], [0, 15]);
  s.label('warp', s.warpStages.writeback, 'writeback', 'WRITEBACK', [0, .32, 0], [0, 36]);
  s.label('warp', simt, 'simt', 'SIMT MASK', [0, .32, 0], [43, 29]);
}

export function applyDeepExperiment(s, state) {
  if (s.bankMaterials) {
    const hasAccesses = state.bankCounts?.some(count => Number(count) > 0);
    for (let i = 0; i < s.bankMaterials.length; i++) {
      const count = Math.max(0, Number(state.bankCounts?.[i]) || 0);
      const selected = state.selectedBank === i;
      const material = s.bankMaterials[i];
      const base = count > 1 ? ROLE_COLORS.conflict : count === 1 ? '#6ed7e7' : hasAccesses ? ROLE_COLORS.inactive : BANK_COLORS[Math.floor(i / 8)];
      material.color.set(base);
      if (selected) material.color.lerp(new THREE.Color('#ecfcff'), .42);
      material.emissive.set(count > 1 ? '#b64e39' : count || selected ? '#237f9a' : '#102d44');
      material.emissiveIntensity = count > 1 ? .3 : count ? .23 : selected ? .2 : .04;
    }
    if (Number.isInteger(state.selectedBank) && s.bankTiles[state.selectedBank]) {
      s.lastBank = state.selectedBank;
      s.targets.shared.bank = s.bankTiles[state.selectedBank];
    }
  }
  const rows = Math.ceil(THREE.MathUtils.clamp(Number(state.registerUsage) || 64, 1, 255) / 255 * 8);
  s.registerRowMaterials?.forEach((material, index) => {
    material.color.set(index < rows ? (index % 2 ? '#f4cb82' : ROLE_COLORS.registers) : '#35445c');
    material.emissive.setHex(index < rows ? 0x805518 : 0x000000);
    material.emissiveIntensity = index < rows ? .1 : 0;
  });
  for (const [id, material] of Object.entries(s.warpStageMaterials || {})) {
    const active = id === state.stage;
    material.color.set(colorFor(id));
    if (active) material.color.lerp(new THREE.Color('#f0f7ff'), .24);
    material.emissive.set(colorFor(id));
    material.emissiveIntensity = active ? .28 : .045;
  }
  s.warpPoolMaterials?.forEach((material, index) => {
    const active = index === state.activeWarp;
    material.color.set(active ? '#c9b8ff' : '#8976bb');
    material.emissive.setHex(active ? 0x7858b9 : 0x3c285f);
    material.emissiveIntensity = active ? .25 : .05;
  });
}
