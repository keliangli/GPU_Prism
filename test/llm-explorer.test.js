import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ARCH_PRESETS, normalizeLlmConfig, chooseLlmExperts, estimateLlmKv } from '../src/llm/data.js';
import { disposeLlmObject } from '../src/llm/resources.js';

test('switching and editing architectures keeps routing valid without mutating presets',()=>{
  for(const preset of Object.values(ARCH_PRESETS)){
    const copy=structuredClone(preset),config=normalizeLlmConfig(preset);
    const experts=chooseLlmExperts(config,()=>0);
    assert.equal(experts.length,config.n_routed_experts?config.num_experts_per_tok:0);
    assert.equal(new Set(experts).size,experts.length);
    assert.ok(experts.every(i=>i>=0&&i<config.n_routed_experts));
    assert.deepEqual(preset,copy);
  }
  const edited=normalizeLlmConfig({...ARCH_PRESETS.deepseek,n_routed_experts:3,num_experts_per_tok:32,num_layers:0,hidden_size:'bad'});
  assert.equal(edited.num_experts_per_tok,3);
  assert.equal(edited.num_layers,4);
  assert.equal(edited.hidden_size,4096);
  assert.deepEqual(chooseLlmExperts(edited,()=>.99),[0,1,2]);
  assert.equal(normalizeLlmConfig({...edited,n_routed_experts:0}).num_experts_per_tok,0);
});

test('KV estimates scale by batch, length and precision and count hybrid attention layers',()=>{
  const inputs={batchSize:4,seqLen:4096,precisionBytes:1};
  const deep=estimateLlmKv(ARCH_PRESETS.deepseek,inputs);
  assert.equal(deep.currentGB,4*4096*61*576/1024**3);
  assert.equal(estimateLlmKv(ARCH_PRESETS.deepseek,{...inputs,batchSize:8}).currentGB,deep.currentGB*2);
  assert.equal(estimateLlmKv(ARCH_PRESETS.deepseek,{...inputs,seqLen:8192}).currentGB,deep.currentGB*2);
  assert.equal(estimateLlmKv(ARCH_PRESETS.deepseek,{...inputs,precisionBytes:.5}).currentGB,deep.currentGB/2);
  const qwen=estimateLlmKv(ARCH_PRESETS.qwen,inputs);
  assert.equal(qwen.currentGB/qwen.baselineGB,8/40);
  const hybrid=estimateLlmKv({...ARCH_PRESETS.hybrid,num_layers:7},inputs);
  assert.equal(hybrid.currentGB,4*4096*1*2*8*128/1024**3);
});

test('rebuilding a scene releases shared resources once and frees instance buffers',()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial();
  let geometries=0,materials=0,instances=0;
  geometry.addEventListener('dispose',()=>geometries++);material.addEventListener('dispose',()=>materials++);
  root.add(new THREE.Mesh(geometry,material));
  const mesh=new THREE.InstancedMesh(geometry,material,8);mesh.addEventListener('dispose',()=>instances++);root.add(mesh);
  disposeLlmObject(root);
  assert.deepEqual([geometries,materials,instances],[1,1,1]);
});
