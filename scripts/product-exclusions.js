function productSearchText(product) {
  return [
    product?.id,
    product?.nome,
    product?.name,
    product?.titulo,
    product?.plataforma,
    product?.catalogPlatform
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isExcludedProduct(product) {
  const text = productSearchText(product);
  return /\bgame\s*pass\b/.test(text) || /\bgamepass\b/.test(text);
}

module.exports = {
  isExcludedProduct
};
