const axios = require("axios");
const {
  PLATFORMS,
  saveJson,
  toProductId
} = require("./common");
const { isExcludedProduct } = require("./product-exclusions");

const TCA_BASE_URL = "https://www.lojatcagames.com.br";
const TCA_PRODUCTS_URL = `${TCA_BASE_URL}/collections/all/products.json`;
const PAGE_SIZE = 250;
const MAX_PAGES = 20;
const REQUEST_ATTEMPTS = 3;
const PIX_DISCOUNT_RATE = 0.05;
const MINIMUM_TOTAL_PRODUCTS = 100;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function detectPlatformKeys(product) {
  const title = normalizeText(product?.title);
  const tags = normalizeText(Array.isArray(product?.tags) ? product.tags.join(" ") : product?.tags);
  const text = `${title} ${tags}`;
  const keys = [];

  const hasPs4 = /\bps4\b|playstation\s*4/.test(text);
  const hasPs5 = /\bps5\b|playstation\s*5/.test(text);
  const ps4ForPs5 = /\bps4\b.{0,12}(?:p\/?|para)\s*\bps5\b/.test(title);
  if (hasPs4 && (!hasPs5 || ps4ForPs5)) keys.push("ps4");
  if (hasPs5 && !ps4ForPs5) keys.push("ps5");

  const hasXboxOne = /xbox\s*one/.test(text);
  const hasXboxSeries = /xbox\s*series|series\s*[xs]|\bx\/?s\b|\bs\/?x\b/.test(text);
  if (hasXboxOne) keys.push("xbox-one");
  if (hasXboxSeries) keys.push("xbox-series");
  return [...new Set(keys)];
}

function availableVariants(product) {
  return (Array.isArray(product?.variants) ? product.variants : [])
    .filter((variant) => variant?.available !== false)
    .filter((variant) => Number(variant?.price || 0) > 0);
}

function selectVariant(product, platformKey) {
  const variants = availableVariants(product);
  if (!variants.length) return null;
  if (["ps4", "ps5"].includes(platformKey)) {
    return variants.find((variant) => /prim[aá]ria/i.test(String(variant.title || "")))
      || (variants.length === 1 ? variants[0] : null);
  }
  return variants.find((variant) => /default/i.test(String(variant.title || "")))
    || variants.sort((first, second) => Number(first.price) - Number(second.price))[0];
}

function pixPrice(regularPrice, discountRate = PIX_DISCOUNT_RATE) {
  const value = Number(regularPrice || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor((value * (1 - discountRate)) * 100 + 1e-6) / 100;
}

function absoluteImage(product) {
  const image = product?.images?.[0]?.src || product?.image?.src || product?.image || "";
  if (!image) return "";
  return String(image).startsWith("//") ? `https:${image}` : String(image);
}

function mapProduct(product, platformKey) {
  const platform = PLATFORMS[platformKey];
  const variant = selectVariant(product, platformKey);
  if (!platform || !variant) return null;
  const regularPrice = Number(variant.price || 0);
  const discountedPrice = pixPrice(regularPrice);
  const nome = String(product.title || "").trim();
  if (!nome || !discountedPrice) return null;

  return {
    id: toProductId(nome, platformKey),
    nome,
    precoAtualBRL: discountedPrice,
    precoPixBRL: discountedPrice,
    precoSemPixBRL: regularPrice,
    descontoPixAplicado: discountedPrice < regularPrice,
    precoOriginalBRL: regularPrice,
    tipoMidia: ["ps4", "ps5"].includes(platformKey) ? "Primaria" : "unica",
    linkFornecedor: `${TCA_BASE_URL}/products/${product.handle}`,
    imagemPrincipal: absoluteImage(product),
    plataforma: platform.label,
    plataformaKey: platform.key,
    fornecedorProductId: String(product.id || ""),
    varianteFornecedorId: String(variant.id || ""),
    fornecedorId: "tca",
    fornecedorNome: "TCA Games"
  };
}

async function fetchAllProducts(client = axios) {
  const products = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let response;
    let lastError;
    for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
      try {
        response = await client.get(TCA_PRODUCTS_URL, {
          timeout: 30000,
          proxy: false,
          headers: { accept: "application/json", "user-agent": "GalaxyGame catalog sync/1.0" },
          params: { limit: PAGE_SIZE, page }
        });
        break;
      } catch (error) {
        lastError = error;
        const status = Number(error.response?.status || 0);
        const retryable = !status || status === 429 || status >= 500;
        if (!retryable || attempt === REQUEST_ATTEMPTS) throw error;
        console.warn(`[TCA] Pagina ${page} falhou; nova tentativa ${attempt + 1}/${REQUEST_ATTEMPTS}.`);
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
      }
    }
    if (!response) throw lastError || new Error(`Falha ao obter a pagina ${page} da TCA`);
    const pageProducts = response.data?.products;
    if (!Array.isArray(pageProducts)) throw new Error(`Resposta invalida da TCA na pagina ${page}`);
    products.push(...pageProducts);
    console.log(`[TCA] Pagina ${page}: ${pageProducts.length} produto(s).`);
    if (pageProducts.length < PAGE_SIZE) break;
  }
  if (products.length < MINIMUM_TOTAL_PRODUCTS) {
    throw new Error(`Coleta TCA incompleta: apenas ${products.length} produtos; minimo seguro ${MINIMUM_TOTAL_PRODUCTS}`);
  }
  return products;
}

function groupProducts(products) {
  const grouped = Object.fromEntries(Object.keys(PLATFORMS).map((key) => [key, []]));
  for (const product of products) {
    for (const platformKey of detectPlatformKeys(product)) {
      const mapped = mapProduct(product, platformKey);
      if (mapped && !isExcludedProduct(mapped)) grouped[platformKey].push(mapped);
    }
  }
  for (const key of Object.keys(grouped)) {
    grouped[key] = [...new Map(grouped[key].map((product) => [product.id, product])).values()];
  }
  return grouped;
}

async function main() {
  const products = await fetchAllProducts();
  const grouped = groupProducts(products);
  const total = Object.values(grouped).reduce((sum, items) => sum + items.length, 0);
  if (total < MINIMUM_TOTAL_PRODUCTS) throw new Error(`Catalogo TCA processado abaixo do limite seguro: ${total}`);
  saveJson("raw-tca.json", grouped);
  Object.entries(grouped).forEach(([key, items]) => console.log(`[TCA] ${key}: ${items.length} produto(s) validos.`));
  console.log(`[TCA] Concluido. ${total} produto(s) gravados em data/raw-tca.json.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[TCA] Falha: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports._test = {
  PIX_DISCOUNT_RATE,
  detectPlatformKeys,
  selectVariant,
  pixPrice,
  mapProduct,
  groupProducts
};
