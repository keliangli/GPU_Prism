import * as THREE from 'three';

const SUPPORTED = new Set(['attn_core', 'mla_kv_latent', 'csa_cache', 'kda_state', 'moe_router', 'shared_expert', 'moe_shared']);
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

function instances(count, accent) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: .36, metalness: .28,
    emissive: accent, emissiveIntensity: .18, transparent: true, opacity: 1
  });
  const result = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, count);
  result.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  result.frustumCulled = false;
  return result;
}

function cageGeometry(w, h, d) {
  const points = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const p = [x * w * .44, y * h * .43, z * d * .37];
    for (let axis = 0; axis < 3; axis++) {
      const q = [...p]; q[axis] *= .72;
      points.push(...p, ...q);
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
}

function captureShell(mesh) {
  const states = [], seen = new Set();
  mesh.traverse(object => {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      states.push({ material, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite });
    }
  });
  return states;
}

/** A schematic inside a component, driven by the parent scene's clock and focus. */
export function createComponentCutaway(mesh, nodeId, cfg = {}, layerInfo = {}) {
  if (!SUPPORTED.has(nodeId) || mesh?.name !== 'compute-module' || !mesh.geometry || cfg.availability === 'preview') return null;
  if (mesh.children.some(child => child.name === 'component-cutaway')) return null;

  mesh.geometry.computeBoundingBox();
  const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every(n => Number.isFinite(n) && n > 0)) return null;
  const w = size.x, h = size.y, d = size.z;
  const recurrent = ['kda', 'ssm'].includes(layerInfo.attention);
  const kind = nodeId === 'moe_router' ? 'router' : ['shared_expert', 'moe_shared'].includes(nodeId) ? 'shared'
    : nodeId === 'kda_state' || (nodeId === 'attn_core' && recurrent) ? 'state'
    : ['mla_kv_latent', 'csa_cache'].includes(nodeId) ? 'cache' : 'attention';
  const accent = (mesh.material.emissive ?? mesh.material.color ?? new THREE.Color(0x58bde7)).clone();
  const bright = accent.clone().lerp(new THREE.Color(0xd8f5ff), .35);
  const idle = new THREE.Color(0x243b59), amber = new THREE.Color(0xedc987);
  const shellMaterials = captureShell(mesh);
  const group = new THREE.Group();
  group.name = 'component-cutaway'; group.visible = false;
  mesh.add(group);

  const cage = new THREE.LineSegments(cageGeometry(w, h, d), new THREE.LineBasicMaterial({ color: bright, transparent: true, opacity: .8, toneMapped: false }));
  group.add(cage);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(w * .88, h * .065, d * .76),
    new THREE.MeshStandardMaterial({ color: 0x102239, metalness: .6, roughness: .4, transparent: true, opacity: .9 }));
  tray.position.y = -h * .39; group.add(tray);

  const dummy = new THREE.Object3D(), cells = [];
  let main, secondary = null, routeLines = null, note;
  function cell(target, i, x, y, z, sx, sy, sz, color) {
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    target.setMatrixAt(i, dummy.matrix); target.setColorAt(i, color);
  }
  function finish(target) {
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
  }

  if (kind === 'router') {
    const totalRouted = Math.max(0, Math.floor(Number(cfg.n_routed_experts) || 0));
    const totalShared = Math.max(0, Math.floor(Number(cfg.n_shared_experts) || 0));
    const topK = Math.max(0, Math.min(totalRouted, Math.floor(Number(cfg.num_experts_per_tok) || 0)));
    const displayRouted = Math.min(24, totalRouted), displayShared = Math.min(4, totalShared);
    if (!displayRouted && !displayShared) {
      group.removeFromParent(); cage.geometry.dispose(); cage.material.dispose(); tray.geometry.dispose(); tray.material.dispose();
      return null;
    }
    group.userData = { totalRouted, displayRouted, totalShared, displayShared, topK, sampleIds: [] };
    main = instances(displayRouted + displayShared, accent); group.add(main);
    secondary = instances(1, accent); group.add(secondary);
    cell(secondary, 0, 0, h * .29, 0, w * .17, h * .1, d * .35, amber); finish(secondary);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((displayRouted + displayShared) * 6), 3));
    routeLines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: bright, transparent: true, opacity: .72, toneMapped: false }));
    group.add(routeLines);
    note = `专家抽样示意：显示 ${displayRouted}/${totalRouted} 个路由专家，激活 ${topK} 个；共享 ${totalShared} 个${displayShared < totalShared ? '（聚合显示）' : ''}。`;
  } else if (kind === 'attention') {
    // Coarse cells express access patterns, rather than individual attention heads.
    const cols = 12, rows = 10;
    main = instances(cols * rows, accent); group.add(main);
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      cells.push({ x: (col / (cols - 1) - .5) * w * .71, y: (row / (rows - 1) - .5) * h * .63,
        z: d * .06, sx: w * .048, sy: h * .043, sz: d * .09, row, col });
    }
    secondary = instances(3, accent); group.add(secondary);
    for (let i = 0; i < 3; i++) cell(secondary, i, (i - 1) * w * .24, h * .38, 0, w * .17, h * .045, d * .3, i === 1 ? amber : bright);
    finish(secondary);
    const mode = layerInfo.attention === 'swa' ? '局部窗口' : ['dsa', 'csa2'].includes(layerInfo.attention) ? '局部 / 稀疏读取' : '上下文读取';
    note = `${mode}格子为粗粒度教学示意，不代表实际头数、注意力权重或运行记录。`;
  } else if (kind === 'shared') {
    const shared = Math.max(0, Math.floor(Number(cfg.n_shared_experts) || 0));
    if (!shared) {
      group.removeFromParent(); cage.geometry.dispose(); cage.material.dispose(); tray.geometry.dispose(); tray.material.dispose();
      return null;
    }
    const count = Math.min(8, shared);
    main = instances(count, accent); group.add(main);
    for (let i = 0; i < count; i++) cells.push({ x: (i - (count - 1) / 2) * w * .7 / count, y: 0, z: 0, sx: w * .5 / count, sy: h * .55, sz: d * .42 });
    note = `${shared} 个共享专家；内部条带为计算分组示意。`;
    group.userData = { totalShared: shared, displayShared: count };
  } else {
    const rows = kind === 'state' ? 4 : 5, cols = 5;
    main = instances(rows * cols, accent); group.add(main);
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) cells.push({
      x: (col / (cols - 1) - .5) * w * .7, y: (row / (rows - 1) - .5) * h * .57,
      z: ((row % 2) - .5) * d * .15, sx: w * .115, sy: h * .07, sz: d * .38, row, col
    });
    secondary = instances(2, accent); group.add(secondary);
    for (let i = 0; i < 2; i++) cell(secondary, i, (i ? 1 : -1) * w * .38, 0, d * .05, w * .035, h * .7, d * .1, i ? bright : amber);
    finish(secondary);
    note = kind === 'state' ? '递推状态切片示意；不绘制逐 Token KV 表，也不表示物理存储 bank。'
      : `${nodeId === 'csa_cache' ? `跨层缓存 · ${layerInfo.indexer ?? '共享'}；` : ''}存储槽为分组示意，真实维度与容量见参数面板。`;
  }
  group.userData.kind = kind;
  group.userData.note = note;

  function update({ openness = 0, time = 0, activeExperts = [], dim = 1 } = {}) {
    const open = clamp(openness);
    const visibility = clamp(dim);
    const clock = Number.isFinite(time) ? time : 0;
    group.visible = open > .001;
    group.scale.y = .25 + .75 * open;
    for (const item of shellMaterials) {
      const transparent = open > 0 || visibility < 1 || item.transparent;
      if (item.material.transparent !== transparent) { item.material.transparent = transparent; item.material.needsUpdate = true; }
      item.material.opacity = item.opacity * (1 - open * .94) * visibility;
      item.material.depthWrite = open > .1 || visibility < .5 ? false : item.depthWrite;
    }
    if (!group.visible) return;
    for (const object of [main, secondary, cage, tray, routeLines]) if (object) object.material.opacity = open * visibility * (object === tray ? .9 : object === cage ? .78 : 1);

    if (kind === 'router') {
      const { totalRouted, displayRouted, totalShared, displayShared, topK } = group.userData;
      const active = [...new Set(activeExperts.filter(i => Number.isInteger(i) && i >= 0 && i < totalRouted))].slice(0, topK);
      // If the host has not supplied a route, show a deterministic teaching selection.
      for (let i = 0; active.length < Math.min(topK, displayRouted) && i < totalRouted; i++) {
        const id = i;
        if (!active.includes(id)) active.push(id);
      }
      const sample = active.slice(0, displayRouted);
      for (let i = 0; sample.length < displayRouted && i < totalRouted; i++) {
        const id = Math.floor(i * totalRouted / Math.max(1, displayRouted));
        if (!sample.includes(id)) sample.push(id);
      }
      for (let i = 0; sample.length < displayRouted && i < totalRouted; i++) if (!sample.includes(i)) sample.push(i);
      group.userData.sampleIds = sample;
      const segments = routeLines.geometry.attributes.position.array;
      segments.fill(0); let segment = 0;
      for (let i = 0; i < displayRouted + displayShared; i++) {
        const shared = i >= displayRouted, row = Math.floor(i / 6), col = i % 6;
        const x = (col - 2.5) * w * .13, y = h * .08 - row * h * .12;
        const selected = shared || active.includes(sample[i]);
        cell(main, i, x, y, 0, w * .085, h * .075, d * (selected ? .3 : .15), shared ? amber : selected ? bright : idle);
        if (selected) { segments.set([0, h * .27, 0, x, y, d * .12], segment * 6); segment++; }
      }
      routeLines.geometry.setDrawRange(0, segment * 2); routeLines.geometry.attributes.position.needsUpdate = true;
      group.userData.visibleActive = sample.filter(id => active.includes(id)).length;
      group.userData.activeTotal = topK;
      group.userData.totalShared = totalShared;
    } else {
      const cursor = Math.floor(clock * .8) % Math.max(1, cells.length);
      cells.forEach((p, i) => {
        const accessible = kind !== 'attention' || (layerInfo.attention === 'swa' ? p.col >= p.row - 1 && p.col <= p.row + 2
          : ['csa2', 'dsa'].includes(layerInfo.attention) ? ((p.col * 3 + p.row) % 5 === 0 || Math.abs(p.col - p.row) < 2) : p.col <= p.row + 2);
        const highlighted = accessible && (i === cursor || Math.abs(i - cursor) === 1);
        const color = highlighted ? amber : accessible ? accent : idle;
        cell(main, i, p.x, p.y, p.z, p.sx, p.sy, p.sz * (highlighted ? 1.2 : 1), color);
      });
    }
    finish(main);
  }
  update();
  return { update, group, kind, note, shellMaterials };
}
