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
  assert.match(produtoHtml, /produto\.css\?v=20260811-1/);
  assert.match(produtoHtml, /produto\.js\?v=20260811-1/);
  assert.match(produtoSource, /document\.body\.classList\.remove\("product-loading"\)/);
  assert.match(produtoSource, /"assets\/site-cosmic-gaming-bg\.webp"/);

  const heroRule = produtoStyles.match(/\.product-hero-bg\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const coverRule = produtoStyles.match(/\.cover-art\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(heroRule, /gta-vi/i);
  assert.doesNotMatch(coverRule, /gta-vi/i);
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

test("buyNow regista console.error e mostra toast visível em cada ponto de falha", () => {
  const failurePoints = [
    /window\.netlifyIdentity indisponível/,
    /falha ao obter o token de sessão/,
    /falha de rede ao chamar \/\.netlify\/functions\/criar-checkout/,
    /resposta de criar-checkout não é JSON válido/,
    /sessão rejeitada \(401\) ao criar checkout/,
    /não devolveu um checkoutUrl válido/
  ];
  failurePoints.forEach((pattern) => {
    assert.match(produtoSource, pattern, `esperava um console.error com padrão: ${pattern}`);
  });

  // Nunca pode falhar silenciosamente: cada saída de erro tem de mostrar um toast.
  const buyNowMatch = produtoSource.match(/async function buyNow\(product\) \{[\s\S]*?\n\}/);
  assert.ok(buyNowMatch, "função buyNow não encontrada");
  const showToastCalls = buyNowMatch[0].match(/showToast\(/g) || [];
  assert.ok(showToastCalls.length >= 5, "buyNow deveria mostrar um toast em cada ramo de erro");
});
