const { getStore } = require("@netlify/blobs");

const STORE_NAME = "galaxygame-orders";
const STORE_KEY = "catalog/price-overrides-v1.json";
const MIN_PRICE_EUR = 0.99;
const MAX_PRICE_EUR = 999.99;

let storeFactory = () => getStore(STORE_NAME);

function normalizePrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price < MIN_PRICE_EUR || price > MAX_PRICE_EUR) return null;
  return Number(price.toFixed(2));
}

function normalizeDocument(value) {
  const source = value && typeof value === "object" ? value : {};
  const prices = {};
  Object.entries(source.prices || {}).forEach(([id, entry]) => {
    const price = normalizePrice(entry?.precoVendaEUR);
    if (!id || price === null) return;
    prices[id] = {
      precoVendaEUR: price,
      updatedAt: String(entry.updatedAt || ""),
      updatedBy: String(entry.updatedBy || "").slice(0, 254)
    };
  });
  return { version: 1, prices };
}

async function readPriceOverrides() {
  try {
    const stored = await storeFactory().get(STORE_KEY, { type: "json", consistency: "strong" });
    return normalizeDocument(stored);
  } catch (error) {
    console.warn("[price-overrides:read]", { message: error.message });
    return normalizeDocument(null);
  }
}

async function setPriceOverride(productId, price, updatedBy = "") {
  const id = String(productId || "").trim();
  const normalizedPrice = normalizePrice(price);
  if (!id || id.length > 180 || normalizedPrice === null) {
    const error = new Error("invalid_price");
    error.code = "invalid_price";
    throw error;
  }
  const document = await readPriceOverrides();
  document.prices[id] = {
    precoVendaEUR: normalizedPrice,
    updatedAt: new Date().toISOString(),
    updatedBy: String(updatedBy || "").slice(0, 254)
  };
  await storeFactory().setJSON(STORE_KEY, document);
  return document.prices[id];
}

async function removePriceOverride(productId) {
  const id = String(productId || "").trim();
  const document = await readPriceOverrides();
  delete document.prices[id];
  await storeFactory().setJSON(STORE_KEY, document);
}

function applyPriceOverrides(products, document) {
  const prices = normalizeDocument(document).prices;
  return products.map((product) => {
    const override = prices[product.id];
    if (!override) return product;
    return {
      ...product,
      precoVendaEUR: override.precoVendaEUR,
      precoManual: true,
      precoAutomaticoEUR: Number(product.precoVendaEUR || 0),
      precoManualAtualizadoEm: override.updatedAt
    };
  });
}

module.exports = {
  MIN_PRICE_EUR,
  MAX_PRICE_EUR,
  readPriceOverrides,
  setPriceOverride,
  removePriceOverride,
  applyPriceOverrides,
  _test: {
    normalizePrice,
    normalizeDocument,
    setStoreFactory(factory) { storeFactory = factory; },
    resetStoreFactory() { storeFactory = () => getStore(STORE_NAME); }
  }
};
