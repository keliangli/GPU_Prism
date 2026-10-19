import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSharedScene, createRegistersScene, createWarpScene, applyDeepExperiment } from './deep-scenes.js';
import { colorFor, ROLE_COLORS } from './palette.js';

// An explanatory model, intentionally not a claim about H20's physical floorplan.
const COLORS = {
  board: 0x34465f, boardEdge: 0x18273b, interposer: 0x667a96,
  silicon: 0x202f49, gold: 0xb9a375,
  metal: 0x9caabc, graphite: 0x26364d,
};

const LABEL_CSS = `
.gpu-label-layer{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:3}
.gpu-label-layer .scene-label{position:absolute;left:0;top:0;display:flex;align-items:center;gap:7px;white-space:nowrap;border:1px solid color-mix(in srgb,var(--part-color,#91a4bf) 36%,transparent);border-radius:3px;background:rgba(16,25,42,.88);color:#d7e2f2;padding:6px 9px;font:500 9px/1.25 'JetBrains Mono','SFMono-Regular',Consolas,monospace;letter-spacing:1.05px;pointer-events:auto;cursor:pointer;backdrop-filter:blur(8px);transition:color .18s,border-color .18s,background .18s;box-shadow:0 2px 14px #0002}
.gpu-label-layer .scene-label::before{content:'';width:5px;height:5px;background:var(--part-color,#91a4bf);border-radius:50%;box-shadow:0 0 8px color-mix(in srgb,var(--part-color,#91a4bf) 55%,transparent)}
.gpu-label-layer .scene-label::after{content:'+';margin-left:5px;color:var(--part-color,#91a4bf);font-size:12px;font-weight:400}
.gpu-label-layer .scene-label:hover,.gpu-label-layer .scene-label.is-selected{color:#f1f6ff;border-color:var(--part-color,#91a4bf);background:color-mix(in srgb,var(--part-color,#91a4bf) 16%,#142039)}
.gpu-webgl-fallback{position:absolute;inset:0;display:grid;place-content:center;text-align:center;color:#bdcce1;font:13px/1.9 sans-serif;padding:30px}.gpu-webgl-fallback strong{font-size:19px;color:#b3cdff;font-weight:500;display:block;margin-bottom:10px}
`;

export class GPUScene {
  constructor(container, { onSelect = () => {}, onHover = () => {} } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.level = 'package';
    this.selected = 'gpu';
    this.exploded = false;
    this.labelsVisible = true;
    this.dataFlow = false;
    this.autoRotate = false;
    this.lastBank = 0;
    this.experiment = { bankCounts: Array(32).fill(0), selectedBank: null, stage: null, activeWarp: 0, registerUsage: 64, residentWarps: 32 };
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.groups = {};
    this.targets = {};
    this.labels = [];
    this.explodeParts = [];
    this.flowDots = [];
    this.flowGroups = [];
    this.materials = new Set();
    this.geometries = new Set();
    this.disposed = false;
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.tempVector = new THREE.Vector3();
    this.hovered = null;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    this.style = document.createElement('style');
    this.style.textContent = LABEL_CSS;
    container.appendChild(this.style);
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'gpu-label-layer';
    container.appendChild(this.labelLayer);

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (error) {
      this.fallback = document.createElement('div');
      this.fallback.className = 'gpu-webgl-fallback';
      this.fallback.innerHTML = '<div><strong>3D 架构探索</strong>当前浏览器未能启动 WebGL。<br>请开启浏览器硬件加速，或使用支持 WebGL 的浏览器。<br>仍可通过左侧列表浏览 H20 硬件组件。</div>';
      container.appendChild(this.fallback);
      return;
    }

    this.renderer.setClearColor(0x111b2c, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.style.cssText = 'display:block;position:absolute;inset:0;width:100%;height:100%;outline:none;touch-action:none;';
    canvas.setAttribute('aria-label', 'H20 GPU 三维架构模型，可拖动旋转，滚动缩放，点击组件查看详情');
    canvas.setAttribute('role', 'img');
    container.insertBefore(canvas, this.labelLayer);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-6, 6, 5, -5, .1, 100);
    this.camera.position.set(9, 9.4, 11);
    this.camera.lookAt(0, .35, 0);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, .35, 0);
    this.controls.enableDamping = !this.reducedMotion;
    this.controls.dampingFactor = .07;
    this.controls.enablePan = true;
    this.controls.panSpeed = .55;
    this.controls.minZoom = .65;
    this.controls.maxZoom = 3.4;
    this.controls.minPolarAngle = .15;
    this.controls.maxPolarAngle = Math.PI / 2.08;
    this.controls.autoRotateSpeed = .4;
    this.controls.zoomSpeed = .65;
    this.controls.rotateSpeed = .6;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, .04);
    this.scene.environment = this.environment.texture;
    room.dispose();
    pmrem.dispose();
    this.scene.add(new THREE.AmbientLight(0xf3f6ff, .62));
    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(-5, 10, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: .1, far: 30 });
    key.shadow.bias = -.0008;
    key.shadow.normalBias = .035;
    key.shadow.radius = 5;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xabc7ff, 1.9);
    rim.position.set(4, 5, -7);
    this.scene.add(rim);
    const front = new THREE.DirectionalLight(0xe1edff, .75);
    front.position.set(1, 3, 9);
    this.scene.add(front);

    this.mats = {
      board: this.material(COLORS.board, .4, .53),
      boardEdge: this.material(COLORS.boardEdge, .4, .48),
      interposer: this.material(COLORS.interposer, .48, .46),
      silicon: this.material(COLORS.silicon, .42, .43),
      compute: this.material(ROLE_COLORS.compute, .34, .44, 0x294a99, .06),
      computeDark: this.material(0x385fba, .36, .48),
      computeLight: this.material(0x9dbbff, .32, .43),
      tensor: this.material(ROLE_COLORS.tensor, .32, .46, 0x8e3b2c, .05),
      tensorDark: this.material(0xa54f48, .35, .46),
      memory: this.material(ROLE_COLORS.memory, .34, .44, 0x175a72, .07),
      memoryDark: this.material(0x277b98, .4, .46),
      lsu: this.material(colorFor('lsu'), .34, .44, 0x175a72, .05),
      register: this.material(ROLE_COLORS.registers, .38, .46, 0x805518, .04),
      registerLight: this.material(0xffd89a, .35, .47),
      control: this.material(ROLE_COLORS.control, .34, .46, 0x533382, .05),
      interconnect: this.material(ROLE_COLORS.interconnect, .35, .45, 0x743e81, .05),
      transfer: this.material(ROLE_COLORS.transfer, .34, .45, 0x1b685d, .05),
      gold: this.material(COLORS.gold, .65, .4),
      metal: this.material(COLORS.metal, .65, .39),
      graphite: this.material(COLORS.graphite, .42, .5),
      copper: this.material(0xb99581, .6, .44),
      dark: this.material(0x0e1828, .32, .51),
      trace: new THREE.LineBasicMaterial({ color: 0x9caec9, transparent: true, opacity: .42 }),
      etch: new THREE.LineBasicMaterial({ color: 0xc7ddf4, transparent: true, opacity: .4 }),
    };
    this.materials.add(this.mats.trace);
    this.materials.add(this.mats.etch);

    this.createGround();
    this.createPackage();
    this.createDie();
    this.createSM();
    createSharedScene(this);
    createRegistersScene(this);
    createWarpScene(this);
    this.batchStaticGeometry();
    applyDeepExperiment(this, this.experiment);
    this.selectionBox = new THREE.Box3Helper(new THREE.Box3(), colorFor(this.selected));
    this.selectionBox.material.transparent = true;
    this.selectionBox.material.opacity = .55;
    this.selectionBox.material.depthTest = false;
    this.selectionBox.renderOrder = 8;
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);

    this.pointerDown = (event) => { this.downPoint = event.button === 0 ? { x: event.clientX, y: event.clientY } : null; };
    this.pointerUp = (event) => {
      const point = this.downPoint;
      this.downPoint = null;
      if (event.button !== 0 || !point || Math.hypot(event.clientX - point.x, event.clientY - point.y) > 5) return;
      const id = this.pick(event);
      if (id) {
        if (id === 'bank' && Number.isInteger(this.pickedBank)) {
          this.lastBank = this.pickedBank;
          this.targets.shared.bank = this.bankTiles[this.lastBank];
        }
        this.setSelected(id);
        this.onSelect(id);
      }
    };
    this.pointerMove = (event) => {
      const id = this.pick(event);
      canvas.style.cursor = id ? 'pointer' : 'grab';
      if (id !== this.hovered) { this.hovered = id; this.onHover(id); }
    };
    this.pointerLeave = () => { this.hovered = null; this.onHover(null); canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerleave', this.pointerLeave);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.setLevel('package');
    this.resize();
    this.animate();
  }

  material(color, metalness = .4, roughness = .45, emissive = 0x000000, emissiveIntensity = 0) {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity });
    this.materials.add(material);
    return material;
  }

  mesh(geometry, material, parent, x = 0, y = 0, z = 0, id) {
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (id) mesh.userData.id = id;
    parent.add(mesh);
    return mesh;
  }

  box(parent, w, h, d, x, y, z, material, id, radius = .015) {
    const geometry = radius > 0
      ? new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, h / 3, w / 3, d / 3))
      : new THREE.BoxGeometry(w, h, d);
    return this.mesh(geometry, material, parent, x, y, z, id);
  }

  group(parent, id, level, position = [0, 0, 0]) {
    const group = new THREE.Group();
    group.position.set(...position);
    group.userData.id = id;
    parent.add(group);
    if (level) {
      this.targets[level] ??= {};
      this.targets[level][id] ??= group;
    }
    return group;
  }

  line(parent, points, material = this.mats.trace) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point)));
    this.geometries.add(geometry);
    const line = new THREE.Line(geometry, material);
    parent.add(line);
    return line;
  }

  label(level, anchor, id, text, position, offset = [0, 0]) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'scene-label';
    el.style.setProperty('--part-color', colorFor(id));
    el.textContent = text;
    el.setAttribute('aria-label', `查看 ${text} 组件`);
    el.addEventListener('pointerdown', (event) => event.stopPropagation());
    el.addEventListener('click', () => { this.setSelected(id); this.onSelect(id); });
    this.labelLayer.appendChild(el);
    this.labels.push({ level, anchor, id, el, position: new THREE.Vector3(...position), offset });
  }

  explosion(group, height) {
    this.explodeParts.push({ group, base: group.position.y, height });
  }

  createGround() {
    const groundMat = new THREE.ShadowMaterial({ color: 0x020714, opacity: .32 });
    this.materials.add(groundMat);
    const floor = this.mesh(new THREE.PlaneGeometry(200, 200), groundMat, this.scene, 0, -.31, 0);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    const grid = new THREE.GridHelper(26, 40, 0x526c98, 0x33445f);
    grid.position.y = -.305;
    grid.material.transparent = true;
    grid.material.opacity = .12;
    this.scene.add(grid);
    this.groundGrid = grid;
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.7, 5.712, 128), new THREE.MeshBasicMaterial({ color: 0x607aab, transparent: true, opacity: .16, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -.3;
    this.scene.add(ring);
    this.geometries.add(ring.geometry);
    this.materials.add(ring.material);
  }

  createPackage() {
    const root = this.groups.package = this.group(this.scene, 'package');
    const board = this.group(root, 'substrate', 'package');
    this.box(board, 7.3, .1, 6.3, 0, -.16, 0, this.mats.graphite, 'substrate', .08);
    this.box(board, 7.22, .07, 6.22, 0, -.075, 0, this.mats.metal, 'substrate', .07);
    this.box(board, 7.12, .12, 6.12, 0, .015, 0, this.mats.board, 'substrate', .055);
    this.box(board, 6.86, .025, 5.85, 0, .087, 0, this.mats.boardEdge, 'substrate', .035);
    // Distinct circuit board layers around the module's exposed edge.
    for (const y of [-.01, .025, .06]) {
      const edge = this.box(board, 7.125, .008, 6.125, 0, y, 0, this.mats.gold, 'substrate', .035);
      edge.material = this.mats.graphite;
    }
    for (const x of [-3.3, 3.3]) for (const z of [-2.78, 2.78]) {
      this.mesh(new THREE.CylinderGeometry(.148, .148, .03, 24), this.mats.metal, board, x, .097, z, 'substrate');
      this.mesh(new THREE.CylinderGeometry(.103, .103, .034, 24), this.mats.dark, board, x, .116, z, 'substrate');
      this.mesh(new THREE.CylinderGeometry(.073, .073, .04, 6), this.mats.graphite, board, x, .137, z, 'substrate');
      this.box(board, .092, .008, .013, x, .161, z, this.mats.metal, 'substrate', 0);
    }

    // Gold signal routing and surface-mount components.
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 28; i++) {
        const z = -2.45 + i * .18;
        const x0 = side * 2.72;
        const x1 = side * (2.88 + (i % 3) * .08);
        const x2 = side * 3.19;
        this.line(board, [[x0, .106, z], [x1, .106, z], [x1 + side * .1, .106, z + .07], [x2, .106, z + .07]]);
        this.box(board, .1, .07, .055, side * 3.04, .145, z, i % 5 ? this.mats.gold : this.mats.graphite, 'substrate', .007);
      }
      for (let i = 0; i < 19; i++) {
        const x = -2.63 + i * .29;
        for (const z of [-2.6, 2.6]) {
          const chip = this.box(board, .17, .07, .105, x, .13, z + side * .12, this.mats.graphite, 'substrate', .01);
          this.box(board, .025, .075, .106, x - .069, .13, z + side * .12, this.mats.metal, 'substrate', .004);
          this.box(board, .025, .075, .106, x + .069, .13, z + side * .12, this.mats.metal, 'substrate', .004);
          chip.castShadow = false;
        }
      }
    }

    const interposer = this.group(root, 'gpu', 'package', [0, .09, 0]);
    this.box(interposer, 5.55, .095, 4.85, 0, .05, 0, this.mats.gold, 'gpu', .06);
    this.box(interposer, 5.46, .13, 4.76, 0, .135, 0, this.mats.interposer, 'gpu', .045);
    this.box(interposer, 5.31, .025, 4.6, 0, .212, 0, this.mats.graphite, 'gpu', .025);
    // Small, regularly spaced routing contacts highlight the scale of packaging.
    for (let i = 0; i < 42; i++) {
      const x = -2.52 + i * .123;
      for (const z of [-2.31, 2.31]) this.box(interposer, .04, .018, .065, x, .234, z, this.mats.gold, 'gpu', 0);
    }
    this.explosion(interposer, .45);

    const gpu = this.group(interposer, 'gpu', null, [0, .23, 0]);
    this.targets.package.gpu = gpu;
    this.box(gpu, 3.25, .06, 3.94, 0, .035, 0, this.mats.metal, 'gpu', .04);
    this.box(gpu, 3.14, .105, 3.83, 0, .111, 0, this.mats.silicon, 'gpu', .026);
    this.box(gpu, 2.96, .012, 3.65, 0, .17, 0, this.mats.computeDark, 'gpu', .015);
    for (let col = 0; col < 6; col++) for (let row = 0; row < 8; row++) {
      const x = -1.208 + col * .484;
      const z = -1.57 + row * .448;
      this.box(gpu, .432, .035, .386, x, .195, z, (row + col) % 5 === 0 ? this.mats.tensor : this.mats.compute, 'gpu', .009);
      for (let line = 0; line < 4; line++) {
        this.line(gpu, [[x - .175, .215, z - .125 + line * .079], [x + .175, .215, z - .125 + line * .079]], this.mats.etch);
      }
    }
    for (let i = 0; i < 7; i++) {
      this.box(gpu, .026, .01, 3.58, -1.45 + i * .484, .216, 0, this.mats.computeLight, 'gpu', 0);
    }
    this.explosion(gpu, .75);
    this.label('package', gpu, 'gpu', 'HOPPER GPU', [0, .38, -.25], [0, -7]);

    const memories = this.group(interposer, 'hbm', 'package');
    for (const x of [-2.12, 2.12]) for (let i = 0; i < 3; i++) {
      const z = (i - 1) * 1.435;
      const memory = this.group(memories, 'hbm', null, [x, .25, z]);
      this.box(memory, .83, .06, 1.21, 0, 0, 0, this.mats.gold, 'hbm', .025);
      for (let layer = 0; layer < 5; layer++) {
        this.box(memory, .75, .048, 1.105, 0, .057 + layer * .052, 0, layer === 4 ? this.mats.memory : this.mats.memoryDark, 'hbm', .012);
        this.box(memory, .752, .009, 1.11, 0, .083 + layer * .052, 0, this.mats.metal, 'hbm', .008);
      }
      this.box(memory, .67, .018, 1.02, 0, .32, 0, this.mats.memory, 'hbm', .02);
      for (let j = 0; j < 7; j++) this.line(memory, [[-.25, .333, -.37 + j * .12], [.25, .333, -.37 + j * .12]], this.mats.etch);
      this.box(memory, .095, .009, .095, -.22, .335, -.36, this.mats.metal, 'hbm', .006);
    }
    this.explosion(memories, 1.0);
    this.label('package', memories, 'hbm', 'HBM3 MEMORY', [2.11, .66, .18], [21, -2]);

    const nvlink = this.group(root, 'nvlink', 'package', [0, .15, -2.84]);
    this.box(nvlink, 3.18, .16, .29, 0, 0, 0, this.mats.interconnect, 'nvlink', .018);
    for (let i = 0; i < 40; i++) this.box(nvlink, .045, .04, .21, -1.48 + i * .076, .1, -.025, this.mats.gold, 'nvlink', .003);
    this.box(nvlink, 3.25, .035, .048, 0, .13, .12, this.mats.metal, 'nvlink', .004);
    this.label('package', nvlink, 'nvlink', 'NVLINK 4.0', [0, .24, -.12], [10, -25]);

    const pcie = this.group(root, 'pcie', 'package', [0, .06, 3.1]);
    this.box(pcie, 3.6, .085, .29, 0, 0, 0, this.mats.interconnect, 'pcie', .012);
    for (let i = 0; i < 44; i++) {
      if (i === 12 || i === 13) continue;
      this.box(pcie, .051, .018, .285, -1.72 + i * .08, .055, .025, this.mats.gold, 'pcie', .003);
    }
    this.label('package', pcie, 'pcie', 'PCIe 5.0 I/O', [0, .1, .16], [-2, 31]);
    this.label('package', board, 'substrate', 'SXM MODULE', [-2.95, .19, 1.8], [-37, 18]);
    this.addFlow(root, 'package', [new THREE.Vector3(0, .55, 0), new THREE.Vector3(2.1, .67, 0)], 4);
    this.addFlow(root, 'package', [new THREE.Vector3(0, .55, 0), new THREE.Vector3(-2.1, .67, 0)], 4);
    this.addFlow(root, 'package', [new THREE.Vector3(0, .55, -1.7), new THREE.Vector3(0, .34, -2.8)], 3);
  }

  createDie() {
    const root = this.groups.die = this.group(this.scene, 'die');
    const substrate = this.group(root, 'gpu', 'die');
    this.box(substrate, 7.02, .14, 5.55, 0, -.09, 0, this.mats.graphite, 'gpu', .06);
    this.box(substrate, 6.88, .055, 5.4, 0, .015, 0, this.mats.metal, 'gpu', .04);
    this.box(substrate, 6.73, .15, 5.24, 0, .105, 0, this.mats.silicon, 'gpu', .035);
    this.box(substrate, 6.48, .025, 4.98, 0, .192, 0, this.mats.board, 'gpu', .018);
    const gpcs = this.group(root, 'gpc', 'die');
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const x = -2.1 + col * 2.1;
      const z = -.99 + row * 1.98;
      const gpc = this.group(gpcs, 'gpc', null, [x, .24, z]);
      this.box(gpc, 1.88, .075, 1.66, 0, 0, 0, this.mats.interposer, 'gpc', .025);
      this.box(gpc, 1.72, .04, 1.5, 0, .056, 0, this.mats.silicon, 'gpc', .012);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
        const sm = this.group(gpc, 'sm', null, [-.64 + i * .426, .1, -.38 + j * .75]);
        this.targets.die.sm ??= sm;
        this.box(sm, .36, .1, .6, 0, 0, 0, this.mats.compute, 'sm', .015);
        this.box(sm, .13, .015, .48, -.075, .06, 0, this.mats.tensor, 'sm', .005);
        for (let k = 0; k < 5; k++) this.box(sm, .13, .012, .04, .09, .06, -.21 + k * .1, this.mats.register, 'sm', 0);
      }
      this.box(gpc, 1.52, .02, .065, 0, .12, .708, this.mats.gold, 'gpc', .006);
    }
    this.explosion(gpcs, .9);
    const l2 = this.group(root, 'l2', 'die', [0, .28, 0]);
    this.box(l2, 6.3, .12, .27, 0, 0, 0, this.mats.register, 'l2', .02);
    for (let i = 0; i < 36; i++) this.box(l2, .012, .015, .19, -3 + i * .171, .07, 0, this.mats.silicon, 'l2', 0);
    this.explosion(l2, .48);
    const memory = this.group(root, 'hbm', 'die');
    for (const z of [-2.25, 2.25]) {
      for (let i = 0; i < 12; i++) {
        const x = -2.8 + i * .51;
        this.box(memory, .43, .12, .28, x, .28, z, this.mats.memory, 'hbm', .008);
        for (let j = 0; j < 3; j++) this.box(memory, .31, .013, .026, x, .348, z - .07 + j * .07, this.mats.metal, 'hbm', 0);
      }
    }
    this.label('die', gpcs, 'gpc', 'GRAPHICS PROCESSING CLUSTER', [-2.1, .64, -.99], [-5, -18]);
    this.label('die', this.targets.die.sm, 'sm', 'STREAMING MULTIPROCESSOR', [0, .2, 0], [-48, 62]);
    this.label('die', l2, 'l2', 'L2 CACHE', [1.6, .18, 0], [33, -12]);
    this.label('die', memory, 'hbm', 'HBM INTERFACE', [1.5, .48, 2.25], [6, 29]);
    this.addFlow(root, 'die', [new THREE.Vector3(-2.8, .57, 0), new THREE.Vector3(2.8, .57, 0)], 9);
  }

  createSM() {
    const root = this.groups.sm = this.group(this.scene, 'sm');
    const base = this.group(root, 'sm', 'sm');
    this.box(base, 6.8, .12, 5.5, 0, -.09, 0, this.mats.graphite, 'sm', .055);
    this.box(base, 6.65, .045, 5.35, 0, 0, 0, this.mats.metal, 'sm', .035);
    this.box(base, 6.5, .13, 5.2, 0, .09, 0, this.mats.silicon, 'sm', .025);
    this.box(base, 6.24, .025, 4.94, 0, .17, 0, this.mats.board, 'sm', .015);
    const cuda = this.group(root, 'cuda', 'sm');
    const tensor = this.group(root, 'tensor', 'sm');
    const scheduler = this.group(root, 'scheduler', 'sm');
    const registers = this.group(root, 'registers', 'sm');
    const shared = this.group(root, 'shared', 'sm');
    const lsu = this.group(root, 'lsu', 'sm');
    const tma = this.group(root, 'tma', 'sm', [2.7, .3, 2.13]);
    const barrier = this.group(root, 'barrier', 'sm', [-2.78, .3, 2.13]);
    for (let partition = 0; partition < 4; partition++) {
      const x = -2.3 + partition * 1.53;
      this.box(base, 1.39, .04, 3.98, x, .212, -.25, this.mats.interposer, 'sm', .018);
      this.box(scheduler, 1.23, .15, .36, x, .32, -2.03, this.mats.control, 'scheduler', .018);
      for (let i = 0; i < 8; i++) this.box(scheduler, .09, .012, .23, x - .49 + i * .14, .4, -2.03, this.mats.metal, 'scheduler', .004);
      this.box(registers, 1.23, .12, .76, x, .31, -1.35, this.mats.graphite, 'registers', .015);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) {
        this.box(registers, .106, .033, .16, x - .49 + col * .14, .387, -1.58 + row * .225, (row + col) % 3 ? this.mats.register : this.mats.registerLight, 'registers', .004);
      }
      for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) {
        this.box(cuda, .232, .12, .25, x - .432 + col * .288, .31, -.67 + row * .33, (row + col) % 4 === 0 ? this.mats.computeLight : this.mats.compute, 'cuda', .01);
        this.box(cuda, .16, .01, .018, x - .432 + col * .288, .377, -.67 + row * .33, this.mats.metal, 'cuda', 0);
      }
      const core = this.group(tensor, 'tensor', null, [x, .34, .9]);
      this.box(core, 1.2, .18, .62, 0, 0, 0, this.mats.tensor, 'tensor', .018);
      this.box(core, .96, .015, .44, 0, .099, 0, this.mats.tensorDark, 'tensor', .01);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) this.box(core, .17, .017, .16, -.32 + i * .215, .115, -.1 + j * .2, this.mats.tensor, 'tensor', .003);
      this.box(lsu, 1.2, .1, .34, x, .31, 1.5, this.mats.lsu, 'lsu', .012);
      for (let i = 0; i < 8; i++) this.box(lsu, .09, .017, .23, x - .49 + i * .14, .37, 1.5, this.mats.metal, 'lsu', .003);
      this.line(base, [[x, .232, -1.8], [x, .232, 1.9]], this.mats.etch);
    }
    this.box(shared, 4.78, .15, .46, -.04, .3, 2.13, this.mats.memory, 'shared', .018);
    for (let i = 0; i < 40; i++) this.box(shared, .015, .016, .34, -2.3 + i * .116, .384, 2.13, this.mats.silicon, 'shared', 0);
    this.box(tma, .58, .19, .58, 0, 0, 0, this.mats.transfer, 'tma', .018);
    for (let i = 0; i < 3; i++) this.box(tma, .36, .018, .055, 0, .106, -.14 + i * .14, this.mats.graphite, 'tma', .003);
    this.box(barrier, .48, .17, .58, 0, 0, 0, this.mats.interconnect, 'barrier', .018);
    for (let i = 0; i < 3; i++) this.box(barrier, .05, .018, .36, -.12 + i * .12, .096, 0, this.mats.graphite, 'barrier', .003);
    this.explosion(cuda, .65);
    this.explosion(tensor, 1.1);
    this.explosion(scheduler, .4);
    this.explosion(registers, .8);
    this.explosion(shared, .25);
    this.explosion(lsu, .45);
    this.explosion(tma, .6);
    this.explosion(barrier, .45);
    this.label('sm', cuda, 'cuda', 'CUDA CORES', [-1.5, .54, -.2], [-24, -3]);
    this.label('sm', tensor, 'tensor', 'TENSOR CORES', [2.3, .55, .9], [41, 10]);
    this.label('sm', scheduler, 'scheduler', 'SCHEDULERS ×4', [1.53, .49, -2.03], [38, -27]);
    this.label('sm', registers, 'registers', 'REGISTER FILES', [-1.5, .51, -1.35], [-35, -32]);
    this.label('sm', shared, 'shared', 'SHARED / L1', [-.5, .47, 2.13], [1, 42]);
    this.label('sm', lsu, 'lsu', 'LSU', [-1.5, .45, 1.5], [-42, 9]);
    this.label('sm', tma, 'tma', 'TMA', [0, .27, 0], [28, 30]);
    this.label('sm', barrier, 'barrier', 'BARRIER', [0, .25, 0], [-53, 23]);
    for (let i = 0; i < 4; i++) this.addFlow(root, 'sm', [new THREE.Vector3(-2.3 + i * 1.53, .6, -1.9), new THREE.Vector3(-2.3 + i * 1.53, .6, 2.1)], 4);
  }

  addFlow(parent, level, points, count) {
    const group = new THREE.Group();
    group.userData.dynamic = true;
    group.visible = false;
    parent.add(group);
    this.flowGroups.push({ group, level });
    const material = new THREE.LineBasicMaterial({ color: 0x9bdce9, transparent: true, opacity: .36 });
    this.materials.add(material);
    this.line(group, points.map(p => p.toArray()), material);
    const curve = new THREE.LineCurve3(points[0], points[points.length - 1]);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xe7faff });
    this.materials.add(dotMaterial);
    for (let i = 0; i < count; i++) {
      const dot = this.mesh(new THREE.SphereGeometry(.034, 8, 6), dotMaterial, group);
      dot.castShadow = false;
      dot.receiveShadow = false;
      this.flowDots.push({ dot, level, curve, phase: i / count });
    }
  }

  batchStaticGeometry() {
    // Keep raycast ids and independently movable layers while cutting draw calls.
    for (const root of Object.values(this.groups)) root.traverse(parent => {
      if (parent.userData.dynamic || !parent.isGroup) return;
      const batches = new Map();
      for (const child of parent.children) {
        if (!child.isMesh || child.isInstancedMesh || Array.isArray(child.material)) continue;
        const key = `${child.material.uuid}:${child.userData.id || ''}`;
        if (!batches.has(key)) batches.set(key, []);
        batches.get(key).push(child);
      }
      for (const children of batches.values()) {
        if (children.length < 3) continue;
        const geometries = children.map(child => {
          child.updateMatrix();
          const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
          return geometry.applyMatrix4(child.matrix);
        });
        const merged = mergeGeometries(geometries, false);
        geometries.forEach(geometry => geometry.dispose());
        if (!merged) continue;
        const mesh = this.mesh(merged, children[0].material, parent, 0, 0, 0, children[0].userData.id);
        mesh.castShadow = children.some(child => child.castShadow);
        for (const child of children) parent.remove(child);
      }
      const lineBatches = new Map();
      for (const child of parent.children) {
        if (!child.isLine || child.isLineSegments) continue;
        const key = child.material.uuid;
        if (!lineBatches.has(key)) lineBatches.set(key, []);
        lineBatches.get(key).push(child);
      }
      for (const children of lineBatches.values()) {
        if (children.length < 3) continue;
        const positions = [];
        for (const child of children) {
          child.updateMatrix();
          const points = child.geometry.getAttribute('position');
          for (let i = 0; i < points.count - 1; i++) {
            for (const index of [i, i + 1]) {
              const point = new THREE.Vector3().fromBufferAttribute(points, index).applyMatrix4(child.matrix);
              positions.push(point.x, point.y, point.z);
            }
          }
          parent.remove(child);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.geometries.add(geometry);
        parent.add(new THREE.LineSegments(geometry, children[0].material));
      }
    });
  }

  pick(event) {
    if (!this.renderer || !this.groups[this.level]) return null;
    this.pickedBank = null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersections = this.raycaster.intersectObject(this.groups[this.level], true);
    for (const intersection of intersections) {
      let obj = intersection.object;
      if (!(obj instanceof THREE.Mesh)) continue;
      let bankNode = obj;
      while (bankNode && bankNode !== this.scene) {
        if (Number.isInteger(bankNode.userData.bank)) { this.pickedBank = bankNode.userData.bank; break; }
        bankNode = bankNode.parent;
      }
      while (obj && obj !== this.scene) {
        if (obj === this.groups[this.level]) break;
        if (obj.userData.id && obj.userData.id !== 'package' && obj.userData.id !== 'die') return obj.userData.id;
        obj = obj.parent;
      }
    }
    return null;
  }

  setLevel(level) {
    if (!['package', 'die', 'sm', 'shared', 'registers', 'warp'].includes(level)) return;
    this.level = level;
    if (!this.renderer) return;
    for (const [name, group] of Object.entries(this.groups)) group.visible = name === level;
    this.setSelected(({ package: 'gpu', die: 'gpc', sm: 'tensor', shared: 'banks', registers: 'registerFile', warp: 'scheduler' })[level]);
    this.updateLabels();
  }

  setSelected(id) {
    this.selected = id;
    for (const label of this.labels) label.el.classList.toggle('is-selected', label.id === id);
    if (this.selectionBox) {
      this.selectionBox.visible = id !== 'gpu' && !!this.targets[this.level]?.[id];
      this.selectionBox.material.color.set(colorFor(id));
    }
  }

  setExploded(value) { this.exploded = !!value; }
  setLabels(value) { this.labelsVisible = !!value; this.updateLabels(); }
  setAutoRotate(value) {
    this.autoRotate = !!value;
    if (this.controls) this.controls.autoRotate = this.autoRotate && !this.reducedMotion;
  }
  setDataFlow(value) { this.dataFlow = !!value; }

  setExperiment(data = {}) {
    this.experiment = { ...this.experiment, ...data };
    if (!this.renderer) return;
    applyDeepExperiment(this, this.experiment);
  }

  setView(view = 'iso') {
    if (!this.camera) return;
    const positions = { iso: [9, 9.4, 11], top: [.001, 15, .001], front: [0, 7.5, 14] };
    this.camera.position.set(...(positions[view] || positions.iso));
    this.controls.target.set(0, .35, 0);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.updateLabels();
  }

  reset() {
    if (!this.camera) return;
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.setView('iso');
  }

  zoom(amount = 1) {
    if (!this.camera) return;
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * (amount > 0 ? 1.16 : 1 / 1.16), .65, 3.4);
    this.camera.updateProjectionMatrix();
  }

  resize() {
    if (!this.renderer || this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    const vertical = Math.max(8.55, 10.9 / aspect);
    this.camera.left = -vertical * aspect / 2;
    this.camera.right = vertical * aspect / 2;
    this.camera.top = vertical / 2;
    this.camera.bottom = -vertical / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.updateLabels();
  }

  updateLabels() {
    if (!this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.scene.updateMatrixWorld();
    const occupied = [];
    const safeTop = Math.min(110, height * .23);
    const safeBottom = Math.max(safeTop + 30, height - 55);
    const intersects = (a, b) => a.left < b.right + 5 && a.right > b.left - 5 && a.top < b.bottom + 5 && a.bottom > b.top - 5;
    for (const label of this.labels) {
      const visible = label.level === this.level && this.labelsVisible;
      label.el.style.display = visible ? 'flex' : 'none';
      if (!visible) continue;
      this.tempVector.copy(label.position);
      label.anchor.localToWorld(this.tempVector);
      this.tempVector.project(this.camera);
      const x = (this.tempVector.x * .5 + .5) * width + label.offset[0];
      const y = (-this.tempVector.y * .5 + .5) * height + label.offset[1];
      const boxWidth = label.el.offsetWidth;
      const boxHeight = label.el.offsetHeight || 26;
      const clampedX = THREE.MathUtils.clamp(x, boxWidth / 2 + 8, Math.max(boxWidth / 2 + 8, width - boxWidth / 2 - 8));
      const clampedY = THREE.MathUtils.clamp(y, safeTop + boxHeight / 2, safeBottom - boxHeight / 2);
      let best;
      // Stable alternatives retain each component's anchor, even on narrow screens.
      for (let step = 0; step <= 10; step++) for (const sign of step ? [-1, 1] : [0]) for (const dx of [0, -24, 24, -48, 48]) {
        const centerX = THREE.MathUtils.clamp(clampedX + dx, boxWidth / 2 + 8, Math.max(boxWidth / 2 + 8, width - boxWidth / 2 - 8));
        const centerY = THREE.MathUtils.clamp(clampedY + sign * step * 22, safeTop + boxHeight / 2, safeBottom - boxHeight / 2);
        const rect = { left: centerX - boxWidth / 2, right: centerX + boxWidth / 2, top: centerY - boxHeight / 2, bottom: centerY + boxHeight / 2 };
        const collisions = occupied.filter(other => intersects(rect, other)).length;
        const score = collisions * 100000 + (centerX - clampedX) ** 2 * 1.4 + (centerY - clampedY) ** 2;
        if (!best || score < best.score) best = { ...rect, centerX, centerY, score };
      }
      occupied.push(best);
      label.el.style.transform = `translate(${best.centerX}px,${best.centerY}px) translate(-50%,-50%)`;
      label.el.style.opacity = this.tempVector.z > 1 || this.tempVector.z < -1 ? '0' : '1';
    }
  }

  animate() {
    if (this.disposed || !this.renderer) return;
    this.animationFrame = requestAnimationFrame(() => this.animate());
    const delta = Math.min(this.clock.getDelta(), .05);
    this.elapsed = (this.elapsed || 0) + delta;
    for (const part of this.explodeParts) {
      const target = part.base + (this.exploded ? part.height : 0);
      part.group.position.y = this.reducedMotion ? target : THREE.MathUtils.damp(part.group.position.y, target, 7, delta);
    }
    for (const flow of this.flowGroups) flow.group.visible = this.dataFlow && flow.level === this.level;
    if (this.dataFlow) for (const flow of this.flowDots) {
      if (flow.level !== this.level) continue;
      flow.curve.getPointAt((flow.phase + (this.reducedMotion ? 0 : this.elapsed * .18)) % 1, flow.dot.position);
    }
    this.controls.update();
    const target = this.targets[this.level]?.[this.selected];
    if (target && this.selectionBox.visible) {
      this.selectionBox.box.setFromObject(target);
      this.selectionBox.box.expandByScalar(.07);
    }
    this.updateLabels();
    this.renderer.render(this.scene, this.camera);
  }

  getCanvas() { return this.renderer?.domElement || null; }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    const canvas = this.renderer?.domElement;
    if (canvas) {
      canvas.removeEventListener('pointerdown', this.pointerDown);
      canvas.removeEventListener('pointerup', this.pointerUp);
      canvas.removeEventListener('pointermove', this.pointerMove);
      canvas.removeEventListener('pointerleave', this.pointerLeave);
      canvas.remove();
    }
    this.scene?.traverse((object) => {
      if (object.geometry) this.geometries.add(object.geometry);
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => this.materials.add(material));
    });
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.deepTextures || []) texture.dispose();
    this.environment?.dispose();
    this.renderer?.dispose();
    this.labelLayer.remove();
    this.style.remove();
    this.fallback?.remove();
  }
}
