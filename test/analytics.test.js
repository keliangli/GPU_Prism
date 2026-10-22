import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createAnalytics, canonicalAnalyticsRoute, analyticsConfigUrl } from '../src/analytics.js';

const origin = 'https://gpu-prism-analytics.alert-grass-7728.chatgpt.site';
const config = { enabled: true, endpoint: `${origin}/api/collect`, allowedHosts: ['keliangli.github.io'] };
const json = (value, status = 200) => Response.json(value, { status });
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };

function fixture(overrides = {}) {
  const requests = [], storage = new Map();
  const location = { protocol: 'https:', hostname: 'keliangli.github.io', hash: '#/llm' };
  const navigator = {};
  const tracker = createAnalytics({
    location, navigator, crypto: webcrypto, baseUrl: '/GPU_Prism/',
    storage: () => ({ getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }),
    pause: async () => {},
    fetch: async (url, options) => {
      requests.push({ url, options, body: options?.body ? JSON.parse(options.body) : undefined });
      if (url.endsWith('analytics-config.json')) return json(overrides.config ?? config);
      if (url.endsWith('/api/session')) return json({ token: 'signed-short-lived-token', expiresAt: Date.now() + 3600000 });
      return json({ accepted: true });
    },
    ...overrides,
  });
  return { tracker, requests, storage, location, navigator, events: () => requests.filter(item => item.url.endsWith('/api/collect')) };
}

test('canonical routes discard queries and source paths and reject unknown catalog data', () => {
  assert.equal(canonicalAnalyticsRoute('#/pytorch/torch/secret.py?search=private'), '/pytorch');
  assert.equal(canonicalAnalyticsRoute('#/sglang/runtime/local-path'), '/sglang');
  assert.equal(canonicalAnalyticsRoute('#/gpu/h20/package?private=value'), '/gpu/h20');
  assert.equal(canonicalAnalyticsRoute('#/gpu/h20/shared'), '/gpu/h20/shared');
  assert.equal(canonicalAnalyticsRoute('#/gpu/unpublished-id'), null);
  assert.equal(canonicalAnalyticsRoute('#/gpu/h20/arbitrary'), null);
  assert.equal(canonicalAnalyticsRoute('#/private-content'), null);
  assert.equal(canonicalAnalyticsRoute(''), '/gpus');
});

test('configuration resolves under the GitHub Pages base path', async () => {
  assert.equal(analyticsConfigUrl('/GPU_Prism/'), '/GPU_Prism/analytics-config.json');
  assert.equal(analyticsConfigUrl('/GPU_Prism'), '/GPU_Prism/analytics-config.json');
  const f = fixture();
  await f.tracker.start(); await settle();
  assert.equal(f.requests[0].url, '/GPU_Prism/analytics-config.json');
  assert.equal(f.events().length, 1);
  assert.equal(f.events()[0].options.credentials, 'omit');
  assert.equal(f.events()[0].options.referrerPolicy, 'no-referrer');
  assert.match(f.events()[0].options.headers.Authorization, /^Bearer /);
});

test('initial page view and same-route navigation dedupe, returning to a page counts again', async () => {
  const f = fixture();
  await f.tracker.start(); await f.tracker.start(); await settle();
  assert.equal(f.tracker.trackPageView('#/llm?search=anything'), false);
  assert.equal(f.tracker.trackPageView('#/gpu/h20'), true);
  assert.equal(f.tracker.trackPageView('#/llm'), true);
  await settle();
  assert.deepEqual(f.events().map(item => item.body.route), ['/llm', '/gpu/h20', '/llm']);
  assert.equal(new Set(f.events().map(item => item.body.visitorId)).size, 1);
});

test('disabled configuration, local previews and privacy preferences never collect', async () => {
  for (const options of [
    { config: { ...config, enabled: false } },
    { dev: true },
    { location: { protocol: 'http:', hostname: '127.0.0.1', hash: '#/llm' } },
    { location: { protocol: 'https:', hostname: 'unapproved.example', hash: '#/llm' } },
    { navigator: { doNotTrack: '1' } },
    { navigator: { globalPrivacyControl: true } },
  ]) {
    const f = fixture(options);
    assert.equal(await f.tracker.start(), false);
    assert.equal(f.tracker.trackEvent('story_start', { model: 'deepseek' }), false);
    assert.equal(f.tracker.dashboardUrl(), null);
    assert.equal(f.events().length, 0);
  }
});

test('only finite catalog events are sent and no caller-provided properties leak', async () => {
  const f = fixture();
  await f.tracker.start(); await settle();
  assert.equal(f.tracker.trackEvent('model_select', { model: 'glm-5.3', query: 'secret', path: 'D:\\code\\private' }), true);
  assert.equal(f.tracker.trackEvent('search', { query: 'secret' }), false);
  assert.equal(f.tracker.trackEvent('model_select', { model: 'private custom model' }), false);
  assert.equal(f.tracker.trackEvent('story_start', { model: 'h20' }), false);
  assert.equal(f.tracker.trackEvent('story_start', { route: '/gpu/h20', model: 'deepseek' }), false);
  await settle();
  const event = f.events().at(-1).body;
  assert.deepEqual(Object.keys(event).sort(), ['event','model','requestId','route','visitorId']);
  assert.equal(event.model, 'glm-5.3');
  assert.ok(!JSON.stringify(event).includes('secret'));
});

test('blocked browser storage uses a memory identifier and tracking failure stays isolated', async () => {
  const f = fixture({ storage: () => { throw new Error('blocked'); } });
  assert.equal(await f.tracker.start(), true);
  await settle();
  assert.equal(f.tracker.trackEvent('story_start', { model: 'deepseek' }), true);
  await settle();
  assert.equal(f.events()[0].body.visitorId, f.events()[1].body.visitorId);
  const offline = fixture({ fetch: async () => { throw new Error('offline'); } });
  assert.equal(await offline.tracker.start(), false);
  assert.equal(offline.tracker.trackPageView(), false);
});

test('an expired credential refreshes once and retries with the original request ID', async () => {
  const collected = [], tokens = [];
  const f = fixture({ fetch: async (url, options) => {
    if (url.endsWith('analytics-config.json')) return json(config);
    if (url.endsWith('/api/session')) { tokens.push(true); return json({ token: `token-${tokens.length}`, expiresAt: Date.now() + 3600000 }); }
    collected.push({ body: JSON.parse(options.body), token: options.headers.Authorization });
    return json({}, collected.length === 1 ? 401 : 200);
  } });
  assert.equal(await f.tracker.start(), true); await settle();
  assert.equal(tokens.length, 2);
  assert.equal(collected.length, 2);
  assert.equal(collected[0].body.requestId, collected[1].body.requestId);
  assert.equal(collected[1].token, 'Bearer token-2');
});

test('collector failures retry at most once and the queue remains bounded', async () => {
  let release, collectCalls = 0;
  const first = new Promise(resolve => { release = resolve; });
  const f = fixture({ fetch: async (url) => {
    if (url.endsWith('analytics-config.json')) return json(config);
    if (url.endsWith('/api/session')) return json({ token: 'token', expiresAt: Date.now() + 3600000 });
    collectCalls++;
    if (collectCalls === 1) await first;
    return json({}, 503);
  } });
  await f.tracker.start(); await settle();
  const accepted = Array.from({ length: 100 }, () => f.tracker.trackEvent('story_start', { model: 'deepseek' })).filter(Boolean).length;
  assert.equal(accepted, 24);
  release(); await settle();
  assert.equal(collectCalls, 50);
});
