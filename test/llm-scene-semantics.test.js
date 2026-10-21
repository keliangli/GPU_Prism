import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {sceneInstanceKey,resolveFlowNodes,flowMatchesFocus} from '../src/llm/scene-semantics.js';

test('repeated categories have stable and distinct instance identities',()=>{
  assert.notEqual(sceneInstanceKey('ds',3,4,'attn_core',0),sceneInstanceKey('ds',3,4,'attn_core',1));
  assert.equal(sceneInstanceKey('ds',3,4,'attn_core',0),sceneInstanceKey('ds',3,4,'attn_core',0));
});
test('flow anchor resolution does not invent a dependency for a nearby curve control point',()=>{
  const nodes=[{position:new Vector3(1,0,0),userData:{nodeId:'cache',instanceKey:'cache/0'}},{position:new Vector3(3,0,0),userData:{nodeId:'attn',instanceKey:'attn/0'}}];
  assert.deepEqual(resolveFlowNodes([new Vector3(1,0,0),new Vector3(2.5,0,0),new Vector3(3,0,0)],nodes),['cache/0','attn/0']);
  assert.deepEqual(resolveFlowNodes([new Vector3(2.5,0,0)],nodes),[]);
  assert.deepEqual(resolveFlowNodes([],nodes,['attn']),['attn/0']);
});
test('only related paths and explicit residual paths participate in a chapter',()=>{
  const edge={role:'flow',nodeKeys:['a','b']};
  assert.equal(flowMatchesFocus(edge,new Set(['a'])),true);
  assert.equal(flowMatchesFocus(edge,new Set(['c'])),false);
  assert.equal(flowMatchesFocus(edge,null),true);
  assert.equal(flowMatchesFocus(edge,new Set(['a']),true),false);
  assert.equal(flowMatchesFocus({...edge,role:'residual'},new Set(['a']),true),true);
});
