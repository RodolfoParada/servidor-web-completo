// tests/router.test.js
const Router = require('../data/router');

test('router registers and finds route with params', () => {
  const r = new Router();
  r.get('/productos/:id', async ctx => ctx);
  const info = r.findRoute('GET', '/productos/123');
  expect(info).not.toBeNull();
  expect(info.params.id).toBe('123');
});
