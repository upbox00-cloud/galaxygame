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
    const matches = html.match(/scripts\/auth\.js\?v=20260803-1/g) || [];
    assert.equal(matches.length, 1, `${page} deve carregar auth.js exatamente uma vez`);
  });
});
