const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "painel-pedidos.html"), "utf8");
const script = fs.readFileSync(path.join(root, "admin-pedidos.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "admin-dashboard.css"), "utf8");

test("dashboard administrativo tem navegação enxuta e vistas funcionais", () => {
  ["overview", "orders", "catalog", "customers"].forEach((view) => {
    assert.match(html, new RegExp(`data-admin-view-button="${view}"`));
    assert.match(html, new RegExp(`data-admin-view="${view}"`));
  });
  assert.match(script, /function setView\(view\)/);
  assert.match(styles, /\.admin-sidebar/);
  assert.match(styles, /@media \(max-width: 860px\)/);
});

test("estatísticas são calculadas com pedidos reais e excluem cancelados da receita", () => {
  assert.match(script, /function periodOrders\(days = state\.period, previous = false\)/);
  assert.match(script, /normalizeStatus\(order\.status\) !== "cancelled"/);
  assert.match(script, /function renderRevenueChart\(orders\)/);
  assert.match(script, /function renderStatusChart\(\)/);
  assert.match(script, /function renderTopProducts\(orders\)/);
  assert.match(script, /function renderPlatforms\(orders\)/);
  assert.match(html, /data-admin-period="30"/);
  assert.match(html, /data-admin-revenue-chart/);
  assert.match(html, /data-admin-donut/);
});

test("gestão de pedidos continua ligada às functions protegidas", () => {
  assert.match(script, /\/\.netlify\/functions\/admin-pedidos\?status=all/);
  assert.match(script, /\/\.netlify\/functions\/marcar-pedido-enviado/);
  assert.match(script, /\/\.netlify\/functions\/atualizar-pedido-status/);
  assert.match(script, /Authorization: `Bearer \$\{await user\.jwt\(\)\}`/);
  assert.match(script, /data\.pedido/);
});

test("catálogo e clientes usam os dados existentes da loja", () => {
  assert.match(script, /fetch\("data\/catalog-lite\.json"/);
  assert.match(script, /function updateCatalogSummary\(\)/);
  assert.match(script, /function customerData\(\)/);
  assert.match(script, /activeSales\(state\.orders\)/);
  assert.match(html, /data-admin-catalog-list/);
  assert.match(html, /data-admin-customer-list/);
});
