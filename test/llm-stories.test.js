import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCH_PRESETS, normalizeLlmConfig } from '../src/llm/data.js';
import { getLlmLayer } from '../src/llm/models.js';
import { createLlmStory, StoryPlayer } from '../src/llm/stories.js';

const story = key => createLlmStory(normalizeLlmConfig(ARCH_PRESETS[key]));

test('closed preview has no invented internal chapters; all disclosed profiles have valid distinct chapters', () => {
  assert.deepEqual(story('kimi-k2.8').chapters, []);
  for (const [key, preset] of Object.entries(ARCH_PRESETS)) {
    const chapters = story(key).chapters;
    if (preset.availability === 'preview') continue;
    assert.ok(chapters.length >= 5, key);
    assert.equal(new Set(chapters.map(ch => ch.id)).size, chapters.length);
    for (const ch of chapters) {
      assert.ok(ch.title && ch.question && ch.body && ch.metric, `${key}/${ch.id}`);
      assert.ok(ch.layer >= 0 && ch.layer < preset.num_layers, `${key}/${ch.id}`);
      assert.ok([1, 2, 3].includes(ch.lod));
      assert.ok(Number.isFinite(ch.duration) && ch.duration > 0);
    }
  }
});

test('CSA2 cache chapters focus actual Full, Reindex, and Reuse layers', () => {
  const cfg = normalizeLlmConfig(ARCH_PRESETS['deepseek-v4.1-flash']);
  const chapters = createLlmStory(cfg).chapters;
  for (const [id, mode] of [['cache-full', 'Full'], ['cache-reindex', 'Reindex'], ['cache-reuse', 'Reuse']]) {
    const chapter = chapters.find(ch => ch.id === id);
    assert.equal(getLlmLayer(cfg, chapter.layer).attention, 'csa2');
    assert.equal(getLlmLayer(cfg, chapter.layer).indexer, mode);
    assert.deepEqual(chapter.nodeIds, ['csa_cache', 'indexer']);
  }
  assert.match(chapters.find(ch => ch.id === 'experts').metric, /Top-6 \/ 384 · 1 共享/);
});

test('hybrid stories visit real recurrent and attention layers and use model-specific expert counts', () => {
  for (const [key, recurrent, attention] of [['kimi-k3', 'kda', 'mla'], ['glm-5.3-flash', 'kda', 'dsa'], ['hybrid', 'ssm', 'gqa']]) {
    const c = normalizeLlmConfig(ARCH_PRESETS[key]);
    const chapters = createLlmStory(c).chapters;
    assert.equal(getLlmLayer(c, chapters.find(ch => ch.id === 'state').layer).attention, recurrent);
    assert.equal(getLlmLayer(c, chapters.find(ch => ch.id === 'context').layer).attention, attention);
    assert.equal(chapters.find(ch => ch.id === 'experts').metric, `Top-${c.num_experts_per_tok} / ${c.n_routed_experts} · ${c.n_shared_experts} 共享`);
  }
  assert.match(story('kimi-k3').chapters.find(ch => ch.id === 'residual').body, /AttnRes/);
  assert.match(story('glm-5.3-flash').chapters.find(ch => ch.id === 'context').body, /没有 RoPE/);
});

test('dense and shared-index chapters select eligible layers instead of borrowing MoE behavior', () => {
  const cfg = normalizeLlmConfig(ARCH_PRESETS['glm-5.3']);
  const chapters = createLlmStory(cfg).chapters;
  assert.equal(getLlmLayer(cfg, chapters.find(ch => ch.id === 'dense').layer).dense, true);
  assert.equal(getLlmLayer(cfg, chapters.find(ch => ch.id === 'experts').layer).dense, false);
  assert.equal(getLlmLayer(cfg, chapters.find(ch => ch.id === 'index-share').layer).indexer, 'shared');
  assert.equal(story('qwen').chapters.some(ch => ch.id === 'experts'), false);
  assert.ok(story('qwen').chapters.some(ch => ch.id === 'dense'));
});

test('story transport crosses chapters, pauses, clamps seeks, finishes, and replays deterministically', () => {
  const p = new StoryPlayer([{ duration: 2 }, { duration: 3 }, { duration: 4 }]);
  p.play();
  assert.deepEqual(p.tick(2), { index: 1, playing: true, elapsed: 2, chapterElapsed: 0, completed: false });
  p.pause();
  assert.equal(p.tick(10).elapsed, 2);
  assert.equal(p.seek(100).elapsed, 5);
  assert.equal(p.seek(-1).elapsed, 0);
  p.play();
  assert.deepEqual(p.tick(100), { index: 2, playing: false, elapsed: 9, chapterElapsed: 4, completed: true });
  assert.equal(p.play().elapsed, 0);
  p.tick(1);
  const previous = p.snapshot();
  assert.deepEqual(p.tick(-10), previous);
  assert.deepEqual(p.tick(Infinity), previous);
  assert.deepEqual(p.tick(NaN), previous);
  assert.equal(p.seek(NaN).elapsed, 0);
  p.setChapters([]);
  assert.deepEqual(p.play(), { index: 0, playing: false, elapsed: 0, chapterElapsed: 0, completed: false });
});
