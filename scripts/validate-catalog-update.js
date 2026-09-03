const fs = require("node:fs");

const beforePath = process.argv[2];
const afterPath = process.argv[3] || "data/catalog-lite.json";
const MAXIMUM_DROP_RATE = 0.2;

function readCatalog(file) {
  const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(catalog)) throw new Error(`${file} nao contem uma lista`);
  return catalog;
}

function validateProducts(products) {
  const ids = new Set();
  for (const product of products) {
    if (!product?.id || !product?.nome || !product?.plataforma) {
      throw new Error(`Produto incompleto: ${JSON.stringify(product).slice(0, 180)}`);
    }
    if (ids.has(product.id)) throw new Error(`Produto duplicado: ${product.id}`);
    ids.add(product.id);
    const price = Number(product.precoVendaEUR || 0);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Preco invalido: ${product.id}`);
  }
}

function validateCatalogUpdate(before, after) {
  validateProducts(after);
  if (before.length > 0 && after.length < before.length * (1 - MAXIMUM_DROP_RATE)) {
    throw new Error(`Atualizacao removeria demasiados produtos: ${before.length} -> ${after.length}`);
  }
  return {
    before: before.length,
    after: after.length,
    difference: after.length - before.length
  };
}

function main() {
  if (!beforePath) throw new Error("Uso: node scripts/validate-catalog-update.js <catalogo-anterior> [catalogo-novo]");
  const result = validateCatalogUpdate(readCatalog(beforePath), readCatalog(afterPath));
  console.log(`[Catalogo] Validacao segura: ${result.before} -> ${result.after} (${result.difference >= 0 ? "+" : ""}${result.difference}).`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[Catalogo] Publicacao bloqueada: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { MAXIMUM_DROP_RATE, validateCatalogUpdate };
