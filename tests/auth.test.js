const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const authSource = fs.readFileSync(path.join(root, "scripts", "auth.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("auth initialization and controls are idempotent", () => {
  assert.match(authSource, /if \(window\.__GalaxyGameAuthReady\) return;/);
  assert.match(authSource, /controls\.dataset\.authEnhanced === "true"/);
  assert.match(authSource, /button\.innerHTML = `\$\{userIconSvg\}/);
  assert.doesNotMatch(authSource, /insertAdjacentHTML|appendChild\(userIcon/);
});

test("hidden auth states cannot be overridden by icon display styles", () => {
  assert.match(stylesSource, /\.auth-controls \[hidden\][\s\S]*display: none !important;/);
  assert.match(stylesSource, /\.auth-user\[hidden\]/);
  assert.match(stylesSource, /\.auth-dropdown\[hidden\]/);
});

test("account menu is controlled only by click and closes both dropdown types", () => {
  assert.match(authSource, /\[data-auth-dropdown\], \[data-auth-login-dropdown\]/);
  assert.match(authSource, /toggleDropdown\(button, dropdown\)/);
  assert.doesNotMatch(authSource, /pointerenter|pointerleave/);
});

test("mobile return from Identity restores interactions and refreshes the user", () => {
  assert.match(authSource, /identity\.on\("close", restorePageInteractions\)/);
  assert.match(authSource, /window\.addEventListener\("pageshow"/);
  assert.match(authSource, /identity\.currentUser\?\.\(\)/);
  assert.match(stylesSource, /\.site-header \.header-actions[\s\S]*pointer-events: auto !important;/);
  assert.match(stylesSource, /\.site-header \.auth-user-button[\s\S]*touch-action: manipulation;/);
});

test("login handler restaura a página diretamente, sem depender só do evento close", () => {
  // O widget do Netlify Identity nem sempre dispara "close" depois de um
  // login bem sucedido (o modal já se fecha sozinho e identity.close() vira
  // um no-op), o que deixava overflow/position do body presos e a página
  // inteira sem responder a cliques. O handler de "login" tem de chamar
  // restorePageInteractions() diretamente, sem depender só do listener de "close".
  const loginHandlerMatch = authSource.match(/identity\.on\("login", \(user\) => \{[\s\S]*?\n {2}\}\);/);
  assert.ok(loginHandlerMatch, "handler de login não encontrado");
  const loginHandler = loginHandlerMatch[0];
  assert.match(loginHandler, /restorePageInteractions\(\);/);
  assert.match(loginHandler, /window\.setTimeout\(restorePageInteractions, \d+\);/);
});

test("restorePageInteractions limpa overflow, position, width e pointer-events do body/html", () => {
  const fnMatch = authSource.match(/function restorePageInteractions\(\)[\s\S]*?\n {2}\}/);
  assert.ok(fnMatch, "restorePageInteractions não encontrada");
  const fn = fnMatch[0];
  ["overflow", "position", "width", "pointer-events"].forEach((prop) => {
    assert.match(fn, new RegExp(`removeProperty\\("${prop}"\\)`), `deveria remover a propriedade "${prop}"`);
  });
});

test("all primary pages load the cache-busted auth script once", () => {
  const pages = [
    "index.html",
    "catalogo.html",
    "produto.html",
    "carrinho.html",
    "minha-conta.html",
    "painel-pedidos.html"
  ];

  pages.forEach((page) => {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const matches = html.match(/scripts\/auth\.js\?v=20260805-1/g) || [];
    assert.equal(matches.length, 1, `${page} deve carregar auth.js exatamente uma vez`);
  });
});
