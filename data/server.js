// data/server.js
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const Router = require('./router');
const mw = require('./middleware');
const { parseMultipart } = require('./multipart');
const render = require('./templates');

const router = new Router();

// Registrar middlewares en el orden apropiado
router.use(mw.logger);
router.use(mw.metricsMiddleware);
router.use(mw.session);
router.use(mw.bodyParser);
router.use(mw.cache);

// helpers de datos (productos y comentarios)
const PRODUCTS_FILE = path.join(__dirname, 'productos.json');
const COMMENTS_FILE = path.join(__dirname, 'comments.json');
if (!fs.existsSync(COMMENTS_FILE)) fs.writeFileSync(COMMENTS_FILE, JSON.stringify({}), 'utf8');

// Helper leer productos
function loadProducts() {
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
}

// Helper leer/guardar comentarios
function loadComments() {
  try { return JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf8')); } catch { return {}; }
}
function saveComments(obj) { fs.writeFileSync(COMMENTS_FILE, JSON.stringify(obj, null, 2)); }

// Rutas
router.get('/', async ctx => {
  const productos = loadProducts();
  const html = render('home.html', { titulo: 'Bienvenido', productos, fecha: new Date().toLocaleDateString('es-CL') });
  ctx.response.writeHead(200, { 'Content-Type': 'text/html' });
  ctx.response.end(html);
});

router.get('/productos', async ctx => {
  const productos = loadProducts();
  const html = render('productos.html', { titulo: 'Productos', productos });
  ctx.response.writeHead(200, { 'Content-Type': 'text/html' });
  ctx.response.end(html);
});

router.get('/productos/:id', async ctx => {
  const productos = loadProducts();
  const p = productos.find(x => String(x.id) === String(ctx.params.id));
  if (!p) {
    const html = render('404.html', { titulo: 'No encontrado', mensaje: 'Producto no existe' });
    ctx.response.writeHead(404, { 'Content-Type': 'text/html' });
    return ctx.response.end(html);
  }
  const html = render('producto-detalle.html', { titulo: p.nombre, producto: p });
  ctx.response.writeHead(200, { 'Content-Type': 'text/html' });
  ctx.response.end(html);
});

router.get('/productos/upload', async ctx => {
  const html = render('producto-upload.html', { titulo: 'Subir Producto' });
  ctx.response.writeHead(200, { 'Content-Type': 'text/html' });
  ctx.response.end(html);
});

// === Autenticación simple ===
// POST /login { username, password } (demo)
router.post('/login', async ctx => {
  const body = ctx.body || {};
  // demo: username: admin, password: secret
  if (body.username === 'admin' && body.password === 'secret') {
    ctx.setSession({ username: 'admin', role: 'admin' });
    ctx.response.writeHead(302, { Location: '/' });
    return ctx.response.end();
  }
  ctx.response.writeHead(401, { 'Content-Type': 'text/plain' });
  ctx.response.end('Credenciales inválidas');
});

router.get('/login', async ctx => {
  const html = render('login.html', {
    titulo: 'Iniciar Sesión'
  });

  ctx.response.writeHead(200, { 'Content-Type': 'text/html' });
  ctx.response.end(html);
});

router.get('/logout', async ctx => {
  ctx.destroySession();
  ctx.response.writeHead(302, { Location: '/' });
  ctx.response.end();
});

router.get('/metrics', async ctx => {
  const m = require('./middleware').metrics;

  const serverStats = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    ...m
  };

  ctx.response.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.response.end(JSON.stringify(serverStats, null, 2));
});


// Endpoint para subir archivos de producto (multipart/form-data)
// POST /productos/upload
router.post('/productos/upload', async ctx => {
  const ct = ctx.request.headers['content-type'] || '';
  if (!ct.includes('multipart/form-data')) {
    ctx.response.writeHead(400, { 'Content-Type': 'text/plain' });
    return ctx.response.end('Se requiere multipart/form-data');
  }

  // Necesitamos haber leído el body (en bodyParser guardamos raw en _rawBody)
  const raw = ctx._rawBody;
  const { fields, files } = parseMultipart(ctx.request, raw);

  // mover archivo a public/images
  const imagesDir = path.join(__dirname, '..', 'public', 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  const fileKeys = Object.keys(files);
  if (!fileKeys.length) {
    ctx.response.writeHead(400, { 'Content-Type': 'text/plain' });
    return ctx.response.end('No se subió archivo');
  }

  const f = files[fileKeys[0]];
  const dest = path.join(imagesDir, f.filename);
  fs.copyFileSync(f.path, dest);
  fs.unlinkSync(f.path); // borrar tmp

  ctx.response.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.response.end(JSON.stringify({ ok: true, filename: f.filename }));
});

// Comentarios: GET y POST
// GET /api/productos/:id/comments
router.get('/api/productos/:id/comments', async ctx => {
  const id = String(ctx.params.id);
  const comments = loadComments();
  const list = comments[id] || [];
  ctx.response.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.response.end(JSON.stringify(list));
});

// POST /api/productos/:id/comments { author, text }
router.post('/api/productos/:id/comments', async ctx => {
  const id = String(ctx.params.id);
  const body = ctx.body || {};
  if (!body.text || !body.author) {
    ctx.response.writeHead(400, { 'Content-Type': 'application/json' });
    return ctx.response.end(JSON.stringify({ error: 'author y text requeridos' }));
  }

  const comments = loadComments();
  comments[id] = comments[id] || [];
  const item = { id: Date.now(), author: body.author, text: body.text, createdAt: new Date().toISOString() };
  comments[id].push(item);
  saveComments(comments);

  // invalidar cache para este endpoint si existe
  // (simple) borramos entradas en cache que empiecen por /api/productos/:id/comments
  // (accedemos al store en middleware.js por require)
  try {
    const m = require('./middleware');
    if (m && m.cacheStore) {
      for (const k of Array.from(m.cacheStore.keys())) {
        if (k.startsWith(`/api/productos/${id}/comments`)) m.cacheStore.delete(k);
      }
    }
  } catch (e) { /* ignore */ }

  ctx.response.writeHead(201, { 'Content-Type': 'application/json' });
  ctx.response.end(JSON.stringify(item));
});

// Metrics endpoint: /metrics
router.get('/metrics', async ctx => {
  const metrics = require('./middleware').metrics;
  ctx.response.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.response.end(JSON.stringify(metrics));
});

/* Serve static files: /public => /static (prefix) */
function serveStatic(req, res) {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;
  // maps /static/* to ../public/*
  if (!pathname.startsWith('/static/') && !pathname.startsWith('/public/')) return false;

  const rel = pathname.replace(/^\/(static|public)\//, '');
  const file = path.join(__dirname, '..', 'public', rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;

  const ext = path.extname(file).slice(1);
  const map = { css: 'text/css', js: 'application/javascript', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': map[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
  return true;
}



router.get('/acerca', async ctx => {
  const data = {
    titulo: 'Acerca de Nosotros',
    empresa: 'Mi Empresa S.A.',
    descripcion: 'Somos una tienda dedicada a productos de calidad.',
    fundacion: '2020'
  };

  console.log("DATA:", data);

  const html = render('about.html', data);

  console.log("HTML:", html.slice(0, 200));

  ctx.response.writeHead(200, { 'Content-Type': 'text/html' });
  ctx.response.end(html);
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  // static
  if (serveStatic(req, res)) return;

  const pathname = url.parse(req.url).pathname;
  const routeInfo = router.findRoute(req.method, pathname);

  if (!routeInfo) {
    // 404
    if (req.method === 'GET' && pathname.startsWith('/api')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
    const html = render('404.html', { titulo: '404', mensaje: 'Página no encontrada' });
    res.writeHead(404, { 'Content-Type': 'text/html' });
    return res.end(html);
  }

  // Ejecutar router
  await router.execute(req, res, routeInfo);

}).listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`);
});
