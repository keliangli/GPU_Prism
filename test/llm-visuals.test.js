import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTechBlock, createTechEnvironment, styleTechComponent } from '../src/llm/visuals.js';
import { disposeLlmObject } from '../src/llm/resources.js';

test('tech chassis preserves focus bounds and can be raycast without its decorations', () => {
  for (const dimensions of [[4, 3, 2], [7, 0.25, 7], [1.4, 3.4, 3.4]]) {
    const mesh = createTechBlock(...dimensions, 0x06b6d4, 0.75);
    mesh.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).toArray();
    size.forEach((value, index) => assert.ok(Math.abs(value - dimensions[index]) < 0.00001));
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 20), new THREE.Vector3(0, 0, -1));
    assert.ok(ray.intersectObject(mesh, false).length > 0);
    assert.equal(mesh.material.transparent, false);
    disposeLlmObject(mesh);
  }
});

test('reduced motion remains static and stopping flow freezes spatial decoration', () => {
  const still = createTechEnvironment({ reducedMotion: true, compact: true });
  const moving = createTechEnvironment();
  const transforms = environment => {
    const values = [];
    environment.group.traverse(object => values.push(...object.rotation.toArray().slice(0, 3)));
    return values;
  };
  const original = transforms(still);
  still.setMotionEnabled(true);
  for (let i = 0; i < 30; i++) still.update(i / 60);
  assert.deepEqual(transforms(still), original);
  const start = transforms(moving);
  for (let i = 0; i < 30; i++) moving.update(i / 60);
  assert.notDeepEqual(transforms(moving), start);
  moving.setMotionEnabled(false);
  const stopped = transforms(moving);
  moving.update(50);
  moving.update(51);
  assert.deepEqual(transforms(moving), stopped);
  still.dispose();
  moving.dispose();
});

test('environment disposal releases geometry once and detaches the stage', () => {
  const environment = createTechEnvironment();
  const scene = new THREE.Scene();
  scene.add(environment.group);
  let geometryCount = 0, released = 0;
  environment.group.traverse(object => {
    if (!object.geometry) return;
    geometryCount++;
    object.geometry.addEventListener('dispose', () => released++);
  });
  environment.dispose();
  environment.dispose();
  assert.equal(environment.group.parent, null);
  assert.equal(released, geometryCount);
});

test('role details preserve module bounds, are idempotent and leave proxy geometry untouched', () => {
  for (const role of ['mla_kv_latent', 'csa_cache', 'kda_state', 'attn_core', 'moe_router']) {
    const mesh = createTechBlock(3.2, 1.8, 2.4, 0x58bde7);
    styleTechComponent(mesh, role);
    const count = mesh.children.length;
    styleTechComponent(mesh, role);
    assert.equal(mesh.children.length, count);
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).toArray();
    size.forEach((value, index) => assert.ok(Math.abs(value - [3.2, 1.8, 2.4][index]) < 0.00001));
    let released = 0;
    mesh.getObjectByName('component-role-markings').geometry.addEventListener('dispose', () => released++);
    disposeLlmObject(mesh);
    assert.equal(released, 1);
  }
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  styleTechComponent(proxy, 'attn_core');
  assert.equal(proxy.children.length, 0);
  disposeLlmObject(proxy);
});
