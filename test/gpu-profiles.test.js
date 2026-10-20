import test from 'node:test';
import assert from 'node:assert/strict';
import { gpuList, getGpu, getGpuComponents, getGpuSources, parseGpuRoute } from '../src/gpu-profiles.js';
import { components as baseComponents, levelComponents, flows } from '../src/data.js';

test('SXM profiles keep product memory and interconnect specifications separate', () => {
  assert.deepEqual(gpuList.map(g=>g.id), ['h20','h200','h100','h800']);
  assert.equal(getGpu('h200').memoryGB,141);
  assert.equal(getGpu('h200').memoryType,'HBM3e');
  assert.equal(getGpu('h100').memoryGB,80);
  assert.equal(getGpu('h100').nvlinkBandwidth,'900 GB/s');
  assert.equal(getGpu('h800').nvlinkBandwidth,'400 GB/s');
  assert.equal(getGpu('h800').activeSMs,132);
  assert.equal(getGpu('h20').activeSMs,78);
  assert.equal(getGpu('unlisted').id,'h20');
  assert.equal(getGpu('__proto__').id,'h20');
});

test('direct routes retain every GPU and level and safely reject unsupported paths', () => {
  for(const gpu of gpuList) for(const level of Object.keys(levelComponents)) {
    assert.deepEqual(parseGpuRoute(`#/gpu/${gpu.id}/${level}`),{gpuId:gpu.id,level});
  }
  assert.deepEqual(parseGpuRoute('#/gpu/h200'),{gpuId:'h200',level:'package'});
  assert.deepEqual(parseGpuRoute('#/gpu/h800/__proto__'),{gpuId:'h800',level:'package'});
  assert.equal(parseGpuRoute('#/gpu/__proto__'),null);
  assert.equal(parseGpuRoute('#/gpu/b200/sm'),null);
  assert.equal(parseGpuRoute('#/gpu/h200/sm/extra'),null);
});

test('every profile supports all six component levels and valid citations', () => {
  for (const gpu of gpuList) {
    const catalog=getGpuComponents(gpu.id),sources=getGpuSources(gpu.id);
    for (const ids of Object.values(levelComponents)) for (const id of ids) {
      assert.ok(catalog[id],`${gpu.id}/${id}`);
      assert.ok(sources[catalog[id].source]?.url,`${gpu.id}/${id} source`);
    }
    if(gpu.id!=='h20') assert.doesNotMatch(JSON.stringify(catalog),/\bH20\b/);
  }
});

test('flow walkthroughs only select components available in their level', () => {
  for(const [level,flow] of Object.entries(flows)) {
    assert.ok(flow.steps.length>0);
    assert.equal(new Set(flow.steps.map(s=>s.id)).size,flow.steps.length);
    for(const step of flow.steps) assert.ok(levelComponents[level].includes(step.component),`${level}/${step.id}`);
  }
});

test('inspector content follows the selected model without mutating shared data', () => {
  const h200=getGpuComponents('h200'),h100=getGpuComponents('h100'),h800=getGpuComponents('h800');
  assert.match(h200.hbm.description,/141 GB HBM3e/);
  assert.match(h100.hbm.description,/80 GB HBM3/);
  assert.match(h800.nvlink.insight,/400 GB\/s/);
  assert.equal(h200.gpc.stats[0][1],'132 / GPU');
  assert.equal(h200.tensor.stats[0][1],'528 / GPU');
  assert.equal(h100.cuda.stats[0][1],'16,896 / GPU');
  assert.equal(h800.gpc.stats[0][1],'132 / GPU');
  h200.hbm.stats[0][1]='changed';
  assert.equal(getGpuComponents('h200').hbm.stats[0][1],'141 GB');
  assert.equal(baseComponents.hbm.stats[0][1],'96 GB');
});
