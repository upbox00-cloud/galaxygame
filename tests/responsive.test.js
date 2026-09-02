const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const footerScript = fs.readFileSync("footer.js", "utf8");
const legalStyles = fs.readFileSync("legal.css", "utf8");
const adminStyles = fs.readFileSync("admin-dashboard.css", "utf8");
const homeHtml = fs.readFileSync("index.html", "utf8");
const homeScript = fs.readFileSync("home.js", "utf8");
const siteStyles = fs.readFileSync("styles.css", "utf8");
const cssBuildScript = fs.readFileSync("scripts/build-css.js", "utf8");

test("trailers dos cards mantêm a proporção 16:9 sem zoom", () => {
  assert.match(siteStyles, /\.cover-video\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*overflow:\s*hidden;/s);
  assert.match(siteStyles, /\.cover-video iframe\s*\{[^}]*height:\s*auto;[^}]*aspect-ratio:\s*16\s*\/\s*9;/s);
  assert.doesNotMatch(siteStyles, /\.cover-video\s*\{[^}]*transform:\s*scale\(/s);
  assert.match(cssBuildScript, /dynamicMediaPattern\s*=\s*\/\^\(cover-video\|card-preview-video\)/);
});
const netlifyConfig = fs.readFileSync("netlify.toml", "utf8");
const cartHtml = fs.readFileSync("carrinho.html", "utf8");
const cartScript = fs.readFileSync("cart.js", "utf8");
const quickCheckoutHtml = fs.readFileSync("finalizar-compra.html", "utf8");
const quickCheckoutScript = fs.readFileSync("finalizar-compra.js", "utf8");
const quickCheckoutStyles = fs.readFileSync("finalizar-compra.css", "utf8");

test("rodape partilhado usa o mesmo layout nas paginas legais e na loja", () => {
  assert.match(footerScript, /classList\.add\("site-footer", "enhanced-footer"\)/);
  assert.match(legalStyles, /\.footer-logo\s*\{[^}]*width:\s*min\(240px, 100%\)/s);
  assert.match(legalStyles, /padding:\s*38px max\(24px, calc\(\(100% - 1120px\) \/ 2\)\) 26px/);
  assert.match(legalStyles, /@media \(max-width: 560px\)[\s\S]*\.legal-footer\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(footerScript, /Segunda a sexta: 10h-22h/);
  assert.match(footerScript, /S&aacute;bado: 9h-19h/);
});

test("painel administrativo contem textos longos dentro dos cartoes no mobile", () => {
  assert.match(adminStyles, /\.admin-orders-page \.admin-order-card\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(adminStyles, /\.admin-order-product > div\s*\{[^}]*min-width:\s*0/s);
  assert.match(adminStyles, /\.admin-order-title small,[\s\S]*overflow-wrap:\s*anywhere/s);
  assert.match(adminStyles, /@media \(max-width: 620px\)[\s\S]*\.admin-order-session dd\s*\{[^}]*max-width:\s*calc\(100vw - 80px\)/s);
});

test("home entrega o LCP e as capas de forma responsiva sem perder qualidade", () => {
  assert.match(homeHtml, /<picture>[\s\S]*gta-vi-landscape-960\.webp[\s\S]*fetchpriority="high"/);
  assert.match(homeHtml, /roboto-condensed-latin\.woff2/);
  assert.match(homeScript, /loading="lazy" decoding="async"/);
  assert.match(homeScript, /\/\.netlify\/images\?/);
  assert.doesNotMatch(homeScript, /new Image\(\)/);
  assert.match(siteStyles, /content-visibility:\s*auto/);
  assert.match(netlifyConfig, /\[images\][\s\S]*remote_images/);
});

test("checkout convidado recolhe o email no Stripe e mantem controlos adequados no mobile", () => {
  assert.match(cartHtml, /data-checkout-account-options/);
  assert.doesNotMatch(cartHtml, /data-checkout-email/);
  assert.match(cartHtml, /Stripe recolhe o teu email/);
  assert.match(cartScript, /checkoutMode: user \? "registered" : "guest"/);
  assert.match(siteStyles, /@media \(max-width: 520px\)[\s\S]*\.checkout-account-actions a/s);
});

test("rota antiga de Comprar agora redireciona automaticamente para o Stripe", () => {
  assert.doesNotMatch(quickCheckoutHtml, /data-email-checkout/);
  assert.doesNotMatch(quickCheckoutHtml, /inputmode="email"/);
  assert.match(quickCheckoutScript, /checkoutMode: user \? "registered" : "guest"/);
  assert.match(quickCheckoutScript, /\/\.netlify\/functions\/criar-checkout/);
  assert.match(quickCheckoutScript, /window\.location\.replace\(data\.checkoutUrl\)/);
  assert.match(quickCheckoutStyles, /\[hidden\]\s*\{\s*display:\s*none !important/);
  assert.match(quickCheckoutStyles, /@media \(max-width: 860px\)/);
});
