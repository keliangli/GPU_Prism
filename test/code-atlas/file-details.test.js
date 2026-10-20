import test from 'node:test';
import assert from 'node:assert/strict';
import { fileExplanationHtml } from '../../src/code-atlas/file-details.js';

const file = { id: 'f.py', description: {
  title: '模型执行', summary: '准备并执行模型前向计算。', basis: 'guide',
  responsibilities: [{ text: '执行前向计算', symbols: ['forward'] }],
  keySymbols: [{ id: 'f.py#Runner', name: 'Runner', kind: 'class', start: 12, doc: '<script>alert("source")</script>' }],
  moduleDoc: '<img src=x onerror=alert(1)>'
} };

test('file explanations show responsibilities and navigable source definitions safely', () => {
  const html = fileExplanationHtml(file);
  assert.ok(html.includes('准备并执行模型前向计算。'));
  assert.ok(html.includes('forward'));
  assert.ok(html.includes('data-inspect-symbol="f.py#Runner"'));
  assert.ok(html.includes('data-owner-file="f.py"'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
});

test('historical explanations cannot navigate into a removed file', () => {
  const html = fileExplanationHtml(file, { historical: true });
  assert.ok(html.includes('基线版本'));
  assert.ok(!html.includes('data-inspect-symbol'));
  assert.ok(fileExplanationHtml({ id: 'old.py' }).includes('尚未包含功能说明'));
});
