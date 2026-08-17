const publicCatalog = require("../../data/catalog-lite.json");
const commercialCatalog = require("./_data/catalogo-comercial.json");

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(mid(?:ia|ia) digital|edicao digital|primaria|secundaria)\b/g, " ")
    .replace(/\b(ps4|ps5|playstation 4|playstation 5|xbox one|xbox series(?: x\|s| s\/x)?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePlatform(value) {
  const platform = String(value || "").toLowerCase();
  if (/playstation\s*5|\bps5\b/.test(platform)) return "ps5";
  if (/playstation\s*4|\bps4\b/.test(platform)) return "ps4";
  if (/xbox\s*series/.test(platform)) return "xbox-series";
  if (/xbox\s*one/.test(platform)) return "xbox-one";
  return normalize(value);
}

function productsWithCommercialData() {
  const commercialById = new Map(commercialCatalog.map((product) => [product.id, product]));
  return publicCatalog.map((product) => ({
    ...product,
    ...(commercialById.get(product.id) || {})
  }));
}

function supplierForOrder(order, products = productsWithCommercialData()) {
  if (order?.fornecedor && order?.linkFornecedor) return {};

  const orderName = normalize(order?.produto);
  const orderPlatform = normalizePlatform(order?.plataforma);
  if (!orderName) return {};

  const matches = products.filter((product) => normalize(product.nome) === orderName);
  const product = matches.find((item) => !orderPlatform || normalizePlatform(item.plataforma) === orderPlatform)
    || matches[0];
  if (!product?.fornecedorSelecionado) return {};

  return {
    fornecedor: product.fornecedorSelecionado,
    custoFornecedorBRL: Number(product.custoFornecedorBRL || 0),
    linkFornecedor: product.linkFornecedorSelecionado || ""
  };
}

module.exports = {
  normalize,
  normalizePlatform,
  productsWithCommercialData,
  supplierForOrder
};
