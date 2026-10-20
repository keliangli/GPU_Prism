import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROJECTS, projectHref, resolveProject, parseCodeAtlasRoute } from '../../src/code-atlas/projects.js';
import { buildIndex, layoutDistricts, fileOffset } from '../../src/code-atlas/derive.js';

test('project routing preserves deployment paths and resets routes across projects', () => {
  assert.equal(resolveProject('').id, 'sglang');
  assert.equal(resolveProject('?project=deepinfer').id, 'deepinfer');
  assert.equal(resolveProject('?project=missing').id, 'sglang');
  assert.equal(projectHref('deepinfer', 'https://example.com/GPU_Prism/?x=1&project=sglang#/sglang/f/old.py'), '/GPU_Prism/?x=1#/deepinfer');
  assert.equal(resolveProject('?project=deepinfer').baseline, null);
  assert.equal(resolveProject('?project=sglang').baseline, 'code-atlas/sglang/graph.previous.json');
  assert.deepEqual(parseCodeAtlasRoute('#/deepinfer/i/deepinfer%2Fengine%2Fllm_engine.py'),{projectId:'deepinfer',kind:'i',id:'deepinfer/engine/llm_engine.py'});
  assert.deepEqual(parseCodeAtlasRoute('#/sglang/d/mem_cache'),{projectId:'sglang',kind:'d',id:'mem_cache'});
  assert.equal(parseCodeAtlasRoute('#/pytorch'),null);
  assert.equal(parseCodeAtlasRoute('#/gpu/h20'),null);
  assert.ok(parseCodeAtlasRoute('#/sglang/f/%E0%A4').invalid);
});

test('DeepInfer snapshot has complete guides, source attribution and valid cross-language edges', () => {
  const project = PROJECTS.find(item => item.id === 'deepinfer');
  const graph = JSON.parse(readFileSync(new URL(`../../public/${project.graph}`, import.meta.url), 'utf8'));
  assert.equal(graph.meta.parseErrors, 0);
  assert.deepEqual(graph.meta.sourceErrors, []);
  assert.equal(graph.files.length, graph.meta.fileCount);
  assert.equal(graph.imports.length, graph.meta.edgeCount);
  assert.equal(graph.files.reduce((sum, file) => sum + file.loc, 0), graph.meta.locTotal);
  assert.match(graph.meta.source.commit, /^[0-9a-f]{40}$/);
  const index = buildIndex(graph);
  const kinds = {};
  for (const edge of graph.imports) {
    assert.ok(index.filesById.has(edge.from) && index.filesById.has(edge.to));
    assert.ok(['import', 'include', 'binding'].includes(edge.kind));
    kinds[edge.kind] = (kinds[edge.kind] || 0) + 1;
    assert.equal(index.outMap.get(edge.from).find(item => item.id === edge.to).relation, edge.kind);
  }
  assert.deepEqual(kinds, graph.meta.edgeKinds);
  assert.equal(kinds.binding, 5);
  for (const file of graph.files) {
    assert.ok(!file.id.startsWith('vendor/'));
    assert.ok(file.description?.title && file.description?.summary, file.id);
    assert.notEqual(file.description.basis, 'unavailable', file.id);
    assert.ok(index.districtById.has(file.district));
    assert.equal(index.outMap.get(file.id)?.length || 0, file.fanOut);
    assert.equal(index.inMap.get(file.id)?.length || 0, file.fanIn);
    for (const key of file.description.keySymbols) assert.ok(file.symbols.some(symbol => symbol.id === key.id && symbol.start === key.start), file.id);
    if (file.language === 'C++') assert.deepEqual(file.symbols, []);
  }
  for (const step of project.story) assert.ok(index.filesById.has(step.file), step.file);
  for (const id of graph.meta.analysis.entryFiles) assert.ok(index.filesById.has(id), id);
  for (const district of graph.districts) assert.ok(district.description?.summary, district.id);

  const layout = layoutDistricts(graph.districts, index.filesById);
  for (const plot of layout.plots) {
    for (const [position, id] of plot.files.entries()) {
      const offset = fileOffset(plot, position);
      assert.ok(Number.isFinite(offset.dx) && Number.isFinite(offset.dz), id);
      assert.ok(Math.abs(offset.dx) + .31 <= plot.side / 2, id);
      assert.ok(Math.abs(offset.dz) + .31 <= plot.depth / 2, id);
    }
  }
});
