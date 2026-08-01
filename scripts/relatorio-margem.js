const fs = require("fs");
const path = require("path");

const INTERNAL_PRICE_FILE = path.join(__dirname, ".internal", "catalogo-precos-internos.json");

function formatEUR(value) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

function loadInternalProducts() {
  if (!fs.existsSync(INTERNAL_PRICE_FILE)) {
    throw new Error("Nao encontrei scripts/.internal/catalogo-precos-internos.json. Rode npm run gerar:precos primeiro.");
  }
  const products = JSON.parse(fs.readFileSync(INTERNAL_PRICE_FILE, "utf8"));
  return Array.isArray(products) ? products : [];
}

function main() {
  const products = loadInternalProducts().filter((product) => Number(product.custoFornecedorEUR || 0) > 0);
  if (!products.length) {
    console.log("[Relatorio] Nenhum produto com custo interno para calcular margem.");
    return;
  }

  const totals = products.reduce((acc, product) => {
    const cost = Number(product.custoFornecedorEUR || 0);
    const sale = Number(product.precoVendaEUR || 0);
    acc.cost += cost;
    acc.sale += sale;
    acc.profit += sale - cost;
    acc.marginPercent += cost ? ((sale - cost) / cost) * 100 : 0;
    if (sale <= cost) acc.withoutMargin += 1;
    if (product.travaMargemAcionada) acc.safetyLocked += 1;
    return acc;
  }, { cost: 0, sale: 0, profit: 0, marginPercent: 0, withoutMargin: 0, safetyLocked: 0 });

  const averageMargin = totals.marginPercent / products.length;
  const grossMargin = totals.cost ? (totals.profit / totals.cost) * 100 : 0;

  console.log("[Relatorio de margem]");
  console.log(`Produtos analisados: ${products.length}`);
  console.log(`Custo total fornecedor: ${formatEUR(totals.cost)}`);
  console.log(`Venda total catalogo: ${formatEUR(totals.sale)}`);
  console.log(`Lucro bruto estimado: ${formatEUR(totals.profit)}`);
  console.log(`Margem media geral: ${averageMargin.toFixed(1)}%`);
  console.log(`Margem bruta ponderada: ${grossMargin.toFixed(1)}%`);
  console.log(`Produtos sem margem positiva: ${totals.withoutMargin}`);
  console.log(`Produtos salvos pela trava de margem: ${totals.safetyLocked}`);
}

main();
