import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {llmAnimationRunning,storyCameraOffset,storyExperts} from '../src/llm/animation-state.js';
import {createFlowPackets,createRoutePackets} from '../src/llm/scene-motion.js';
import {disposeLlmObject} from '../src/llm/resources.js';

test('explicit story play animates even when reduced-motion exploration was stopped',()=>{
  let time=0;
  const state={storyActive:true,storyPlaying:true,flowRunning:false};
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(),new THREE.Vector3(6,2,0)]);
  const flow=createFlowPackets(curve,0x88ccff,4);
  flow.update(time,.24);const first=Array.from(flow.mesh.instanceMatrix.array);
  if(llmAnimationRunning(state))time+=.5;
  flow.update(time,.24);assert.notDeepEqual(Array.from(flow.mesh.instanceMatrix.array),first);
  state.storyPlaying=false;const paused=Array.from(flow.mesh.instanceMatrix.array);
  if(llmAnimationRunning(state))time+=1;
  flow.update(time,.24);assert.deepEqual(Array.from(flow.mesh.instanceMatrix.array),paused);
  state.storyPlaying=true;state.hidden=true;assert.equal(llmAnimationRunning(state),false);
  disposeLlmObject(flow.mesh);
});

test('story camera keeps moving within a chapter while reduced motion has a fixed view',()=>{
  const offset=[10,8,40];
  assert.notDeepEqual(storyCameraOffset(offset,.2),storyCameraOffset(offset,.7));
  assert.deepEqual(storyCameraOffset(offset,.2,true),offset);
  assert.deepEqual(storyCameraOffset(offset,.7,true),offset);
  for(const p of [0,.2,.5,.8,1])assert.ok(Math.abs(Math.hypot(...storyCameraOffset(offset,p))/Math.hypot(...offset)-1)<.03);
});

test('demonstration token steps change routes and retain each model expert counts',()=>{
  for(const [total,count] of [[384,6],[896,16],[256,8],[288,8],[12,2]]){
    const config={n_routed_experts:total,num_experts_per_tok:count};
    const first=storyExperts(config,0),next=storyExperts(config,1);
    assert.equal(first.length,count);assert.equal(new Set(next).size,count);
    assert.ok(next.every(id=>id>=0&&id<total));assert.notDeepEqual(first,next);
    assert.deepEqual(storyExperts(config,1),next);
  }
  assert.deepEqual(storyExperts({n_routed_experts:0,num_experts_per_tok:8},0),[]);
});

test('router packets show input then output and retain a frozen phase when paused',()=>{
  const input=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(4,2,0)]);
  const output=new THREE.CatmullRomCurve3([new THREE.Vector3(4,2,0),new THREE.Vector3(8,0,0)]);
  const packets=createRoutePackets([input,output]);
  packets.update(.4);const first=Array.from(packets.mesh.instanceMatrix.array);
  packets.update(2.4);const second=Array.from(packets.mesh.instanceMatrix.array);
  assert.notDeepEqual(second,first);packets.update(2.4);assert.deepEqual(Array.from(packets.mesh.instanceMatrix.array),second);
  assert.equal(packets.mesh.count,2);disposeLlmObject(packets.mesh);
});
