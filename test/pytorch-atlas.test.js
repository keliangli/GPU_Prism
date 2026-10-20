import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PYTORCH_NODES, PYTORCH_LAYERS, PYTORCH_DOMAINS, PYTORCH_MODULES, PYTORCH_RELATIONS, getPytorchNode, getPytorchTrail, getPytorchScope, getPytorchDescendants, getPytorchScene, searchPytorch, parsePytorchRoute } from '../src/pytorch-data.js';
import { layoutPytorchBands } from '../src/pytorch-scene.js';
const index=JSON.parse(fs.readFileSync(new URL('../src/pytorch-source-index.json',import.meta.url),'utf8'));

test('functional hierarchy has one reachable parent and stops at module depth',()=>{
  const all=Object.values(PYTORCH_NODES),descendants=getPytorchDescendants('pytorch');
  assert.equal(new Set(descendants.map(n=>n.id)).size,all.length-1);
  assert.equal(PYTORCH_LAYERS.length,5);
  assert.ok(PYTORCH_DOMAINS.some(n=>n.id==='quantization'));
  assert.ok(PYTORCH_MODULES.length>=85);
  for(const node of all){
    assert.ok(getPytorchTrail(node.id).length<=4,node.id);
    assert.ok(node.description,node.id);
    if(node.parent)assert.ok(getPytorchNode(node.parent).children.includes(node.id),node.id);
    for(const child of node.children)assert.equal(getPytorchNode(child).parent,node.id);
    if(node.kind==='module')assert.equal(node.children.length,0);
  }
});

test('all modules have a verified local source entry in the same snapshot',()=>{
  assert.match(index.commit,/^[a-f0-9]{40}$/);
  assert.equal(index.version,'2.15.0a0');
  assert.ok(index.sourceFiles>10000);
  for(const node of Object.values(PYTORCH_NODES)){
    const evidence=index.nodes[node.id];
    assert.ok(evidence?.sourceFiles>0,node.id);
    assert.deepEqual(evidence.paths.map(p=>p.path),node.paths,node.id);
    assert.equal(new Set(node.paths).size,node.paths.length,node.id);
    for(const source of evidence.paths){assert.ok(!source.path.includes('..'));if(!source.directory)assert.match(source.sha256,/^[a-f0-9]{64}$/);}
  }
});

test('deep links retain leaf selection while showing its containing subsystem',()=>{
  assert.equal(parsePytorchRoute('#/pytorch').id,'pytorch');
  assert.equal(parsePytorchRoute('#/pytorch/inductor-codegen').id,'inductor-codegen');
  assert.equal(getPytorchScope('inductor-codegen').id,'inductor');
  assert.equal(parsePytorchRoute('#/pytorch/constructor').id,'pytorch');
  assert.equal(parsePytorchRoute('#/pytorch/inductor/extra'),null);
  assert.equal(parsePytorchRoute('#/gpu/h20'),null);
  assert.equal(getPytorchNode('__proto__').id,'pytorch');
  assert.deepEqual(getPytorchTrail('dynamo-guards').map(n=>n.id),['pytorch','graphs','dynamo','dynamo-guards']);
});

test('source path search resolves deep modules without inventing call relationships',()=>{
  assert.ok(searchPytorch('torch/_dynamo/guards.py').some(n=>n.id==='dynamo-guards'));
  assert.ok(searchPytorch('CUDA').some(n=>n.id==='cuda'));
  assert.ok(searchPytorch('量化').some(n=>n.id==='quantization'));
  assert.deepEqual(searchPytorch('not-a-real-module-123'),[]);
  for(const relation of PYTORCH_RELATIONS){assert.equal(getPytorchNode(relation.from).kind,'domain');assert.equal(getPytorchNode(relation.to).kind,'domain');assert.ok(relation.detail);}
});

test('scoped 3D scenes preserve containment and have distinct finite positions',()=>{
  for(const scope of ['pytorch',...PYTORCH_LAYERS.map(n=>n.id),...PYTORCH_DOMAINS.map(n=>n.id)]){
    const groups=getPytorchScene(scope),layout=layoutPytorchBands(groups);
    for(const group of layout){
      const positions=new Set();
      for(const node of group.nodes){assert.equal(node.parent,group.id);assert.ok(Number.isFinite(node.x)&&Number.isFinite(node.z)&&Number.isFinite(group.y));positions.add(`${node.x}:${node.z}`);}
      assert.equal(positions.size,group.nodes.length);
    }
  }
  const normal=layoutPytorchBands(getPytorchScene('pytorch'),1),expanded=layoutPytorchBands(getPytorchScene('pytorch'),1.6);
  assert.ok(expanded[0].y>normal[0].y);
  assert.deepEqual(expanded[0].nodes.map(n=>n.x),normal[0].nodes.map(n=>n.x));
});
