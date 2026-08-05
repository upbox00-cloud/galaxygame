const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const produtoSource = fs.readFileSync(path.join(root, "produto.js"), "utf8");

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
