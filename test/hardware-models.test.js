import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedAccess,registerBudget,advanceWarp} from '../src/hardware-models.js';

test('scalar shared access distinguishes bank collisions from same-address broadcast',()=>{
  assert.equal(sharedAccess(1).conflictDegree,1);
  assert.equal(sharedAccess(2).conflictDegree,2);
  assert.equal(sharedAccess(32).conflictDegree,32);
  assert.equal(sharedAccess(33).conflictDegree,1);
  const broadcast=sharedAccess(0,7);
  assert.equal(broadcast.broadcast,true);assert.equal(broadcast.conflictDegree,1);
  assert.equal(broadcast.laneCounts[7],32);assert.equal(broadcast.bankCounts[7],1);
});
test('offset changes addressed banks without changing the conflict degree',()=>{
  const m=sharedAccess(4,3);
  assert.equal(m.usedBanks,8);assert.equal(m.conflictDegree,4);
  assert.deepEqual(m.lanes.slice(0,3).map(x=>x.bank),[3,7,11]);
});
test('reference register budget admits only complete blocks and respects shared memory',()=>{
  const full=registerBudget(32,256,0);assert.equal(full.residentWarps,64);
  const half=registerBudget(64,256,0);assert.equal(half.residentWarps,32);assert.equal(half.occupancy,.5);
  const impossible=registerBudget(255,1024,0);assert.equal(impossible.residentBlocks,0);
  assert.equal(registerBudget(32,256,128).residentBlocks,1);
  assert.equal(registerBudget(32,256,228).residentBlocks,0);
});
test('a blocked warp cannot pass dependency checking until it is ready',()=>{
  assert.deepEqual(advanceWarp(1,false),{stageIndex:1,stalled:true,complete:false});
  assert.equal(advanceWarp(1,true).stageIndex,2);
  assert.equal(advanceWarp(5,true).complete,false);
  assert.equal(advanceWarp(6,true).complete,true);
});

test('resource budgets use Ampere and Blackwell residency and shared limits',()=>{
  const a40={registers:65536,warps:48,threads:1536,blocks:16,sharedKiB:100,sharedBlockKiB:99};
  assert.equal(registerBudget(32,256,0,a40).residentWarps,48);
  assert.equal(registerBudget(32,256,0,a40).occupancy,1);
  assert.equal(registerBudget(32,256,100,a40).residentBlocks,0);
  const a100={...a40,warps:64,threads:2048,blocks:32,sharedKiB:164,sharedBlockKiB:163};
  assert.equal(registerBudget(32,256,128,a100).residentBlocks,1);
  assert.equal(registerBudget(32,256,0,a100).residentWarps,64);
});
