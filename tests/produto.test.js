const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const produtoSource = fs.readFileSync(path.join(root, "produto.js"), "utf8");
const produtoHtml = fs.readFileSync(path.join(root, "produto.html"), "utf8");
const produtoStyles = fs.readFileSync(path.join(root, "produto.css"), "utf8");

test("product page never flashes the GTA VI artwork for another game", () => {
  assert.match(produtoHtml, /class="product-page product-loading"/);
  assert.match(produtoHtml, /produto\.css\?v=20260819-3/);
  assert.match(produtoHtml, /produto\.js\?v=20260822-1/);
  assert.match(produtoSource, /document\.body\.classList\.remove\("product-loading"\)/);
  assert.match(produtoSource, /"assets\/site-cosmic-gaming-bg\.webp"/);

  const heroRule = produtoStyles.match(/\.product-hero-bg\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const coverRule = produtoStyles.match(/\.cover-art\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(heroRule, /gta-vi/i);
  assert.doesNotMatch(coverRule, /gta-vi/i);
});

test("product cover always fits inside its natural aspect ratio without cropping", () => {
  const supplierCoverRule = produtoStyles.match(/\.cover-art\.supplier-cover-clean\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(produtoStyles, /\.cover-art\s*\{[\s\S]*?background-position:\s*center;/);
  assert.match(produtoStyles, /\.cover-art\s*\{[\s\S]*?background-size:\s*contain;/);
  assert.match(produtoStyles, /\.cover-art\s*\{[\s\S]*?background-repeat:\s*no-repeat;/);
  assert.match(supplierCoverRule, /background-size:\s*contain/);
  assert.doesNotMatch(supplierCoverRule, /118%/);
});

test("product cover stays next to the purchase panel without a tiled background", () => {
  const heroRule = produtoStyles.match(/\.product-hero-bg\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const topRule = produtoStyles.match(/\.product-top\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(heroRule, /background-size:\s*cover/);
  assert.match(heroRule, /background-repeat:\s*no-repeat/);
  assert.match(topRule, /grid-template-columns:\s*minmax\(0, var\(--product-cover-width/);
  assert.match(produtoSource, /closest\("\.product-top"\)\?\.style\.setProperty\("--product-cover-width"/);
});

test("mobile product cover remains in normal flow above the purchase panel", () => {
  const coverRule = produtoStyles.match(/\.product-page \.cover-art\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(coverRule, /position:\s*relative/);
  assert.match(coverRule, /inset:\s*auto/);
  assert.match(coverRule, /height:\s*auto/);
  assert.match(produtoStyles, /@media \(max-width: 520px\)[\s\S]*?\.product-cover\s*\{[\s\S]*?grid-row:\s*1/);
  assert.match(produtoStyles, /@media \(max-width: 520px\)[\s\S]*?\.buy-panel\s*\{[\s\S]*?grid-row:\s*2/);
});

test("initProductPage liga os botões de compra mesmo que uma etapa de render falhe", () => {
  // Se renderRelated (ou qualquer outro passo decorativo) rebentar para um
  // produto com dados inesperados, o clique em "Comprar agora" não pode
  // ficar sem handler nenhum. Cada passo corre isolado e bindProductActions
  // corre sempre a seguir, independentemente do que aconteceu antes.
  assert.match(produtoSource, /function runProductStep\(name, fn\) \{/);
  assert.match(produtoSource, /runProductStep\("bindProductActions", \(\) => bindProductActions\(product\)\)/);
  assert.match(produtoSource, /initProductPage\(\)\.catch\(\(error\) => \{/);
});

test("bindProductActions avisa em consola se nenhum botão de compra for encontrado", () => {
  assert.match(produtoSource, /if \(!buttons\.length\) \{\s*\n\s*console\.error\(/);
});

test("Comprar agora abre o Stripe diretamente sem etapa de identificacao", () => {
  assert.match(produtoSource, /fetch\("\/\.netlify\/functions\/criar-checkout"/);
  assert.match(produtoSource, /window\.location\.assign\(data\.checkoutUrl\)/);
  assert.doesNotMatch(produtoSource, /finalizar-compra\.html/);
});
