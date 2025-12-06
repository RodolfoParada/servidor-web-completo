// data/middleware.js
const fs = require('fs');

// ====== MÉTRICAS ======
const metrics = {
  totalRequests: 0,
  totalErrors: 0,
  routesCount: {},     // /productos → 20 requests
  statusCodes: {},     // 200: 120 req, 404: 10 req, etc.
  avgResponseTime: 0,
  lastResponseTime: 0,
  activeSessions: 0
};

// Tiempo de inicio de solicitud por request
function metricsMiddleware(ctx) {
  return new Promise(resolve => {
    const start = Date.now();

    ctx.response.on("finish", () => {
      const duration = Date.now() - start;

      metrics.lastResponseTime = duration;
      metrics.totalRequests++;

      // Promedio simple para no complicar CPU
      metrics.avgResponseTime = (
        (metrics.avgResponseTime * (metrics.totalRequests - 1)) + duration
      ) / metrics.totalRequests;

      const route = ctx.request.url.split("?")[0];
      metrics.routesCount[route] = (metrics.routesCount[route] || 0) + 1;

      const status = ctx.response.statusCode;
      metrics.statusCodes[status] = (metrics.statusCodes[status] || 0) + 1;

      if (status >= 400) metrics.totalErrors++;
    });

    resolve();
  });
}

// ====== LOGGER ======
async function logger(ctx) {
  console.log(`➡ ${ctx.request.method} ${ctx.request.url}`);
}

// ====== BODY PARSER ======
async function bodyParser(ctx) {
  return new Promise(resolve => {
    let data = '';
    ctx.request.on('data', chunk => data += chunk);
    ctx.request.on('end', () => {
      ctx._rawBody = data;
      try { ctx.body = data ? JSON.parse(data) : {}; }
      catch { ctx.body = {}; }
      resolve();
    });
  });
}

// ====== SESIONES ======
let sessionStore = {};
function generateToken() {
  return Math.random().toString(36).slice(2);
}

async function session(ctx) {
  const cookie = ctx.request.headers.cookie || '';
  const match = cookie.match(/session=([^;]+)/);
  let token = match ? match[1] : null;

  if (!token || !sessionStore[token]) {
    token = generateToken();
    sessionStore[token] = {};
    ctx.response.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly`);
    metrics.activeSessions++;
  }

  ctx.session = sessionStore[token];

  ctx.setSession = obj => Object.assign(ctx.session, obj);
  ctx.destroySession = () => {
    delete sessionStore[token];
    metrics.activeSessions = Math.max(0, metrics.activeSessions - 1);
  };
}

// ====== CACHE SIMPLE ======
const cacheStore = new Map();
async function cache(ctx) {
  const key = ctx.request.url;
  if (cacheStore.has(key)) {
    const item = cacheStore.get(key);
    const diff = Date.now() - item.time;
    if (diff < 10_000) { // 10 segundos
      ctx.response.writeHead(200, { "Content-Type": item.type });
      ctx.response.end(item.data);
      return "cached";
    }
  }
}

module.exports = {
  logger,
  bodyParser,
  session,
  metricsMiddleware,
  cache,
  cacheStore,
  metrics
};
