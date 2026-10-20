import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('sync removes an obsolete optional baseline and copies the current data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'code-atlas-sync-'));
  try {
    mkdirSync(join(directory, 'data/code-atlas'), {recursive:true});
    mkdirSync(join(directory, 'public/code-atlas/sglang'), {recursive:true});
    writeFileSync(join(directory, 'data/code-atlas/sglang-graph.json'), '{"current":true}');
    writeFileSync(join(directory, 'public/code-atlas/sglang/graph.previous.json'), '{"obsolete":true}');
    const script = fileURLToPath(new URL('../../scripts/code-atlas/sync-graph.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(directory, 'public/code-atlas/sglang/graph.json'), 'utf8'), '{"current":true}');
    assert.equal(existsSync(join(directory, 'public/code-atlas/sglang/graph.previous.json')), false);
    writeFileSync(join(directory, 'data/code-atlas/sglang-graph.previous.json'), '{"baseline":true}');
    assert.equal(spawnSync(process.execPath, [script], { cwd: directory }).status, 0);
    assert.equal(readFileSync(join(directory, 'public/code-atlas/sglang/graph.previous.json'), 'utf8'), '{"baseline":true}');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('syncing DeepInfer leaves SGLang and its baseline untouched', () => {
  const directory = mkdtempSync(join(tmpdir(), 'code-atlas-deepinfer-sync-'));
  try {
    mkdirSync(join(directory, 'data/code-atlas'), {recursive:true});
    mkdirSync(join(directory, 'public/code-atlas/sglang'), {recursive:true});
    writeFileSync(join(directory, 'data/code-atlas/deepinfer-graph.json'), '{"deepinfer":true}');
    writeFileSync(join(directory, 'public/code-atlas/sglang/graph.json'), '{"sglang":true}');
    writeFileSync(join(directory, 'public/code-atlas/sglang/graph.previous.json'), '{"baseline":true}');
    const script = fileURLToPath(new URL('../../scripts/code-atlas/sync-graph.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, 'deepinfer'], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(directory, 'public/code-atlas/deepinfer/graph.json'), 'utf8'), '{"deepinfer":true}');
    assert.equal(readFileSync(join(directory, 'public/code-atlas/sglang/graph.json'), 'utf8'), '{"sglang":true}');
    assert.equal(readFileSync(join(directory, 'public/code-atlas/sglang/graph.previous.json'), 'utf8'), '{"baseline":true}');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
