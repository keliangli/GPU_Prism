import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CodeScene } from '../../src/code-atlas/scene.js';
import { buildIndex, FILE_FOOTPRINT, layoutDistricts } from '../../src/code-atlas/derive.js';

test('building materials preserve instance colors in every district', () => {
  const graph = { districts: [{ id: 'a', loc: 10, files: ['a/f.py'] }], files: [{ id: 'a/f.py', district: 'a', loc: 10, fanIn: 0 }], imports: [], packageEdges: [] };
  const scene = Object.assign(Object.create(CodeScene.prototype), {
    scene: new THREE.Scene(), materials: new Set(), geometries: new Set(), districtMeshes: new Map(),
    fileWorld: new Map(), districtWorld: new Map(), pickSlabs: [], buildingGeometry: new THREE.BoxGeometry(),
    slabGeometry: new THREE.BoxGeometry(), slabMaterial: new THREE.MeshBasicMaterial(),
    plotOutlineMaterial: new THREE.LineBasicMaterial(), addDistrictLabel() {}, frameAll() {}, colorMode: 'district'
  });
  scene.build(buildIndex(graph));
  assert.equal(scene.districtMeshes.get('a').material.color.getHexString(), 'ffffff');
});

test('symbol call lines route outside the opaque floors', () => {
  const symbols = [{ id: 'f#a', name: 'a', start: 1, calls: ['b'] }, { id: 'f#b', name: 'b', start: 5, calls: [] }];
  const scene = Object.assign(Object.create(CodeScene.prototype), {
    symbolLineGroup: new THREE.Group(), selection: { kind: 'symbol', id: 'f#a' },
    fileWorld: new Map([['f.py', { x: 0, z: 0 }]]),
    index: { filesById: new Map([['f.py', { symbols }]]) },
    interior: { fileId: 'f.py', byId: new Map([['f#a', { y0: 0, y1: 1 }], ['f#b', { y0: 2, y1: 3 }]]) },
    outLineMaterial: new THREE.LineBasicMaterial(), inLineMaterial: new THREE.LineBasicMaterial()
  });
  scene.rebuildSymbolLines();
  assert.equal(scene.symbolLineGroup.children.length, 1);
  const positions = scene.symbolLineGroup.children[0].geometry.getAttribute('position');
  assert.equal(positions.count, 6);
  for (let i = 0; i < positions.count; i++) {
    assert.ok(Math.abs(positions.getX(i)) > FILE_FOOTPRINT * .44 || Math.abs(positions.getZ(i)) > FILE_FOOTPRINT * .44);
  }
});

test('offscreen labels are hidden instead of clamped to the viewport edge', () => {
  const label = (id, x) => ({ id, position: new THREE.Vector3(x, 0, 0), el: { style: {}, offsetWidth: 60, offsetHeight: 24 } });
  const visible = label('visible', 0), offscreen = label('offscreen', 100);
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 600);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  const scene = Object.assign(Object.create(CodeScene.prototype), {
    index: {}, container: { clientWidth: 600, clientHeight: 600 }, labelsVisible: true,
    districtLabels: [visible, offscreen], fileLabels: [], symbolLabels: [], scene: new THREE.Scene(), camera
  });
  scene.updateLabels(false);
  assert.equal(visible.el.style.display, 'flex');
  assert.equal(offscreen.el.style.display, 'none');
});

test('empty graph framing produces a finite projection', () => {
  const scene = Object.assign(Object.create(CodeScene.prototype), {
    layout: layoutDistricts([], new Map()), camera: new THREE.OrthographicCamera(),
    controls: { target: new THREE.Vector3(), update() {} }, container: { clientWidth: 600, clientHeight: 600 }, updateLabels() {}
  });
  scene.frameAll();
  assert.ok(scene.camera.position.toArray().every(Number.isFinite));
  assert.ok(scene.camera.projectionMatrix.elements.every(Number.isFinite));
});

test('an unchanged scene does not schedule another render', () => {
  let renders = 0, requests = 0;
  const scene = Object.assign(Object.create(CodeScene.prototype), {
    controls: { update() {} }, updateLabels() {}, renderer: { render() { renders++; } },
    requestRender() { requests++; }
  });
  scene.renderFrame();
  assert.equal(renders, 1);
  assert.equal(requests, 0);
});

test('interior isolation restores neighboring buildings and depth state on exit', () => {
  const active = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const scene = Object.assign(Object.create(CodeScene.prototype), { districtMeshes: new Map([['active', active], ['other', other]]), dimmedMaterials: [] });
  scene.dimOtherDistricts('active');
  assert.equal(active.visible, false);
  assert.equal(other.material.depthWrite, false);
  assert.ok(other.material.opacity < 1);
  scene.restoreDistricts();
  assert.equal(active.visible, true);
  assert.equal(other.material.depthWrite, true);
  assert.equal(other.material.opacity, 1);
  assert.equal(other.material.transparent, false);
});
