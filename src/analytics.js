// Only catalog identifiers leave the browser; search text and source paths never do.
const GPU_IDS = new Set(['h20','h200','h100','h800','rtx-pro-5000','rtx-6000d','rtx-5090d','a100','a40','ascend-910b4','ascend-910c']);
const GPU_LEVELS = new Set(['package','die','sm','shared','registers','warp']);
const LLM_IDS = new Set(['deepseek-v4.1-flash','glm-5.3','kimi-k3','kimi-k2.8','glm-5.3-flash','deepseek','qwen','hybrid']);
const EVENTS = new Set(['page_view','model_select','story_start','story_complete']);
const HOSTS = new Set(['keliangli.github.io','infar-gpu-atlas.alert-grass-7728.chatgpt.site']);
const COLLECTOR_ORIGIN = 'https://gpu-prism-analytics.alert-grass-7728.chatgpt.site';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VISITOR_KEY = 'gpu-prism:anonymous-visitor:v1';

export function canonicalAnalyticsRoute(hash = '') {
  // Strip parameters before inspecting known paths, without decoding arbitrary content.
  const path = String(hash).replace(/^#/, '').split(/[?&]/, 1)[0].replace(/\/+$/, '') || '/gpus';
  if (path === '/gpus') return path;
  const section = /^\/(llm|pytorch|sglang|deepinfer)(?:\/|$)/.exec(path);
  if (section) return `/${section[1]}`;
  const gpu = /^\/gpu\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (gpu && GPU_IDS.has(gpu[1]) && (!gpu[2] || GPU_LEVELS.has(gpu[2]))) {
    return `/gpu/${gpu[1]}${gpu[2] && gpu[2] !== 'package' ? `/${gpu[2]}` : ''}`;
  }
  return null;
}

export function analyticsConfigUrl(baseUrl = '/') {
  return `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}analytics-config.json`;
}

export function createAnalytics({
  location = globalThis.location,
  navigator = globalThis.navigator,
  fetch = globalThis.fetch?.bind(globalThis),
  crypto = globalThis.crypto,
  storage = () => globalThis.localStorage,
  baseUrl = '/',
  dev = false,
  now = () => Date.now(),
  pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
} = {}) {
  let enabled = false, endpoint = '', visitorId = '', lastRoute = null, initialization;
  let token = null, draining = false;
  const queue = [];

  function optedOut() {
    return navigator?.globalPrivacyControl === true || [navigator?.doNotTrack, globalThis.doNotTrack].some(value => value === '1' || value === 'yes');
  }

  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try { return await fetch(url, { ...options, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
    finally { clearTimeout(timeout); }
  }

  async function credential(force = false) {
    if (!force && token && token.expiresAt > now() + 5000) return token.token;
    token = null;
    const response = await request(`${COLLECTOR_ORIGIN}/api/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId }),
    });
    if (!response.ok) throw new Error('Analytics session unavailable');
    const value = await response.json();
    if (typeof value.token !== 'string' || !Number.isFinite(value.expiresAt) || value.expiresAt <= now()) throw new Error('Invalid analytics session');
    token = value;
    return value.token;
  }

  async function drain() {
    if (draining || !enabled) return;
    draining = true;
    try {
      while (queue.length && enabled) {
        if (optedOut()) { queue.length = 0; token = null; break; }
        const body = queue.shift();
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const authorization = await credential();
            const response = await request(endpoint, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorization}` },
              body: JSON.stringify(body), keepalive: true,
            });
            if (response.ok) break;
            if (response.status === 401) token = null;
            else if (response.status < 500) break;
          } catch { /* Analytics is optional and must never interrupt the explorer. */ }
          if (attempt === 0) await pause(750);
        }
      }
    } finally { draining = false; }
  }

  function trackEvent(event, data = {}) {
    if (!enabled || optedOut() || !EVENTS.has(event) || queue.length >= 24) return false;
    const route = canonicalAnalyticsRoute(data.route ?? location?.hash);
    if (!route) return false;
    const body = { requestId: crypto.randomUUID(), visitorId, event, route };
    if (event !== 'page_view') {
      const model = data.model;
      if (typeof model !== 'string' || !(GPU_IDS.has(model) || LLM_IDS.has(model))) return false;
      if (event.startsWith('story_') && (route !== '/llm' || !LLM_IDS.has(model))) return false;
      const gpuRoute = `/gpu/${model}`;
      if (event === 'model_select' && !(route === '/llm' && LLM_IDS.has(model)) && route !== gpuRoute && !route.startsWith(`${gpuRoute}/`)) return false;
      body.model = model;
    }
    queue.push(body);
    void drain();
    return true;
  }

  function trackPageView(hash = location?.hash) {
    if (!enabled) return false;
    const route = canonicalAnalyticsRoute(hash);
    if (!route || route === lastRoute) return false;
    if (!trackEvent('page_view', { route })) return false;
    lastRoute = route;
    return true;
  }

  function start() {
    if (initialization) return initialization;
    initialization = (async () => {
      if (dev || location?.protocol !== 'https:' || !HOSTS.has(location.hostname) || optedOut() || !fetch || !crypto?.randomUUID) return false;
      try {
        const response = await request(analyticsConfigUrl(baseUrl), { cache: 'no-store' });
        if (!response.ok) return false;
        const config = await response.json();
        if (config.enabled !== true || !Array.isArray(config.allowedHosts) || !config.allowedHosts.includes(location.hostname) || optedOut()) return false;
        const parsed = new URL(config.endpoint);
        if (parsed.href !== `${COLLECTOR_ORIGIN}/api/collect`) return false;
        endpoint = parsed.href;
        try { visitorId = storage()?.getItem(VISITOR_KEY) ?? ''; } catch { /* Memory identifier if storage is blocked. */ }
        if (!UUID.test(visitorId)) {
          visitorId = crypto.randomUUID();
          try { storage()?.setItem(VISITOR_KEY, visitorId); } catch { /* No persistence is required for navigation. */ }
        }
        enabled = true;
        trackPageView();
        return true;
      } catch { return false; }
    })();
    return initialization;
  }

  return { start, trackEvent, trackPageView, dashboardUrl: () => enabled && !optedOut() ? `${COLLECTOR_ORIGIN}/` : null };
}

const analytics = createAnalytics({ baseUrl: import.meta.env?.BASE_URL ?? '/', dev: import.meta.env?.DEV === true });
export const initializeAnalytics = () => analytics.start();
export const trackEvent = (event, data) => analytics.trackEvent(event, data);
export const trackPageView = hash => analytics.trackPageView(hash);
export const analyticsDashboardUrl = () => analytics.dashboardUrl();
