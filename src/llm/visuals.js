import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeLlmObject } from './resources.js';

const DARK_METAL = new THREE.Color(0x101b2c);
const STEEL = new THREE.Color(0x66849e);

function coloredBox(w, h, d, x, y, z, color) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function lineBuilder() {
  const positions = [], colors = [];
  return {
    add(a, b, color) {
      positions.push(...a, ...b);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    },
    geometry() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      return geometry;
    }
  };
}

/** A directly raycastable body with three draw calls, including its surface detail. */
export function createTechBlock(w, h, d, colorHex, opacity = 0.88) {
  const accent = new THREE.Color(colorHex);
  const radius = Math.min(w, h, d) * 0.075;
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, d, 2, radius),
    new THREE.MeshPhysicalMaterial({
      color: accent.clone().lerp(DARK_METAL, 0.48),
      emissive: accent,
      emissiveIntensity: 0.075 + Math.max(0, Math.min(1, opacity)) * 0.055,
      metalness: 0.46,
      roughness: 0.32,
      clearcoat: 0.65,
      clearcoatRoughness: 0.24,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    })
  );
  body.name = 'compute-module';

  // A dark silicon inlay, colored perimeter, and input/output contacts share one draw.
  // Keep adornments within the advertised box bounds so focus and labels stay aligned.
  const surface = [];
  const top = h / 2;
  const front = d / 2;
  const rim = Math.min(w, h, d) * 0.022;
  const panelColor = accent.clone().multiplyScalar(0.12).add(new THREE.Color(0x07111d));
  const contactColor = accent.clone().multiplyScalar(1.75);
  surface.push(coloredBox(w * 0.68, rim, d * 0.66, 0, top - rim * 0.5, 0, panelColor));
  surface.push(coloredBox(w * 0.76, Math.min(h * 0.055, 0.1), rim, 0, h * 0.23, front - rim * 0.5, contactColor));
  surface.push(coloredBox(rim, h * 0.54, d * 0.06, w / 2 - rim * 0.5, 0, d * 0.23, contactColor.clone().multiplyScalar(0.65)));
  const portCount = Math.max(3, Math.min(6, Math.round(w * 1.2)));
  for (let i = 0; i < portCount; i++) {
    const x = (i / (portCount - 1) - 0.5) * w * 0.62;
    surface.push(coloredBox(w * 0.045, h * 0.08, rim, x, -h * 0.22, front - rim * 0.5, contactColor));
  }
  const detailGeometry = mergeGeometries(surface);
  surface.forEach(geometry => geometry.dispose());
  const details = new THREE.Mesh(detailGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  details.name = 'silicon-and-ports';
  body.add(details);

  // Thin etched traces and chassis corner marks use actual geometry, without textures.
  const lines = lineBuilder();
  const lineColor = accent.clone().lerp(STEEL, 0.55).multiplyScalar(0.72);
  const traceColor = accent.clone().multiplyScalar(0.58);
  const x = w / 2, y = h / 2, z = d / 2;
  const inset = radius * 1.25;
  const cut = Math.min(w, h, d) * 0.16;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const corner = [sx * (x - inset), sy * y, sz * (z - inset)];
    lines.add(corner, [corner[0] - sx * cut, corner[1], corner[2]], lineColor);
    lines.add(corner, [corner[0], corner[1], corner[2] - sz * cut], lineColor);
    const faceCorner = [sx * (x - inset), sy * (y - inset), sz * z];
    lines.add(faceCorner, [faceCorner[0] - sx * cut, faceCorner[1], faceCorner[2]], lineColor);
    lines.add(faceCorner, [faceCorner[0], faceCorner[1] - sy * cut, faceCorner[2]], lineColor);
  }
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const p = (i - 1) * d * 0.15;
      lines.add([sign * w * 0.12, top, p], [sign * w * 0.25, top, p], traceColor);
      lines.add([sign * w * 0.25, top, p], [sign * w * 0.30, top, p + sign * d * 0.035], traceColor);
    }
  }
  const etching = new THREE.LineSegments(lines.geometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72 }));
  etching.name = 'chassis-etching';
  body.add(etching);
  return body;
}

function addArc(lines, radius, start, end, color, segments = 80, y = 0) {
  for (let i = 0; i < segments; i++) {
    const a = start + (end - start) * i / segments;
    const b = start + (end - start) * (i + 1) / segments;
    lines.add([Math.cos(a) * radius, y, Math.sin(a) * radius], [Math.cos(b) * radius, y, Math.sin(b) * radius], color);
  }
}

/** Role markings are interface schematics, rather than a physical semiconductor layout. */
export function styleTechComponent(mesh, nodeId) {
  if (mesh?.name !== 'compute-module' || !mesh.geometry) return mesh;
  const memory = ['mla_kv_latent', 'csa_cache', 'kda_state'].includes(nodeId);
  if (!memory && nodeId !== 'attn_core' && nodeId !== 'moe_router') return mesh;
  if (mesh.children.some(child => child.name === 'component-role-markings')) return mesh;
  mesh.geometry.computeBoundingBox();
  const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
  const w = size.x, h = size.y, d = size.z;
  const top = h / 2, front = d / 2;
  const accent = (mesh.material.emissive ?? new THREE.Color(0x58bde7)).clone();
  const bright = accent.clone().lerp(new THREE.Color(0xd7f0ff), 0.2).multiplyScalar(1.08);
  const quiet = accent.clone().multiplyScalar(0.68);
  const lines = lineBuilder();

  if (memory) {
    // Four bounded strata identify storage at a glance without implying bank counts.
    for (let row = 0; row < 4; row++) {
      const y = (row - 1.5) * h * 0.085;
      lines.add([-w * 0.34, y, front], [-w * 0.035, y, front], row % 2 ? quiet : bright);
      lines.add([w * 0.035, y, front], [w * 0.34, y, front], row % 2 ? bright : quiet);
      lines.add([w / 2, y, -d * 0.31], [w / 2, y, d * 0.31], quiet);
    }
    lines.add([-w * 0.39, -h * 0.17, front], [-w * 0.39, h * 0.17, front], bright);
    for (let row = 0; row < 3; row++) {
      const z = (row - 1) * d * 0.16;
      lines.add([-w * 0.25, top, z], [w * 0.25, top, z], quiet);
      lines.add([-w * 0.25, top, z], [-w * 0.25, top, z + d * 0.04], bright);
      lines.add([w * 0.25, top, z], [w * 0.25, top, z - d * 0.04], bright);
    }
  } else if (nodeId === 'attn_core') {
    const radius = Math.min(w, d) * 0.245;
    for (let quadrant = 0; quadrant < 4; quadrant++) {
      const angle = quadrant * Math.PI / 2;
      addArc(lines, radius, angle + 0.12, angle + Math.PI / 2 - 0.12, bright, 12, top);
      addArc(lines, radius * 0.68, angle + 0.3, angle + Math.PI / 2 - 0.1, quiet, 8, top);
    }
    for (let tick = 0; tick < 12; tick++) {
      const angle = tick * Math.PI / 6;
      lines.add([Math.cos(angle) * radius * 1.09, top, Math.sin(angle) * radius * 1.09], [Math.cos(angle) * radius * 1.2, top, Math.sin(angle) * radius * 1.2], tick % 3 ? quiet : bright);
    }
    const center = radius * 0.22;
    lines.add([-center, top, 0], [center, top, 0], bright);
    lines.add([0, top, -center], [0, top, center], bright);
  } else {
    // Fan-out traces are a visual role cue; dynamic routing remains in the main scene.
    lines.add([0, top, -d * 0.28], [0, top, -d * 0.06], bright);
    for (let branch = -2; branch <= 2; branch++) {
      const x = branch * w * 0.12;
      lines.add([0, top, -d * 0.06], [x, top, d * 0.08], quiet);
      lines.add([x, top, d * 0.08], [x, top, d * 0.27], bright);
      lines.add([x - w * 0.025, top, d * 0.27], [x + w * 0.025, top, d * 0.27], bright);
      lines.add([0, h * 0.12, front], [x, -h * 0.06, front], quiet);
      lines.add([x, -h * 0.06, front], [x, -h * 0.15, front], bright);
    }
  }

  const markings = new THREE.LineSegments(lines.geometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.88, toneMapped: false }));
  markings.name = 'component-role-markings';
  mesh.add(markings);
  return mesh;
}

/** Four lightweight draws: floor etching, broken orbital arcs, one scanner, and dust. */
export function createTechEnvironment({ reducedMotion = false, compact = false } = {}) {
  const group = new THREE.Group();
  group.name = 'precision-observatory';
  const platform = new THREE.Group();
  platform.position.y = -8.05;
  group.add(platform);

  const grid = lineBuilder();
  const faint = new THREE.Color(0x183249);
  const major = new THREE.Color(0x20465d);
  const extent = 34;
  for (let i = -extent; i <= extent; i += compact ? 4 : 2) {
    const reach = Math.sqrt(extent * extent - i * i);
    const color = (i % 8 === 0 ? major : faint).clone().multiplyScalar(1 - Math.abs(i) / extent * 0.7);
    grid.add([-reach, 0, i], [reach, 0, i], color);
    grid.add([i, 0, -reach], [i, 0, reach], color);
  }
  const floor = new THREE.LineSegments(grid.geometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.44, depthWrite: false }));
  platform.add(floor);

  const circuits = lineBuilder();
  const blue = new THREE.Color(0x1f617e), violet = new THREE.Color(0x474174);
  addArc(circuits, 22.4, 0, Math.PI * 2, blue, 144, 0.015);
  for (let segment = 0; segment < 8; segment++) {
    const angle = segment * Math.PI / 4;
    addArc(circuits, 23, angle + 0.02, angle + Math.PI / 4 - 0.13, segment % 2 ? blue : violet, 16, 0.015);
  }
  addArc(circuits, 11, 0.17, Math.PI - 0.17, blue.clone().multiplyScalar(0.65), 64, 0.015);
  addArc(circuits, 11, Math.PI + 0.17, Math.PI * 2 - 0.17, blue.clone().multiplyScalar(0.65), 64, 0.015);
  const ticks = compact ? 48 : 96;
  for (let i = 0; i < ticks; i++) {
    const angle = i / ticks * Math.PI * 2;
    const inner = i % 4 === 0 ? 23.35 : 23.65;
    circuits.add([Math.cos(angle) * inner, 0.015, Math.sin(angle) * inner], [Math.cos(angle) * 23.9, 0.015, Math.sin(angle) * 23.9], i % 4 ? blue : violet);
  }
  const orbital = new THREE.LineSegments(circuits.geometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false }));
  platform.add(orbital);

  const scannerLines = lineBuilder();
  const scannerColor = new THREE.Color(0x42b5d4).multiplyScalar(1.2);
  for (let i = 0; i < 3; i++) addArc(scannerLines, 22.55 + i * 0.045, i * 0.045, Math.PI * 0.23 + i * 0.045, scannerColor, 20, 0.04);
  const scanner = new THREE.LineSegments(scannerLines.geometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  platform.add(scanner);

  let seed = 7349;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const count = compact ? 48 : 120;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2, radius = 17 + random() * 18;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = -5 + random() * 24;
    positions[i * 3 + 2] = Math.sin(angle) * radius * 0.62;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0x6bbed0, size: compact ? 0.04 : 0.035, sizeAttenuation: true, transparent: true, opacity: 0.36, depthWrite: false }));
  dust.name = 'peripheral-dust';
  group.add(dust);

  let motionEnabled = !reducedMotion;
  let previousTime = null;
  let phase = 0;
  let disposed = false;
  return {
    group,
    update(timeSeconds) {
      if (disposed || !Number.isFinite(timeSeconds)) return;
      // Integrate only visible, bounded frame intervals; resuming never jumps forward.
      if (previousTime !== null && motionEnabled) phase += Math.max(0, Math.min(timeSeconds - previousTime, 0.1));
      previousTime = timeSeconds;
      scanner.rotation.y = phase * 0.055;
      dust.rotation.y = phase * 0.006;
    },
    setLod(lod) {
      const tower = Number(lod) === 1;
      platform.scale.set(tower ? 0.67 : 1, 1, tower ? 0.67 : 1);
      floor.material.opacity = tower ? 0.35 : 0.44;
    },
    setMotionEnabled(enabled) { motionEnabled = Boolean(enabled) && !reducedMotion; previousTime = null; },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      disposeLlmObject(group);
    }
  };
}
