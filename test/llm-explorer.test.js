import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ARCH_PRESETS, normalizeLlmConfig, chooseLlmExperts, estimateLlmKv } from '../src/llm/data.js';
import { disposeLlmObject } from '../src/llm/resources.js';
import { getLlmLayer, getLlmLayerGroups, estimateLlmParameters, NEW_MODEL_KEYS } from '../src/llm/models.js';
import { getPublishedComponent } from '../src/llm/components.js';

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

test('published model dimensions survive selection, including K3 beyond the former 512-expert limit',()=>{
  const expected={
    'deepseek-v4.1-flash':[40,5120,384,6,1],
    'glm-5.3':[78,6144,256,8,1],
    'kimi-k3':[93,7168,896,16,2],
    'glm-5.3-flash':[45,4096,288,8,1]
  };
  for(const [key,dims] of Object.entries(expected)){
    const c=normalizeLlmConfig(ARCH_PRESETS[key]);
    assert.deepEqual([c.num_layers,c.hidden_size,c.n_routed_experts,c.num_experts_per_tok,c.n_shared_experts],dims);
    assert.match(c.source_url,/blob\/[a-f0-9]{40}\/config.json$/);
  }
  const k3=normalizeLlmConfig(ARCH_PRESETS['kimi-k3']);
  assert.ok(chooseLlmExperts(k3,()=>.999).some(n=>n>511));
  assert.equal(chooseLlmExperts(k3,()=>0).length,16);
});

test('hybrid layer schedules honor each publisher’s indexing convention and final exceptions',()=>{
  const k3=ARCH_PRESETS['kimi-k3'],flash=ARCH_PRESETS['glm-5.3-flash'];
  assert.deepEqual(getLlmLayerGroups(k3).map(g=>[g.type,g.count]),[['kda',69],['mla',24]]);
  assert.equal(getLlmLayer(k3,3).attention,'mla'); // official layer 4, one-based
  assert.equal(getLlmLayer(k3,4).attention,'kda');
  assert.equal(getLlmLayer(k3,92).attention,'mla'); // last layer is also full attention
  assert.deepEqual(getLlmLayerGroups(flash).map(g=>[g.type,g.count]),[['kda',34],['dsa',11]]);
  assert.equal(getLlmLayer(flash,3).attention,'dsa'); // GLM lists are zero-based
  assert.equal(getLlmLayer(flash,44).attention,'kda');
  assert.equal(flash.qk_rope_head_dim,0);
});

test('CED layer roles retain encoder/decoder boundary, index reuse and Engram placement',()=>{
  const c=ARCH_PRESETS['deepseek-v4.1-flash'];
  assert.equal(getLlmLayer(c,0).attention,'swa');
  assert.equal(getLlmLayer(c,2).indexer,'Full');
  assert.equal(getLlmLayer(c,3).indexer,'Reuse');
  assert.equal(getLlmLayer(c,24).indexer,'Reindex');
  assert.equal(getLlmLayer(c,19).stage,'因果编码器');
  assert.equal(getLlmLayer(c,20).stage,'解码器');
  assert.equal(getLlmLayer(c,1).engram,true);
  assert.equal(getLlmLayer(c,14).engram,true);
  assert.equal(getLlmLayer(c,15).engram,false);
});

test('KV accounting counts only hybrid MLA payload and preserves zero RoPE dimensions',()=>{
  const opts={batchSize:2,seqLen:1048576,precisionBytes:2};
  const k3=estimateLlmKv(ARCH_PRESETS['kimi-k3'],opts);
  assert.equal(k3.currentGB,2*1048576*24*576*2/1024**3);
  const flash=estimateLlmKv(ARCH_PRESETS['glm-5.3-flash'],opts);
  assert.equal(flash.currentGB,2*1048576*11*512*2/1024**3);
  const glm=ARCH_PRESETS['glm-5.3'];
  const a=estimateLlmKv(glm,opts),b=estimateLlmKv({...glm,index_topk:64},opts);
  assert.equal(a.currentGB,b.currentGB); // sparse reading is not KV eviction
  assert.match(flash.note,/不含 KDA/);
});

test('CSA2 official global cache is counted once and is independent of hypothetical element precision',()=>{
  const c=ARCH_PRESETS['deepseek-v4.1-flash'],opts={batchSize:4,seqLen:1048576,precisionBytes:1};
  const kv=estimateLlmKv(c,opts);
  assert.equal(kv.currentGB,4*1048576*890/1024**3);
  assert.equal(estimateLlmKv(c,{...opts,precisionBytes:2}).currentGB,kv.currentGB);
  assert.equal(kv.savingPct,null);
  assert.match(kv.note,/不再乘层数/);
  const params=estimateLlmParameters(c);
  assert.equal(params.total,'552 B 主干');
  assert.equal(params.active,'8 B / 16 B');
});

test('closed preview has no fabricated architecture, cache or parameter defaults',()=>{
  assert.equal(NEW_MODEL_KEYS.length,5);
  const c=normalizeLlmConfig(ARCH_PRESETS['kimi-k2.8']);
  assert.equal(c.num_layers,undefined);
  assert.equal(c.hidden_size,undefined);
  assert.equal(c.n_routed_experts,undefined);
  assert.deepEqual(getLlmLayerGroups(c),[]);
  assert.deepEqual(chooseLlmExperts(c),[]);
  assert.equal(estimateLlmKv(c,{batchSize:4,seqLen:4096,precisionBytes:1}).currentGB,null);
  assert.equal(estimateLlmParameters(c).total,'未披露');
  assert.match(getPublishedComponent(c,0,'attn_core',{batchSize:4,seqLen:4096}).paramsFormula,/无可核验/);
});

test('published component inspectors use current dimensions and avoid invalid values across every layer',()=>{
  for(const key of NEW_MODEL_KEYS){
    const c=ARCH_PRESETS[key];if(!c.verified)continue;
    for(let i=0;i<c.num_layers;i++){
      for(const node of ['embedding','rmsnorm','attn_core','moe_experts','residual_add','shared_expert']){
        const details=getPublishedComponent(c,i,node,{batchSize:4,seqLen:4096});
        assert.doesNotMatch(JSON.stringify(details),/NaN|undefined/);
      }
    }
  }
  const c=ARCH_PRESETS['kimi-k3'];
  const experts=getPublishedComponent(c,4,'moe_experts',{batchSize:1,seqLen:4096});
  assert.match(experts.paramsFormula,/3584/); // LatentMoE width, not main hidden size 7168
  const dense=getPublishedComponent(c,0,'moe_experts',{batchSize:1,seqLen:4096});
  assert.equal(dense.title,'Dense FFN');
});
