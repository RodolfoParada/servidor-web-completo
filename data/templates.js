const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// 1. Reemplazar variables {{nombre}}, {{user.nombre}}, etc.
// ---------------------------------------------------------------------------
function replaceVars(str, data) {
  return str.replace(/{{\s*([^{}\s]+)\s*}}/g, (_, key) => {
    const val = key.split('.').reduce((a, k) => a && a[k], data);
    return val != null ? val : "";
  });
}

// ---------------------------------------------------------------------------
// 2. {{#if condicion}} ... {{/if}}
//    Soporta: variable, obj.prop, !negacion
// ---------------------------------------------------------------------------
function renderIfBlocks(tpl, data) {
  return tpl.replace(/{{#if\s+([^}]+)}}([\s\S]*?){{\/if}}/g, (_, cond, inner) => {
    let expr = cond.trim();
    let neg = false;

    if (expr.startsWith("!")) {
      neg = true;
      expr = expr.slice(1);
    }

    const val = expr.split('.').reduce((a, k) => a && a[k], data);
    const ok = neg ? !val : Boolean(val);

    return ok ? inner : "";
  });
}

// ---------------------------------------------------------------------------
// 3. {{#each array}} ... {{/each}}
//    Soporta: {{this}}, {{this.prop}}, {{@index}}
// ---------------------------------------------------------------------------
function renderEachBlocks(tpl, data) {
  return tpl.replace(/{{#each\s+([^}]+)}}([\s\S]*?){{\/each}}/g,
    (_, arrName, inner) => {

      const arr = arrName.split('.').reduce((a, k) => a && a[k], data);
      if (!Array.isArray(arr)) return "";

      return arr.map((item, index) => {
        let block = inner;

        block = block.replace(/{{\s*@index\s*}}/g, index);

        block = block.replace(/{{\s*this(?:\.([^}\s]+))?\s*}}/g, (_, prop) => {
          if (!prop) return item;
          return item[prop] != null ? item[prop] : "";
        });

        block = block.replace(/{{\s*([^{}\s]+)\s*}}/g, (_, key) => {
          return (item && item[key] != null) ? item[key] : "";
        });

        return block;
      }).join("");
    }
  );
}

// ---------------------------------------------------------------------------
// 4. Render final base (sin layout)
// ---------------------------------------------------------------------------
function renderTemplateContent(tpl, data = {}) {
  tpl = renderIfBlocks(tpl, data);
  tpl = renderEachBlocks(tpl, data);
  tpl = replaceVars(tpl, data);
  return tpl;
}

// ---------------------------------------------------------------------------
// 5. Render principal (usa layout.html)
// ---------------------------------------------------------------------------
function render(viewName, data = {}) {

  if (!viewName.endsWith('.html')) viewName += '.html';

  const viewPath = path.join(__dirname, '..', 'views', viewName);
  const raw = fs.readFileSync(viewPath, 'utf8');

  let body = renderTemplateContent(raw, data);

  const layoutPath = path.join(__dirname, '..', 'views', 'layout.html');

  if (fs.existsSync(layoutPath)) {
    let layout = fs.readFileSync(layoutPath, 'utf8');

    // Insertar contenido en {{{content}}}
    layout = layout.replace('{{{content}}}', body);

    // Reemplazar variables del layout
    layout = replaceVars(layout, data);

    return layout;
  }

  return body;
}

module.exports = render;
