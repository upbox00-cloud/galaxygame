const { getStore } = require("@netlify/blobs");

// Lista de jogos esgotados, guardada à parte dos preços (mesmo store, chave própria).
const STORE_NAME = "galaxygame-orders";
const STORE_KEY = "catalog/sold-out-v1.json";

// Produtos que existem no checkout/landing mas não estão no catálogo público (catalog-lite.json).
const SPECIAL_PRODUCTS = [
  { id: "gta-vi-ps5", nome: "Grand Theft Auto VI - PlayStation 5", plataforma: "PlayStation 5", soEsgotado: true },
  { id: "gta-vi-xbox-series", nome: "Grand Theft Auto VI - Xbox Series X|S", plataforma: "Xbox Series X|S", soEsgotado: true }
];

let storeFactory = () => getStore(STORE_NAME);

function validId(value) {
  const id = String(value ?? "").trim();
  return id && id.length <= 180 ? id : "";
}

function normalizeDocument(value) {
  const source = value && typeof value === "object" ? value : {};
  const items = {};
  Object.entries(source.items && typeof source.items === "object" && !Array.isArray(source.items) ? source.items : {}).forEach(([id, entry]) => {
    if (!validId(id)) return;
    items[id] = {
      esgotadoEm: String(entry?.esgotadoEm || ""),
      updatedBy: String(entry?.updatedBy || "").slice(0, 254)
    };
  });
  return { version: 1, items };
}

function validateStoredDocument(value) {
  if (value === null || value === undefined) return;
  if (typeof value !== "object" || Array.isArray(value) ||
      (value.version !== undefined && value.version !== 1) ||
      !value.items || typeof value.items !== "object" || Array.isArray(value.items))
    throw new Error("invalid_sold_out");
  for (const [id, entry] of Object.entries(value.items)) {
    if (!validId(id) || !entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("invalid_sold_out");
  }
}

// Leitura tolerante: se o armazenamento falhar, a loja continua a vender (igual aos preços manuais).
async function readSoldOut({ strict = false } = {}) {
  try {
    const stored = await storeFactory().get(STORE_KEY, { type: "json" });
    if (strict) validateStoredDocument(stored);
    return normalizeDocument(stored);
  } catch (error) {
    if (strict) throw error;
    console.warn("[sold-out:read]", { message: error.message });
    return normalizeDocument(null);
  }
}

async function setSoldOut(productId, soldOut, updatedBy = "") {
  const id = validId(productId);
  if (!id) {
    const error = new Error("invalid_product");
    error.code = "invalid_product";
    throw error;
  }
  const document = await readSoldOut({ strict: true });
  if (soldOut) {
    document.items[id] = { esgotadoEm: new Date().toISOString(), updatedBy: String(updatedBy || "").slice(0, 254) };
  } else {
    delete document.items[id];
  }
  await storeFactory().setJSON(STORE_KEY, document);
  return document;
}

function soldOutIds(document) {
  return Object.keys(normalizeDocument(document).items);
}

function applySoldOut(products, document) {
  const items = normalizeDocument(document).items;
  return products.map((product) => (Object.hasOwn(items, product.id)
    ? { ...product, esgotado: true, esgotadoEm: items[product.id].esgotadoEm }
    : product));
}

module.exports = {
  SPECIAL_PRODUCTS,
  readSoldOut,
  setSoldOut,
  soldOutIds,
  applySoldOut,
  _test: {
    normalizeDocument,
    setStoreFactory(factory) { storeFactory = factory; },
    resetStoreFactory() { storeFactory = () => getStore(STORE_NAME); }
  }
};
