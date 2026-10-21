import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { frameLlmBounds, llmFrameDelta, createFlowPackets } from '../src/llm/scene-motion.js';
import { disposeLlmObject } from '../src/llm/resources.js';

test('camera fitting contains wide operator layouts and tall towers on desktop and portrait screens',()=>{
  for(const [lo,hi] of [[[-20,-6,-5],[20,8,5]],[[-14,-7,-6],[14,16,6]]])for(const aspect of [.6,1.2,2.1])for(const direction of [new THREE.Vector3(.1,.48,1),new THREE.Vector3(0,1,.03)]){
    const box=new THREE.Box3(new THREE.Vector3(...lo),new THREE.Vector3(...hi));
    const pose=frameLlmBounds(box,aspect,45,direction);
    const camera=new THREE.PerspectiveCamera(45,aspect,.1,1000);camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld();
    for(const x of [lo[0],hi[0]])for(const y of [lo[1],hi[1]])for(const z of [lo[2],hi[2]]){
      const p=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z<1);
    }
  }
  assert.ok(frameLlmBounds(new THREE.Box3(),1,45).position.toArray().every(Number.isFinite));
});

test('flow time is refresh-rate independent and resumes without a large suspended-tab jump',()=>{
  const simulate=hz=>{let time=0;for(let i=1;i<=hz;i++)time+=llmFrameDelta((i-1)*1000/hz,i*1000/hz);return time;};
  assert.ok(Math.abs(simulate(30)-simulate(120))<1e-10);
  assert.equal(llmFrameDelta(null,100),0);
  assert.equal(llmFrameDelta(100,100000),.05);
  assert.equal(llmFrameDelta(100,10),0);
});

test('instanced data packets follow their path and remain identical at a paused simulation time',()=>{
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-5,0,0),new THREE.Vector3(0,2,0),new THREE.Vector3(5,0,0)]);
  const packets=createFlowPackets(curve,0x8cdbff,4);
  packets.update(1,.25);const first=Array.from(packets.mesh.instanceMatrix.array);
  packets.update(1,.25);assert.deepEqual(Array.from(packets.mesh.instanceMatrix.array),first);
  packets.update(2,.25);assert.notDeepEqual(Array.from(packets.mesh.instanceMatrix.array),first);
  const group=new THREE.Group();group.add(packets.mesh);disposeLlmObject(group);
});
