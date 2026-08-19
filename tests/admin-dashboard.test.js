const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "painel-pedidos.html"), "utf8");
const script = fs.readFileSync(path.join(root, "admin-pedidos.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "admin-dashboard.css"), "utf8");
const presence = fs.readFileSync(path.join(root, "presence.js"), "utf8");
const presenceFunction = fs.readFileSync(path.join(root, "netlify", "functions", "site-presence.js"), "utf8");
const accountHtml = fs.readFileSync(path.join(root, "minha-conta.html"), "utf8");
const accountScript = fs.readFileSync(path.join(root, "minha-conta.js"), "utf8");
const siteStyles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

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
  assert.match(script, /deliveryField\?\.addEventListener\("pointerdown"/);
  assert.match(styles, /pointer-events: auto !important/);
  assert.doesNotMatch(script, /Cria o campo Status/);
  assert.match(script, /order_email_missing/);
  assert.match(script, /Pedido incompleto:/);
});

test("catálogo e clientes usam os dados existentes da loja", () => {
  assert.match(script, /apiRequest\("\/\.netlify\/functions\/admin-catalogo"\)/);
  assert.match(script, /Não foi possível igualar o concorrente/);
  assert.match(script, /function updateCatalogSummary\(\)/);
  assert.match(script, /function customerData\(\)/);
  assert.match(script, /activeSales\(state\.orders\)/);
  assert.match(html, /data-admin-catalog-list/);
  assert.match(html, /data-admin-customer-list/);
});

test("pedidos antigos recuperam o fornecedor mais barato pelo catálogo privado", () => {
  const adminOrdersFunction = fs.readFileSync(path.join(root, "netlify", "functions", "admin-pedidos.js"), "utf8");
  const commercialResolver = fs.readFileSync(path.join(root, "netlify", "functions", "_commercial-catalog.js"), "utf8");

  assert.match(adminOrdersFunction, /supplierForOrder\(pedido\)/);
  assert.match(commercialResolver, /fornecedorSelecionado/);
  assert.match(commercialResolver, /linkFornecedorSelecionado/);
  assert.match(commercialResolver, /custoFornecedorBRL/);
});

test("painel apresenta visitantes ativos com presença anónima protegida", () => {
  assert.match(html, /data-admin-live-count/);
  assert.match(script, /\/\.netlify\/functions\/site-presence/);
  assert.match(script, /window\.setInterval\(loadPresence, 20 \* 1000\)/);
  assert.match(presence, /sessionStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(presence, /HEARTBEAT_INTERVAL_MS = 45 \* 1000/);
  assert.match(presenceFunction, /requireAdmin\(context\)/);
  assert.match(presenceFunction, /event\?\.blobs\) connectLambda\(event\)/);
  assert.match(presenceFunction, /ACTIVE_WINDOW_MS = 2 \* 60 \* 1000/);
  assert.doesNotMatch(presenceFunction, /user-agent|client-ip|email/i);
});

test("painel restaura a vista e os filtros ao regressar", () => {
  assert.match(script, /galaxygame_admin_ui_v1/);
  assert.match(script, /function readSavedUi\(\)/);
  assert.match(script, /function saveUi\(\)/);
  assert.match(script, /window\.localStorage\.setItem/);
  assert.match(script, /setView\(state\.view\)/);
});

test("painel distingue e pesquisa pedidos de convidados", () => {
  assert.match(html, /data-admin-customer-type="guest"/);
  assert.match(html, /data-admin-customer-type="registered"/);
  assert.match(script, /customerTypeFilters/);
  assert.match(script, /admin-customer-type-badge/);
  assert.match(script, /order\.id, order\.clienteNome/);
});

test("Minha Conta apresenta pedidos cancelados sem os confundir com pedidos em preparacao", () => {
  assert.match(accountScript, /\["cancelado", "cancelada", "canceled", "cancelled"\]\.includes\(status\)/);
  assert.match(accountScript, /cancelled \? "Pedido cancelado"/);
  assert.match(accountScript, /account-order-cancelled-note/);
  assert.match(siteStyles, /\.account-order-card\.cancelled/);
  assert.match(accountHtml, /minha-conta\.js\?v=20260815-2/);
});

test("Minha Conta recomenda jogos do catalogo com base na biblioteca do cliente", () => {
  assert.match(accountHtml, /data-account-recommendations/);
  assert.match(accountHtml, /data-account-order-filters/);
  assert.match(accountScript, /fetch\("data\/catalog-lite\.json"/);
  assert.match(accountScript, /preferredPlatforms\.has\(platform\)/);
  assert.match(accountScript, /preferredGenres\.has\(genre\)/);
  assert.match(accountScript, /purchasedNames\.has\(base\)/);
  assert.match(siteStyles, /\.account-recommendation-grid/);
  assert.match(siteStyles, /@media \(max-width: 700px\)/);
  assert.match(accountHtml, /styles(?:\.min)?\.css\?v=\d+(?:-\d+)?/);
});
