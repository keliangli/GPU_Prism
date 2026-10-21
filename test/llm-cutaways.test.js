import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createComponentCutaway } from '../src/llm/cutaways.js';
import { createTechBlock, styleTechComponent } from '../src/llm/visuals.js';
import { disposeLlmObject } from '../src/llm/resources.js';

test('cutaway preserves body identity and restores every shell material exactly', () => {
  const body = createTechBlock(4, 3, 4, 0x58bde7); styleTechComponent(body, 'attn_core');
  const material = body.material, geometry = body.geometry;
  const original = [];
  body.traverse(o => { if (o.material) original.push([o.material, o.material.opacity, o.material.transparent, o.material.depthWrite]); });
  const cutaway = createComponentCutaway(body, 'attn_core', {}, { attention: 'mla' });
  cutaway.update({ openness: 1, time: 4 });
  assert.equal(body.material, material); assert.equal(body.geometry, geometry);
  assert.equal(cutaway.group.visible, true); assert.ok(body.material.opacity < .1);
  cutaway.update({ openness: 0 });
  assert.equal(cutaway.group.visible, false);
  for (const [mat, opacity, transparent, depthWrite] of original) {
    assert.equal(mat.opacity, opacity); assert.equal(mat.transparent, transparent); assert.equal(mat.depthWrite, depthWrite);
  }
  assert.equal(createComponentCutaway(body, 'attn_core'), null);
  disposeLlmObject(body);
});

test('router sample and path counts adapt to each actual model configuration', () => {
  for (const [routed, topK, shared] of [[384, 6, 1], [896, 16, 2], [288, 8, 1], [64, 4, 0]]) {
    const body = createTechBlock(3.5, 3, 3, 0x9180e3);
    const cutaway = createComponentCutaway(body, 'moe_router', { n_routed_experts: routed, num_experts_per_tok: topK, n_shared_experts: shared });
    const active = Array.from({ length: topK }, (_, i) => routed - i - 1);
    cutaway.update({ openness: 1, activeExperts: active });
    const data = cutaway.group.userData;
    assert.equal(data.totalRouted, routed); assert.equal(data.topK, topK); assert.equal(data.totalShared, shared);
    assert.equal(data.sampleIds.length, Math.min(24, routed)); assert.equal(new Set(data.sampleIds).size, data.sampleIds.length);
    assert.equal(data.visibleActive, topK);
    const lines = cutaway.group.children.find(c => c.isLineSegments && c.geometry.drawRange.count !== Infinity);
    assert.equal(lines.geometry.drawRange.count, (topK + shared) * 2);
    assert.ok(cutaway.note.includes(`${routed}`)); assert.ok(cutaway.note.includes('抽样'));
    disposeLlmObject(body);
  }
});

test('story dim applies to the whole cutaway and restores the original shell without reopening', () => {
  const body = createTechBlock(4, 3, 4, 0x7ae1c8);
  const original = { opacity: body.material.opacity, transparent: body.material.transparent, depthWrite: body.material.depthWrite };
  const cutaway = createComponentCutaway(body, 'shared_expert', { n_shared_experts: 2 });
  assert.equal(cutaway.kind, 'shared');
  cutaway.update({ openness: 1, dim: .2 });
  assert.ok(Math.abs(body.material.opacity - original.opacity * .06 * .2) < 1e-10);
  assert.equal(body.material.transparent, true);
  for (const child of cutaway.group.children) assert.ok(child.material.opacity <= .2);
  cutaway.update({ openness: 0, dim: .3 });
  assert.ok(Math.abs(body.material.opacity - original.opacity * .3) < 1e-10);
  assert.equal(body.material.transparent, true);
  cutaway.update({ openness: 0, dim: 1 });
  assert.equal(body.material.opacity, original.opacity);
  assert.equal(body.material.transparent, original.transparent);
  assert.equal(body.material.depthWrite, original.depthWrite);
  disposeLlmObject(body);
});

test('internal schematics stay inside component bounds at full opening with at most five draws', () => {
  const parts = ['attn_core', 'mla_kv_latent', 'csa_cache', 'kda_state', 'moe_router', 'shared_expert', 'moe_shared'].map(id => [id, 'kda']);
  parts.push(...['mla', 'dsa', 'csa2', 'swa'].map(mode => ['attn_core', mode]));
  for (const [nodeId, attention] of parts) {
    const body = createTechBlock(4, 3, 4, 0x58bde7);
    const cutaway = createComponentCutaway(body, nodeId, { n_routed_experts: 896, num_experts_per_tok: 16, n_shared_experts: 2 }, { attention, indexer: 'Reuse' });
    cutaway.update({ openness: 1, time: 2 }); body.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(cutaway.group);
    assert.ok(box.min.x >= -2.001 && box.max.x <= 2.001, nodeId);
    assert.ok(box.min.y >= -1.501 && box.max.y <= 1.501, nodeId);
    assert.ok(box.min.z >= -2.001 && box.max.z <= 2.001, nodeId);
    assert.ok(cutaway.group.children.length <= 5, nodeId);
    assert.ok(cutaway.note.includes('示意'), nodeId);
    disposeLlmObject(body);
  }
});

test('paused time produces deterministic internals and preview / unrelated parts stay unopened', () => {
  const body = createTechBlock(4, 3, 4, 0x58bde7);
  assert.equal(createComponentCutaway(body, 'residual_add'), null);
  assert.equal(createComponentCutaway(body, 'attn_core', { availability: 'preview' }), null);
  assert.equal(createComponentCutaway(body, 'moe_shared', { n_shared_experts: 0 }), null);
  const cutaway = createComponentCutaway(body, 'attn_core', {}, { attention: 'dsa' });
  cutaway.update({ openness: .7, time: 10 });
  const instances = cutaway.group.children.find(c => c.isInstancedMesh);
  const first = Array.from(instances.instanceMatrix.array), colors = Array.from(instances.instanceColor.array);
  cutaway.update({ openness: .7, time: 10 });
  assert.deepEqual(Array.from(instances.instanceMatrix.array), first); assert.deepEqual(Array.from(instances.instanceColor.array), colors);
  cutaway.update({ openness: Number.NaN, time: Infinity }); assert.equal(cutaway.group.visible, false);
  disposeLlmObject(body);
});
