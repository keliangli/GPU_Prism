import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const filename of ['graph.json', 'graph.previous.json']) {
  test(`${filename}: every file has an explanation backed by existing definitions`, () => {
    const graph = JSON.parse(readFileSync(new URL(`../../public/code-atlas/sglang/${filename}`, import.meta.url), 'utf8'));
    assert.equal(graph.meta.schemaVersion, 2);
    assert.equal(graph.meta.parseErrors, 0);
    assert.equal(graph.files.length, graph.meta.fileCount);
    assert.equal(graph.imports.length, graph.meta.edgeCount);
    const ids = new Set(graph.files.map(file => file.id));
    for (const file of graph.files) {
      assert.ok(file.description?.title && file.description?.summary, file.id);
      assert.notEqual(file.description.basis, 'unavailable', file.id);
      for (const key of file.description.keySymbols) {
        assert.ok(file.symbols.some(symbol => symbol.id === key.id && symbol.start === key.start), `${file.id}: ${key.id}`);
      }
    }
    for (const edge of graph.imports) assert.ok(ids.has(edge.from) && ids.has(edge.to));
  });
}
