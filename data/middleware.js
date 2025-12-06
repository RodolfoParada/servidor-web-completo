// data/middleware.js
const fs = require('fs');
const path = require('path');
const { parseMultipart } = require('./multipart'); // helper abajo

// Ruta del log fuera de data (raíz/logs/server.log)
const LOG_PATH = path.join(__dirname, '..', 'logs', 'server.log');

// === Logger ===
async function logger(ctx) {
  try {
    const fecha = new Date().toISOString();
    const line = `${fecha} ${ctx.request.method} ${ctx.request.url}\n`;
    fs.appendFileSync(LOG_PATH, line);
  } catch (e) {
    // no bloquear si falla logging
    console.error('Logger error:', e);
  }
  // continue
  return 'next';
}

// === Body parser simple (JSON y urlencoded) ===
async function bodyParser(ctx) {
  const req = ctx.request;
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const ct = req.headers['content-type'] || '';
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const raw = Buffer.concat(chunks);

    if (ct.includes('application/json')) {
      try { ctx.body = JSON.parse(raw.toString()); } catch { ctx.body = raw.toString(); }
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      const s = raw.toString();
      ctx.body = Object.fromEntries(new URLSearchParams(s));
    } else if (ct.includes('multipart/form-data')) {
      // leave to upload middleware if used
      ctx._rawBody = raw;
    } else {
      ctx.body = raw.toString();
    }
  }
  return 'next';
}

// === Session middleware (cookie-based, in-memory store) ===
const sessions = new Map(); // sessionId -> { user, created, lastActive }
function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
async function session(ctx) {
  const req = ctx.request;
  const cookie = (req.headers.cookie || '').split(';').map(c => c.trim());
  const sessionCookie = cookie.find(c => c.startsWith('session='));
  let sid = null;
  if (sessionCookie) sid = sessionCookie.split('=')[1];

  if (sid && sessions.has(sid)) {
    const data = sessions.get(sid);
    data.lastActive = Date.now();
    ctx.session = data;
  } else {
    // crear sesion vacía
    sid = genId();
    const data = { id: sid, created: Date.now(), lastActive: Date.now(), user: null };
    sessions.set(sid, data);
    // enviar cookie
    ctx.response.setHeader('Set-Cookie', `session=${sid}; Path=/; HttpOnly`);
    ctx.session = data;
  }

  ctx.setSession = (userObj) => {
    ctx.session.user = userObj;
    sessions.set(ctx.session.id, ctx.session);
  };

  ctx.destroySession = () => {
    sessions.delete(ctx.session.id);
    ctx.response.setHeader('Set-Cookie', `session=; Path=/; HttpOnly; Max-Age=0`);
  };

  return 'next';
}

// === Simple cache middleware para GETs de /api y endpoints JSON ===
const cacheStore = new Map(); // key -> { data, type, ts }
const CACHE_TTL = 1000 * 60 * 5; // 5 min
async function cache(ctx) {
  if (ctx.request.method !== 'GET') return 'next';
  // solo cachear APIs (decisión) o cualquier ruta que empiece por /api
  if (!ctx.request.url.startsWith('/api')) return 'next';

  const key = ctx.request.url;
  const entry = cacheStore.get(key);
  if (entry && (Date.now() - entry.ts) < CACHE_TTL) {
    ctx.response.writeHead(200, { 'Content-Type': entry.type });
    ctx.response.end(entry.data);
    return; // stop chain
  }

  // envolver end para guardar en cache
  const originalEnd = ctx.response.end.bind(ctx.response);
  ctx.response.end = (data) => {
    try {
      cacheStore.set(key, { data, type: ctx.response.getHeader('Content-Type') || 'application/json', ts: Date.now() });
    } catch (e) { /* ignore */ }
    originalEnd(data);
  };

  return 'next';
}

// === Metrics middleware (contador y timing) ===
const metrics = {
  requests: 0,
  routes: {},
  timings: {}
};
async function metricsMiddleware(ctx) {
  const start = Date.now();
  metrics.requests++;
  const routeKey = ctx.request.url.split('?')[0];

  // on response finish: record
  const originalEnd = ctx.response.end.bind(ctx.response);
  ctx.response.end = (data) => {
    const dur = Date.now() - start;
    metrics.timings[routeKey] = metrics.timings[routeKey] || [];
    metrics.timings[routeKey].push(dur);

    metrics.routes[routeKey] = (metrics.routes[routeKey] || 0) + 1;

    originalEnd(data);
  };

  return 'next';
}

// Export middlewares and metrics object
module.exports = {
  logger,
  bodyParser,
  session,
  cache,
  metricsMiddleware,
  metrics,
};
