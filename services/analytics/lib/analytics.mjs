const PRODUCTION_ORIGINS = new Set([
  'https://keliangli.github.io',
  'https://infar-gpu-atlas.alert-grass-7728.chatgpt.site',
]);
export const GPU_IDS = Object.freeze([
  'h20', 'h200', 'h100', 'h800', 'rtx-pro-5000', 'rtx-6000d',
  'rtx-5090d', 'a100', 'a40', 'ascend-910b4', 'ascend-910c',
]);
export const LLM_IDS = Object.freeze([
  'deepseek-v4.1-flash', 'glm-5.3', 'kimi-k3', 'kimi-k2.8',
  'glm-5.3-flash', 'deepseek', 'qwen', 'hybrid',
]);
const GPU_LEVELS = new Set(['package', 'die', 'sm', 'shared', 'registers', 'warp']);
const GPU_SET = new Set(GPU_IDS);
const LLM_SET = new Set(LLM_IDS);
const EVENTS = new Set(['page_view', 'model_select', 'story_start', 'story_complete']);
const TOP_ROUTES = new Set(['/gpus', '/llm', '/pytorch', '/sglang', '/deepinfer']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BODY_LIMIT = 2048;
const TOKEN_LIFETIME_SECONDS = 3600;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function isLocalOrigin(origin) {
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && url.origin === origin;
  } catch { return false; }
}

function permittedOrigin(request, env, allowSameOrigin = false) {
  const origin = request.headers.get('Origin');
  if (!origin) return allowSameOrigin ? '' : null;
  if (PRODUCTION_ORIGINS.has(origin)) return origin;
  if (env.ANALYTICS_LOCAL_TEST === '1' && isLocalOrigin(origin)) return origin;
  if (allowSameOrigin && origin === new URL(request.url).origin) return origin;
  return null;
}

function headers(origin, preflight = false) {
  const result = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  };
  if (origin) result['Access-Control-Allow-Origin'] = origin;
  if (preflight) {
    result['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    result['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    result['Access-Control-Max-Age'] = '600';
  }
  return result;
}

function response(status, data, origin, extraHeaders = {}) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status, headers: { ...headers(origin), ...extraHeaders },
  });
}

function preflight(request, env) {
  const origin = permittedOrigin(request, env);
  if (origin === null) return response(403, { error: 'origin_not_allowed' });
  const method = request.headers.get('Access-Control-Request-Method');
  const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (method !== 'POST' || requestedHeaders.some((value) => !['content-type', 'authorization'].includes(value))) {
    return response(403, { error: 'preflight_not_allowed' }, origin);
  }
  return new Response(null, { status: 204, headers: headers(origin, true) });
}

class InputError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    throw new InputError(415, 'json_required');
  }
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > BODY_LIMIT)) {
    throw new InputError(413, 'body_too_large');
  }
  if (!request.body) throw new InputError(400, 'invalid_payload');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        await reader.cancel().catch(() => {});
        throw new InputError(413, 'body_too_large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(decoder.decode(bytes)); }
  catch { throw new InputError(400, 'invalid_payload'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError(400, 'invalid_payload');
  return body;
}

function onlyKeys(body, allowed) {
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new InputError(400, 'invalid_payload');
}

function visitorId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new InputError(400, 'invalid_payload');
  return value.toLowerCase();
}

function validateEvent(body) {
  onlyKeys(body, ['requestId', 'visitorId', 'event', 'route', 'model']);
  const requestId = visitorId(body.requestId);
  const visitor = visitorId(body.visitorId);
  if (!EVENTS.has(body.event) || typeof body.route !== 'string') throw new InputError(400, 'invalid_payload');
  const match = /^\/gpu\/([^/]+)(?:\/([^/]+))?$/.exec(body.route);
  const isGpuRoute = match && GPU_SET.has(match[1]) && (!match[2] || GPU_LEVELS.has(match[2]));
  if (!TOP_ROUTES.has(body.route) && !isGpuRoute) throw new InputError(400, 'invalid_payload');
  const route = isGpuRoute && match[2] === 'package' ? `/gpu/${match[1]}` : body.route;
  if (body.event === 'page_view') {
    if (Object.hasOwn(body, 'model')) throw new InputError(400, 'invalid_payload');
    return { requestId, visitorId: visitor, event: body.event, route, model: null };
  }
  // Only static product IDs: no source paths, titles, searches, or configuration text.
  const validModel = route === '/llm' ? LLM_SET.has(body.model)
    : body.event === 'model_select' && isGpuRoute && body.model === match[1];
  if (!validModel) throw new InputError(400, 'invalid_payload');
  return { requestId, visitorId: visitor, event: body.event, route, model: body.model };
}

function requireSecret(env) {
  if (typeof env.ANALYTICS_HASH_SECRET !== 'string' || env.ANALYTICS_HASH_SECRET.length < 32) throw new Error('analytics_unavailable');
  return env.ANALYTICS_HASH_SECRET;
}

async function signingKey(secret, crypto) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function visitorHash(key, origin, visitor, crypto) {
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`visitor\0${origin}\0${visitor}`));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64url(bytes) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid_token');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
}

async function verifyToken(request, key, origin, hash, now, crypto) {
  const authorization = request.headers.get('Authorization') || '';
  if (authorization.length > 768 || !authorization.startsWith('Bearer ')) return false;
  const token = authorization.slice(7).split('.');
  if (token.length !== 2) return false;
  try {
    const validSignature = await crypto.subtle.verify('HMAC', key, fromBase64url(token[1]), encoder.encode(`session\0${token[0]}`));
    if (!validSignature) return false;
    const payload = JSON.parse(decoder.decode(fromBase64url(token[0])));
    return payload?.v === 1 && payload.origin === origin && payload.visitorHash === hash
      && Number.isSafeInteger(payload.exp) && payload.exp > Math.floor(now / 1000)
      && payload.exp <= Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS;
  } catch { return false; }
}

function clock(options) {
  const now = options.now ? options.now() : Date.now();
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('analytics_unavailable');
  return now;
}

export function shanghaiDay(timestamp) {
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function handleSession(request, env = {}, options = {}) {
  if (request.method === 'OPTIONS') return preflight(request, env);
  const origin = permittedOrigin(request, env);
  if (origin === null) return response(403, { error: 'origin_not_allowed' });
  if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' }, origin, { Allow: 'POST, OPTIONS' });
  try {
    const body = await readJson(request);
    onlyKeys(body, ['visitorId']);
    const visitor = visitorId(body.visitorId);
    const crypto = options.crypto || globalThis.crypto;
    const key = await signingKey(requireSecret(env), crypto);
    const now = clock(options);
    const exp = Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS;
    const hash = await visitorHash(key, origin, visitor, crypto);
    const payload = base64url(encoder.encode(JSON.stringify({ v: 1, exp, origin, visitorHash: hash })));
    const signature = base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`session\0${payload}`))));
    return response(200, { token: `${payload}.${signature}`, expiresAt: exp * 1000 }, origin);
  } catch (error) {
    return response(error instanceof InputError ? error.status : 503,
      { error: error instanceof InputError ? error.code : 'analytics_unavailable' }, origin);
  }
}

export async function handleCollect(request, env = {}, options = {}) {
  if (request.method === 'OPTIONS') return preflight(request, env);
  const origin = permittedOrigin(request, env);
  if (origin === null) return response(403, { error: 'origin_not_allowed' });
  if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' }, origin, { Allow: 'POST, OPTIONS' });
  try {
    const event = validateEvent(await readJson(request));
    const crypto = options.crypto || globalThis.crypto;
    const key = await signingKey(requireSecret(env), crypto);
    const hash = await visitorHash(key, origin, event.visitorId, crypto);
    const now = clock(options);
    if (!await verifyToken(request, key, origin, hash, now, crypto)) return response(401, { error: 'invalid_token' }, origin);
    if (!env.DB) throw new Error('analytics_unavailable');
    // The rate count and write are one SQLite statement, including concurrent requests.
    const result = await env.DB.prepare(`INSERT OR IGNORE INTO analytics_events
      (request_id, created_at, day, source, visitor_hash, event_type, route, model)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM analytics_events WHERE visitor_hash = ? AND created_at >= ?) < 120`)
      .bind(event.requestId, now, shanghaiDay(now), origin, hash, event.event, event.route, event.model, hash, now - 60_000).run();
    if (result.success === false || !result.meta || typeof result.meta.changes !== 'number') throw new Error('analytics_unavailable');
    if (result.meta.changes === 0) {
      const existing = await env.DB.prepare('SELECT request_id FROM analytics_events WHERE request_id = ?').bind(event.requestId).all();
      if (existing.success === false) throw new Error('analytics_unavailable');
      if (!existing.results?.length) return response(429, { error: 'rate_limited' }, origin, { 'Retry-After': '60' });
    }
    return response(202, { ok: true }, origin);
  } catch (error) {
    return response(error instanceof InputError ? error.status : 503,
      { error: error instanceof InputError ? error.code : 'analytics_unavailable' }, origin);
  }
}

function number(value) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) throw new Error('analytics_unavailable');
  return numeric;
}

export async function handleStats(request, env = {}, options = {}) {
  const origin = permittedOrigin(request, env, true);
  if (origin === null) return response(403, { error: 'origin_not_allowed' });
  if (request.method !== 'GET') return response(405, { error: 'method_not_allowed' }, origin, { Allow: 'GET' });
  try {
    if (!env.DB) throw new Error('analytics_unavailable');
    const now = clock(options);
    const today = shanghaiDay(now);
    const firstDay = shanghaiDay(now - 29 * 86_400_000);
    const results = await env.DB.batch([
      env.DB.prepare(`SELECT COUNT(CASE WHEN event_type = 'page_view' THEN 1 END) AS pageViews,
        COUNT(DISTINCT CASE WHEN event_type = 'page_view' THEN visitor_hash END) AS visitors,
        COUNT(CASE WHEN event_type = 'page_view' AND day = ? THEN 1 END) AS todayPageViews,
        COUNT(DISTINCT CASE WHEN event_type = 'page_view' AND day = ? THEN visitor_hash END) AS todayVisitors,
        MIN(created_at) AS firstRecordedAt FROM analytics_events`).bind(today, today),
      env.DB.prepare(`SELECT day, COUNT(*) AS pageViews, COUNT(DISTINCT visitor_hash) AS visitors
        FROM analytics_events WHERE event_type = 'page_view' AND day >= ? AND day <= ?
        GROUP BY day ORDER BY day`).bind(firstDay, today),
      env.DB.prepare(`SELECT route, COUNT(*) AS pageViews FROM analytics_events
        WHERE event_type = 'page_view' AND day >= ? AND day <= ?
        GROUP BY route ORDER BY pageViews DESC, route ASC`).bind(firstDay, today),
      env.DB.prepare(`SELECT model,
        COUNT(CASE WHEN event_type = 'model_select' THEN 1 END) AS selections,
        COUNT(CASE WHEN event_type = 'story_start' THEN 1 END) AS storyStarts,
        COUNT(CASE WHEN event_type = 'story_complete' THEN 1 END) AS storyCompletions
        FROM analytics_events WHERE model IS NOT NULL AND day >= ? AND day <= ? GROUP BY model
        ORDER BY COUNT(*) DESC, model ASC`).bind(firstDay, today),
    ]);
    if (results.length !== 4 || results.some((item) => item.success === false || !Array.isArray(item.results))) throw new Error('analytics_unavailable');
    const total = results[0].results[0];
    if (!total) throw new Error('analytics_unavailable');
    const days = new Map(results[1].results.map((row) => [row.day, row]));
    const trend = Array.from({ length: 30 }, (_, index) => {
      const day = shanghaiDay(now - (29 - index) * 86_400_000);
      const row = days.get(day);
      return { day, visitors: row ? number(row.visitors) : 0, pageViews: row ? number(row.pageViews) : 0 };
    });
    return response(200, {
      total: { visitors: number(total.visitors), pageViews: number(total.pageViews) },
      today: { visitors: number(total.todayVisitors), pageViews: number(total.todayPageViews) },
      trend,
      routes: results[2].results.map((row) => ({ route: row.route, pageViews: number(row.pageViews) })),
      models: results[3].results.map((row) => ({ model: row.model, selections: number(row.selections), storyStarts: number(row.storyStarts), storyCompletions: number(row.storyCompletions) })),
      firstRecordedAt: total.firstRecordedAt === null ? null : new Date(number(total.firstRecordedAt)).toISOString(),
      generatedAt: new Date(now).toISOString(),
      timezone: 'Asia/Shanghai',
    }, origin);
  } catch { return response(503, { error: 'analytics_unavailable' }, origin); }
}
