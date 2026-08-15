const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const footerScript = fs.readFileSync("footer.js", "utf8");
const legalStyles = fs.readFileSync("legal.css", "utf8");
const adminStyles = fs.readFileSync("admin-dashboard.css", "utf8");

test("rodape partilhado usa o mesmo layout nas paginas legais e na loja", () => {
  assert.match(footerScript, /classList\.add\("site-footer", "enhanced-footer"\)/);
  assert.match(legalStyles, /\.footer-logo\s*\{[^}]*width:\s*min\(240px, 100%\)/s);
  assert.match(legalStyles, /padding:\s*38px max\(24px, calc\(\(100% - 1120px\) \/ 2\)\) 26px/);
  assert.match(legalStyles, /@media \(max-width: 560px\)[\s\S]*\.legal-footer\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test("painel administrativo contem textos longos dentro dos cartoes no mobile", () => {
  assert.match(adminStyles, /\.admin-orders-page \.admin-order-card\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(adminStyles, /\.admin-order-product > div\s*\{[^}]*min-width:\s*0/s);
  assert.match(adminStyles, /\.admin-order-title small,[\s\S]*overflow-wrap:\s*anywhere/s);
  assert.match(adminStyles, /@media \(max-width: 620px\)[\s\S]*\.admin-order-session dd\s*\{[^}]*max-width:\s*calc\(100vw - 80px\)/s);
});
