import test from 'node:test';
import assert from 'node:assert/strict';
import { getGpuResourceTotals, getResourceReport, getComponentResourceInfo } from '../src/gpu-resources.js';
import { GPU_RESOURCE_SPECS } from '../src/gpu-resource-specs.js';
import { gpuList, getGpu } from '../src/gpu-profiles.js';
import { levels, components } from '../src/data.js';

test('H20 and 132-SM products use their own SM count for distributed resource totals',()=>{
  const h20=getGpuResourceTotals('h20'),h100=getGpuResourceTotals('h100');
  assert.equal(h20.smCount,78);
  assert.equal(h20.fp32,9984);
  assert.equal(h20.tensor,312);
  assert.equal(h20.registers,5111808);
  assert.equal(h20.registerBytes,20447232);
  assert.equal(h20.sharedKiB,17784);
  assert.equal(h20.warps,4992);
  assert.equal(h20.threads,159744);
  assert.equal(h100.registers,8650752);
  assert.equal(h100.registerBytes/1048576,33);
  assert.equal(h100.sharedKiB/1024,29.390625);
  assert.equal(h100.sharedBanks,4224);
  assert.equal(h100.warps,8448);
  assert.equal(h100.threads,270336);
  for(const gpu of gpuList)assert.equal(getGpu(gpu.id).activeSMs,GPU_RESOURCE_SPECS[gpu.id].sms.value);
});

test('all 24 resource reports expose six metrics, valid references and stable row identities',()=>{
  const states=new Set(['verified','observed','reference','derived','unknown']);
  for(const gpu of gpuList)for(const level of Object.keys(levels)){
    const report=getResourceReport(gpu.id,level);
    assert.equal(report.gpuName,gpu.name);
    assert.ok(report.rows.length>=8);
    assert.equal(new Set(report.rows.map(r=>r.id)).size,report.rows.length,`${gpu.id}/${level}`);
    for(const scope of report.scopes){
      assert.equal(report.summary[scope.id].length,6,`${gpu.id}/${level}/${scope.id}`);
      for(const metric of report.summary[scope.id])assert.ok(states.has(metric.status));
    }
    for(const row of report.rows){
      assert.ok(states.has(row.status));
      if(row.source)assert.match(row.source.url,/^https:\/\//);
      if(row.component)assert.ok(components[row.component]);
    }
  }
});

test('unknown physical quantities remain unknown instead of becoming zero or H100 values',()=>{
  const h800=getResourceReport('h800','package');
  assert.equal(h800.summary.gpu.find(x=>x.id==='l2').value,'未核实');
  assert.equal(h800.rows.find(x=>x.id==='hbm-stacks').total,'未核实');
  assert.equal(getResourceReport('h200','package').rows.find(x=>x.id==='gpc').total,'未核实');
  assert.equal(getResourceReport('h100','package').rows.find(x=>x.id==='hbm-stacks').total,'5 个');
  assert.equal(getComponentResourceInfo('h100','registers','registerBank').id,'register-ports');
  assert.equal(getComponentResourceInfo('h200','sm','tma').status,'unknown');
});

test('unified/shared capacities and local programming limits retain their distinct meaning',()=>{
  const report=getResourceReport('h200','shared');
  assert.equal(report.summary.sm.find(x=>x.id==='unified').value,'256');
  assert.equal(report.summary.sm.find(x=>x.id==='shared').value,'228');
  assert.equal(report.summary.sm.find(x=>x.id==='cta-shared').value,'227');
  assert.match(report.note,/不能相加/);
  assert.match(report.scopeNote,/不能作为一个跨 SM 统一分配/);
  assert.equal(getResourceReport('h200','warp').summary.gpu.find(x=>x.id==='lanes').value,'32');
});
