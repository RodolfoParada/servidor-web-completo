// data/router.js
const url = require('url');

class Router {
  constructor() {
    this.routes = {};
    this.middlewares = [];
  }

  use(middleware) {
    this.middlewares.push(middleware);
  }

  addRoute(method, path, ...handlers) {
    if (!this.routes[method]) this.routes[method] = [];

    const paramNames = [];
    const regexPath = path.replace(/:(\w+)/g, (_, p) => {
      paramNames.push(p);
      return '([^/]+)';
    });

    this.routes[method].push({
      path,
      regex: new RegExp(`^${regexPath}$`),
      paramNames,
      handlers
    });
  }

  get(path, ...h) { this.addRoute('GET', path, ...h); }
  post(path, ...h) { this.addRoute('POST', path, ...h); }
  put(path, ...h) { this.addRoute('PUT', path, ...h); }
  delete(path, ...h) { this.addRoute('DELETE', path, ...h); }

  findRoute(method, pathname) {
    const list = this.routes[method];
    if (!list) return null;

    for (const r of list) {
      const m = pathname.match(r.regex);
      if (m) {
        const params = {};
        r.paramNames.forEach((name, i) => params[name] = m[i + 1]);
        return { route: r, params };
      }
    }
    return null;
  }

  // Ejecuta middlewares globales y handlers de ruta
  async execute(req, res, routeInfo) {
    const { route, params } = routeInfo;
    const context = {
      request: req,
      response: res,
      params,
      query: url.parse(req.url, true).query,
      body: null,
      user: null,
      status: (code) => res.statusCode = code,
      send: (code, data) => {
        if (!res.headersSent) res.writeHead(code, { 'Content-Type': 'text/plain' });
        res.end(typeof data === 'string' ? data : JSON.stringify(data));
      },
      json: (data) => {
        if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      },
      render: null, // se inyecta desde server si hace falta
      _internal: {} // para middlewares
    };

    // Helper para ejecutar una lista de funciones encadenadas con next()
    const runChain = async (fns) => {
      let idx = 0;
      const next = async () => {
        idx++;
        if (idx <= fns.length) {
          await fns[idx - 1](context, next);
        }
      };
      if (fns.length) {
        idx = 1;
        await fns[0](context, next);
      }
    };

    try {
      // Ejecutar middlewares globales secuencialmente (cada mw recibe ctx, next)
      const mwWrappers = this.middlewares.map(mw => (ctx, next) => Promise.resolve(mw(ctx)).then(() => next()));
      if (mwWrappers.length) await runChain(mwWrappers);

      // Ejecutar handlers de la ruta (cada handler toma ctx y puede llamar ctx.next via returning 'next' or using next param)
      for (const handler of route.handlers) {
        // handler puede ser (ctx) => { ... ctx._internal.callNext = true } o usar ctx.next() vía inmutabilidad
        let calledNext = false;

        // soporte para handlers con firma (ctx, next)
        if (handler.length >= 2) {
          await new Promise((resolve, reject) => {
            try {
              handler(context, () => {
                calledNext = true;
                resolve();
              });
            } catch (err) { reject(err); }
            // si el handler no llama next pero finaliza sin respuesta, asumimos que terminó la respuesta
            // no hacemos nada especial
          });
        } else {
          // handler(ctx) posible async
          const resHandler = await handler(context);
          // si handler devuelve 'next' o true interpretamos que continúa
          if (resHandler === 'next' || resHandler === true) calledNext = true;
        }

        if (!calledNext) {
          // si el handler no pidió next, asumimos que terminó el flujo
          return;
        }
      }
    } catch (err) {
      console.error('Router error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error interno del servidor');
      } else {
        res.end();
      }
    }
  }
}

module.exports = Router;
