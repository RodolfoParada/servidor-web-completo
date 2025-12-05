// Task 4: Servidor Web Completo (8 minutos)
// Integración de todos los componentes en un servidor web funcional.

// server.js - Servidor web completo
const http = require('http');
const Router = require('./router');
const TemplateEngine = require('./templates');
const StaticServer = require('./static-server');
const { logger, cors, jsonParser, staticFiles } = require('./middleware');

// Datos de ejemplo
const productos = [
  { id: 1, nombre: 'Laptop Gaming', precio: 1200, categoria: 'Electrónica' },
  { id: 2, nombre: 'Mouse Inalámbrico', precio: 50, categoria: 'Accesorios' },
  { id: 3, nombre: 'Teclado Mecánico', precio: 150, categoria: 'Accesorios' },
  { id: 4, nombre: 'Monitor 27"', precio: 300, categoria: 'Electrónica' }
];

// Inicializar componentes
const router = new Router();
const templates = new TemplateEngine();
const staticServer = new StaticServer();

// Configurar middleware
router.use(logger);
router.use(cors);

// Rutas principales
router.get('/', async (context) => {
  const { response } = context;

  const html = await templates.render('home', {
    titulo: 'Bienvenido a Mi Tienda',
    productos: productos.slice(0, 3), // Mostrar 3 productos destacados
    fecha: new Date().toLocaleDateString('es-ES')
  });

  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(html);
});

router.get('/productos', async (context) => {
  const { response, query } = context;

  let productosFiltrados = productos;

  // Filtros por query
  if (query.categoria) {
    productosFiltrados = productosFiltrados.filter(p => p.categoria === query.categoria);
  }

  if (query.maxPrecio) {
    const maxPrecio = parseFloat(query.maxPrecio);
    productosFiltrados = productosFiltrados.filter(p => p.precio <= maxPrecio);
  }

  const html = await templates.render('productos', {
    titulo: 'Nuestros Productos',
    productos: productosFiltrados,
    filtros: query
  });

  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(html);
});

router.get('/productos/:id', async (context) => {
  const { response, params } = context;
  const id = parseInt(params.id);
  const producto = productos.find(p => p.id === id);

  if (!producto) {
    const html = await templates.render('404', {
      titulo: 'Producto no encontrado',
      mensaje: `El producto con ID ${id} no existe.`
    });
    response.writeHead(404, { 'Content-Type': 'text/html' });
    response.end(html);
    return;
  }

  const html = await templates.render('producto-detalle', {
    titulo: producto.nombre,
    producto
  });

  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(html);
});

router.get('/acerca', async (context) => {
  const { response } = context;

  const html = await templates.render('about', {
    titulo: 'Acerca de Nosotros',
    empresa: 'Mi Tienda Online',
    descripcion: 'Somos una tienda especializada en productos tecnológicos.',
    fundacion: 2020
  });

  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(html);
});

// API REST
router.get('/api/productos', (context) => {
  const { response, query } = context;

  let resultados = productos;

  // Aplicar filtros
  if (query.categoria) {
    resultados = resultados.filter(p => p.categoria === query.categoria);
  }

  if (query.minPrecio) {
    const minPrecio = parseFloat(query.minPrecio);
    resultados = resultados.filter(p => p.precio >= minPrecio);
  }

  if (query.maxPrecio) {
    const maxPrecio = parseFloat(query.maxPrecio);
    resultados = resultados.filter(p => p.precio <= maxPrecio);
  }

  // Ordenamiento
  if (query.ordenar === 'precio_asc') {
    resultados.sort((a, b) => a.precio - b.precio);
  } else if (query.ordenar === 'precio_desc') {
    resultados.sort((a, b) => b.precio - a.precio);
  }

  // Paginación
  const pagina = parseInt(query.pagina) || 1;
  const limite = parseInt(query.limite) || 10;
  const inicio = (pagina - 1) * limite;
  const paginados = resultados.slice(inicio, inicio + limite);

  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({
    total: resultados.length,
    pagina,
    limite,
    productos: paginados
  }));
});

router.get('/api/productos/:id', (context) => {
  const { response, params } = context;
  const id = parseInt(params.id);
  const producto = productos.find(p => p.id === id);

  if (!producto) {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Producto no encontrado' }));
    return;
  }

  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(producto));
});

// Crear servidor
const servidor = http.createServer(async (request, response) => {
  const { method } = request;
  const parsedUrl = url.parse(request.url, true);
  const { pathname } = parsedUrl;

  try {
    // Intentar servir archivo estático primero
    const archivoServido = await staticServer.serve(request, response);
    if (archivoServido) return;

    // Buscar ruta en el router
    const routeInfo = router.findRoute(method, pathname);

    if (routeInfo) {
      await router.execute(request, response, routeInfo);
    } else {
      // Página 404
      const html = await templates.render('404', {
        titulo: 'Página no encontrada',
        mensaje: `La ruta ${pathname} no existe en este servidor.`
      });
      response.writeHead(404, { 'Content-Type': 'text/html' });
      response.end(html);
    }

  } catch (error) {
    console.error('Error en el servidor:', error);

    // Página de error
    const html = await templates.render('error', {
      titulo: 'Error del servidor',
      mensaje: 'Ha ocurrido un error interno. Por favor, inténtalo de nuevo más tarde.',
      error: process.env.NODE_ENV === 'development' ? error.message : ''
    });

    response.writeHead(500, { 'Content-Type': 'text/html' });
    response.end(html);
  }
});

// Inicialización
async function iniciarServidor() {
  try {
    // Precargar archivos críticos
    await staticServer.preload(['css/styles.css', 'js/app.js']);

    // Iniciar servidor
    const PUERTO = process.env.PORT || 3000;
    servidor.listen(PUERTO, () => {
      console.log(`🚀 Servidor web completo ejecutándose en http://localhost:${PUERTO}`);
      console.log(`📄 Página principal: http://localhost:${PUERTO}`);
      console.log(`🛍️  Productos: http://localhost:${PUERTO}/productos`);
      console.log(`📡 API: http://localhost:${PUERTO}/api/productos`);
    });

  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Cerrando servidor...');
  servidor.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});

// Iniciar servidor
iniciarServidor();