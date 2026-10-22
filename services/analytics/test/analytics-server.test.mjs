import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { handleCollect, handleSession, handleStats, shanghaiDay } from '../lib/analytics.mjs';

const ORIGIN = 'https://keliangli.github.io';
const SITE_ORIGIN = 'https://infar-gpu-atlas.alert-grass-7728.chatgpt.site';
const NOW = Date.parse('2026-10-22T16:05:00.000Z');
const SECRET = 'test-only-secret-with-at-least-thirty-two-characters';

// Run the production SQL against SQLite, exposing only the small D1 API it uses.
function database(context) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE analytics_events (
    request_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, day TEXT NOT NULL,
    source TEXT NOT NULL, visitor_hash TEXT NOT NULL, event_type TEXT NOT NULL,
    route TEXT NOT NULL, model TEXT,
    CHECK (event_type IN ('page_view', 'model_select', 'story_start', 'story_complete'))
  );
  CREATE INDEX analytics_events_visitor_time_idx ON analytics_events(visitor_hash, created_at);`);
  context.after(() => sqlite.close());
  const db = {
    prepare(sql) {
      let parameters = [];
      return {
        bind(...values) { parameters = values; return this; },
        async run() {
          const result = sqlite.prepare(sql).run(...parameters);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
        async all() { return { success: true, results: sqlite.prepare(sql).all(...parameters) }; },
      };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.all())); },
  };
  return { sqlite, env: { DB: db, ANALYTICS_HASH_SECRET: SECRET } };
}

function post(path, body, { origin = ORIGIN, token, headers = {} } = {}) {
  return new Request(`https://collector.example${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin === null ? {} : { Origin: origin }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function event(overrides = {}) {
  return { requestId: randomUUID(), visitorId: randomUUID(), event: 'page_view', route: '/gpus', ...overrides };
}

async function session(env, visitorId, { origin = ORIGIN, now = NOW } = {}) {
  const result = await handleSession(post('/api/session', { visitorId }, { origin }), env, { now: () => now });
  assert.equal(result.status, 200);
  return result.json();
}

async function collect(env, body, { origin = ORIGIN, now = NOW, token } = {}) {
  const credential = token || (await session(env, body.visitorId, { origin, now })).token;
  return handleCollect(post('/api/collect', body, { origin, token: credential }), env, { now: () => now });
}

test('signed credential expires in one hour; duplicate request IDs add exactly one page view', async (context) => {
  const { env, sqlite } = database(context);
  const body = event();
  const credential = await session(env, body.visitorId);
  assert.equal(credential.expiresAt, NOW + 3_600_000);
  assert.equal((await collect(env, body, credential)).status, 202);
  assert.equal((await collect(env, body, credential)).status, 202);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n, 1);
});

test('collection requires an approved Origin, with localhost enabled only by the explicit test flag', async (context) => {
  const { env, sqlite } = database(context);
  const body = event();
  for (const origin of [null, 'null', 'https://evil.example', 'http://localhost:5190', 'https://keliangli.github.io.evil.example']) {
    const result = await handleSession(post('/api/session', { visitorId: body.visitorId }, { origin }), env);
    assert.equal(result.status, 403);
    assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
  }
  const localEnv = { ...env, ANALYTICS_LOCAL_TEST: '1' };
  assert.equal((await collect(localEnv, body, { origin: 'http://localhost:5190' })).status, 202);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n, 1);
});

test('preflight approves only POST with the two required headers', async () => {
  const make = (method, headerNames = 'content-type, authorization') => new Request('https://collector.example/api/collect', {
    method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': headerNames },
  });
  const valid = await handleCollect(make('POST'));
  assert.equal(valid.status, 204);
  assert.equal(valid.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(valid.headers.get('Vary'), 'Origin');
  assert.equal((await handleCollect(make('DELETE'))).status, 403);
  assert.equal((await handleCollect(make('POST', 'x-private-data'))).status, 403);
});

test('strict payload validation rejects unknown fields, private paths, searches and arbitrary model IDs', async (context) => {
  const { env, sqlite } = database(context);
  const invalid = [
    event({ visitorId: 'person@example.com' }), event({ requestId: 'not-a-uuid' }),
    event({ event: 'click', route: '/llm' }), event({ route: '/llm?search=secret' }),
    event({ route: '/pytorch/D:/private/source.py' }), event({ route: '/gpu/h20/private' }),
    event({ route: '/gpu/unknown' }), event({ model: 'h20' }), event({ referrer: 'https://private.example' }),
    event({ event: 'model_select', route: '/llm', model: 'private-model-name' }),
    event({ event: 'story_start', route: '/gpu/h20', model: 'h100' }),
    event({ event: 'story_start', route: '/gpu/h20', model: 'h20' }),
    event({ event: 'story_complete', route: '/gpu/h20', model: 'h20' }),
    event({ event: 'story_complete', route: '/pytorch', model: 'deepseek' }),
  ];
  for (const body of invalid) {
    const result = await handleCollect(post('/api/collect', body), env);
    assert.equal(result.status, 400, JSON.stringify(body));
  }
  const result = await handleSession(post('/api/session', { visitorId: randomUUID(), name: 'unwanted' }), env);
  assert.equal(result.status, 400);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n, 0);
});

test('2KB maximum is enforced on actual bytes and declared length; JSON is required', async (context) => {
  const { env } = database(context);
  assert.equal((await handleCollect(post('/api/collect', ' '.repeat(2049)), env)).status, 413);
  assert.equal((await handleCollect(post('/api/collect', event(), { headers: { 'Content-Length': '2049' } }), env)).status, 413);
  assert.equal((await handleCollect(post('/api/collect', event(), { headers: { 'Content-Type': 'text/plain' } }), env)).status, 415);
  assert.equal((await handleCollect(post('/api/collect', '{invalid'), env)).status, 400);
  assert.equal((await handleCollect(post('/api/collect', []), env)).status, 400);
});

test('missing, tampered, expired, visitor-mismatched and Origin-mismatched tokens cannot write', async (context) => {
  const { env, sqlite } = database(context);
  const body = event();
  const { token } = await session(env, body.visitorId);
  const missing = await handleCollect(post('/api/collect', body), env, { now: () => NOW });
  assert.equal(missing.status, 401);
  assert.equal((await collect(env, body, { token: `${token.slice(0, -8)}tampered` })).status, 401);
  assert.equal((await collect(env, { ...body, visitorId: randomUUID() }, { token })).status, 401);
  assert.equal((await collect(env, body, { token, origin: SITE_ORIGIN })).status, 401);
  assert.equal((await collect(env, body, { token, now: NOW + 3_600_000 })).status, 401);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n, 0);
});

test('SQLite enforces 120 events per visitor per rolling minute while duplicate retries stay successful', async (context) => {
  const { env, sqlite } = database(context);
  const body = event();
  const { token } = await session(env, body.visitorId);
  const attempts = Array.from({ length: 120 }, () => event({ visitorId: body.visitorId }));
  for (const attempt of attempts) assert.equal((await collect(env, attempt, { token })).status, 202);
  const blocked = await collect(env, body, { token });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('Retry-After'), '60');
  assert.equal((await collect(env, attempts[0], { token })).status, 202);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n, 120);
  assert.equal((await collect(env, body, { token, now: NOW + 60_001 })).status, 202);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n, 121);
});

test('stored identity is a stable HMAC scoped to Origin; raw visitor ID, IP and User-Agent never enter SQLite', async (context) => {
  const { env, sqlite } = database(context);
  const visitorId = randomUUID();
  const { token } = await session(env, visitorId);
  const result = await handleCollect(post('/api/collect', event({ visitorId }), { token,
    headers: { 'CF-Connecting-IP': '203.0.113.10', 'User-Agent': 'private-user-agent' } }), env, { now: () => NOW });
  assert.equal(result.status, 202);
  await collect(env, event({ visitorId }));
  await collect(env, event({ visitorId }), { origin: SITE_ORIGIN });
  const rows = sqlite.prepare('SELECT * FROM analytics_events ORDER BY rowid').all();
  assert.match(rows[0].visitor_hash, /^[a-f0-9]{64}$/);
  assert.equal(rows[0].visitor_hash, rows[1].visitor_hash);
  assert.notEqual(rows[0].visitor_hash, rows[2].visitor_hash);
  const stored = JSON.stringify(rows);
  for (const privateValue of [visitorId, '203.0.113.10', 'private-user-agent', SECRET]) assert.equal(stored.includes(privateValue), false);
});

test('empty database gives real zero aggregates and no fabricated first-visit timestamp', async (context) => {
  const { env } = database(context);
  const result = await handleStats(new Request('https://collector.example/api/stats'), env, { now: () => NOW });
  assert.equal(result.status, 200);
  const stats = await result.json();
  assert.deepEqual(stats.total, { visitors: 0, pageViews: 0 });
  assert.deepEqual(stats.today, { visitors: 0, pageViews: 0 });
  assert.equal(stats.firstRecordedAt, null);
  assert.equal(stats.trend.length, 30);
  assert.ok(stats.trend.every((day) => day.visitors === 0 && day.pageViews === 0));
  assert.deepEqual(stats.routes, []);
  assert.deepEqual(stats.models, []);
});

test('UV/PV, Shanghai day boundary, canonical routes and model interactions aggregate from actual stored events', async (context) => {
  const { env } = database(context);
  const first = randomUUID();
  const second = randomUUID();
  const yesterday = NOW - 10 * 60_000;
  assert.equal(shanghaiDay(yesterday), '2026-10-22');
  assert.equal(shanghaiDay(NOW), '2026-10-23');
  await collect(env, event({ visitorId: first }), { now: yesterday });
  await collect(env, event({ visitorId: first, route: '/llm' }));
  await collect(env, event({ visitorId: second, route: '/gpu/h20/package' }));
  await collect(env, event({ visitorId: first, route: '/llm' }));
  for (const type of ['model_select', 'story_start', 'story_complete']) {
    await collect(env, event({ visitorId: first, event: type, route: '/llm', model: 'deepseek-v4.1-flash' }));
  }
  await collect(env, event({ visitorId: second, event: 'model_select', route: '/gpu/h20', model: 'h20' }));
  const result = await handleStats(new Request('https://collector.example/api/stats', { headers: { Origin: ORIGIN } }), env, { now: () => NOW });
  const stats = await result.json();
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepEqual(stats.total, { visitors: 2, pageViews: 4 });
  assert.deepEqual(stats.today, { visitors: 2, pageViews: 3 });
  assert.deepEqual(stats.trend.at(-2), { day: '2026-10-22', visitors: 1, pageViews: 1 });
  assert.deepEqual(stats.trend.at(-1), { day: '2026-10-23', visitors: 2, pageViews: 3 });
  assert.deepEqual(stats.routes, [{ route: '/llm', pageViews: 2 }, { route: '/gpu/h20', pageViews: 1 }, { route: '/gpus', pageViews: 1 }]);
  assert.deepEqual(stats.models, [
    { model: 'deepseek-v4.1-flash', selections: 1, storyStarts: 1, storyCompletions: 1 },
    { model: 'h20', selections: 1, storyStarts: 0, storyCompletions: 0 },
  ]);
  assert.equal(stats.firstRecordedAt, new Date(yesterday).toISOString());
  assert.equal(stats.generatedAt, new Date(NOW).toISOString());
  assert.equal(stats.timezone, 'Asia/Shanghai');
  const exposed = JSON.stringify(stats);
  for (const privateValue of [first, second, 'visitor_hash', 'request_id']) assert.equal(exposed.includes(privateValue), false);
});

test('missing bindings and database errors fail safely without SQL, secrets or fake successful statistics', async (context) => {
  const { env } = database(context);
  const body = event();
  const { token } = await session(env, body.visitorId);
  const brokenDb = { prepare() { throw new Error(`SELECT secret FROM internal; ${SECRET}`); },
    async batch() { throw new Error(`D1 internal ${SECRET}`); } };
  const broken = { ...env, DB: brokenDb };
  for (const response of [
    await handleStats(new Request('https://collector.example/api/stats'), {}),
    await handleStats(new Request('https://collector.example/api/stats'), broken),
    await collect(broken, body, { token }),
    await handleSession(post('/api/session', { visitorId: body.visitorId }), {}),
  ]) {
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'analytics_unavailable' });
  }
});

test('popular routes and models use the same last-30-calendar-days interval as the trend', async (context) => {
  const { env } = database(context);
  const visitorId = randomUUID();
  const old = NOW - 30 * 86_400_000;
  await collect(env, event({ visitorId, route: '/pytorch' }), { now: old });
  await collect(env, event({ visitorId, event: 'model_select', route: '/llm', model: 'qwen' }), { now: old });
  await collect(env, event({ visitorId, route: '/llm' }));
  await collect(env, event({ visitorId, event: 'model_select', route: '/llm', model: 'deepseek' }));
  const result = await handleStats(new Request('https://collector.example/api/stats'), env, { now: () => NOW });
  const stats = await result.json();
  assert.deepEqual(stats.total, { visitors: 1, pageViews: 2 });
  assert.deepEqual(stats.routes, [{ route: '/llm', pageViews: 1 }]);
  assert.deepEqual(stats.models, [{ model: 'deepseek', selections: 1, storyStarts: 0, storyCompletions: 0 }]);
  assert.equal(stats.trend.reduce((sum, day) => sum + day.pageViews, 0), 1);
  assert.equal(stats.firstRecordedAt, new Date(old).toISOString());
});
