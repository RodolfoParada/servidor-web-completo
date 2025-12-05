// Task 2: Sistema de Routing Avanzado (8 minutos)
// Router con soporte para parámetros dinámicos y middleware.

// router.js - Sistema de routing avanzado
const url = require('url');

class Router {
  constructor() {
    this.routes = {};
    this.middlewares = [];
  }

  // Agregar middleware global
  use(middleware) {
    this.middlewares.push(middleware);
  }

  // Registrar rutas con diferentes métodos
  addRoute(method, path, ...handlers) {
    if (!this.routes[method]) {
      this.routes[method] = [];
    }

    // Convertir path con parámetros a regex
    const paramNames = [];
    const regexPath = path.replace(/:(\w+)/g, (match, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });

    this.routes[method].push({
      originalPath: path,
      regex: new RegExp(`^${regexPath}$`),
      paramNames,
      handlers
    });
  }

  // Métodos convenientes
  get(path, ...handlers) {
    this.addRoute('GET', path, ...handlers);
  }

  post(path, ...handlers) {
    this.addRoute('POST', path, ...handlers);
  }

  put(path, ...handlers) {
    this.addRoute('PUT', path, ...handlers);
  }

  delete(path, ...handlers) {
    this.addRoute('DELETE', path, ...handlers);
  }

  // Encontrar ruta que coincida
  findRoute(method, pathname) {
    const methodRoutes = this.routes[method];
    if (!methodRoutes) return null;

    for (const route of methodRoutes) {
      const match = pathname.match(route.regex);
      if (match) {
        // Extraer parámetros
        const params = {};
        route.paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });

        return { route, params };
      }
    }

    return null;
  }

  // Ejecutar middlewares y handlers
  async execute(request, response, routeInfo) {
    const { route, params } = routeInfo;

    // Crear contexto
    const context = {
      request,
      response,
      params,
      query: url.parse(request.url, true).query,
      body: null
    };

    // Ejecutar middlewares globales
    for (const middleware of this.middlewares) {
      await middleware(context);
    }

    // Ejecutar handlers de la ruta
    for (const handler of route.handlers) {
      const result = await handler(context);
      if (result === 'next') continue;
      if (result !== undefined) return result;
    }
  }
}

module.exports = Router;

// Middleware Básico

// middleware.js - Middleware común
const fs = require('fs').promises;
const path = require('path');

// Middleware de logging
function logger(context) {
  const timestamp = new Date().toISOString();
  const { method, url } = context.request;
  console.log(`[${timestamp}] ${method} ${url}`);
}

// Middleware CORS
function cors(context) {
  const { response } = context;
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Middleware para parsear JSON
async function jsonParser(context) {
  const { request } = context;

  if (request.headers['content-type'] === 'application/json') {
    let body = '';

    return new Promise((resolve, reject) => {
      request.on('data', chunk => {
        body += chunk.toString();
      });

      request.on('end', () => {
        try {
          context.body = JSON.parse(body);
          resolve();
        } catch (error) {
          reject(new Error('JSON inválido'));
        }
      });

      request.on('error', reject);
    });
  }
}

// Middleware para servir archivos estáticos
async function staticFiles(context) {
  const { request, response } = context;
  const parsedUrl = url.parse(request.url);
  const pathname = parsedUrl.pathname;

  // Solo servir archivos de /public/
  if (pathname.startsWith('/public/')) {
    const filePath = path.join(__dirname, pathname);

    try {
      const stat = await fs.stat(filePath);

      if (stat.isFile()) {
        const ext = path.extname(filePath);
        const contentType = getContentType(ext);

        response.writeHead(200, { 'Content-Type': contentType });

        const stream = fs.createReadStream(filePath);
        stream.pipe(response);
        return 'end'; // Terminar procesamiento
      }
    } catch (error) {
      // Archivo no encontrado, continuar
    }
  }
}

function getContentType(ext) {
  const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif'
  };
  return types[ext] || 'text/plain';
}

module.exports = {
  logger,
  cors,
  jsonParser,
  staticFiles
};