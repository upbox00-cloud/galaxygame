const test = require("node:test");
const assert = require("node:assert/strict");

const priceOverrides = require("../netlify/functions/_price-overrides");
const adminCatalog = require("../netlify/functions/admin-catalogo");
const publicCatalog = require("../data/catalog-lite.json");

function memoryStore() {
  const values = new Map();
  return {
    async get(key) { return values.get(key) || null; },
    async setJSON(key, value) { values.set(key, structuredClone(value)); }
  };
}

test("manual price overrides are persisted and applied to the catalog", async () => {
  priceOverrides._test.setStoreFactory(() => memoryStore.instance ||= memoryStore());
  try {
    await priceOverrides.setPriceOverride("game-ps5", 29.95, "admin@example.com");
    const document = await priceOverrides.readPriceOverrides();
    const [product] = priceOverrides.applyPriceOverrides([{ id: "game-ps5", precoVendaEUR: 24.99 }], document);
    assert.equal(product.precoVendaEUR, 29.95);
    assert.equal(product.precoAutomaticoEUR, 24.99);
    assert.equal(product.precoManual, true);

    await priceOverrides.removePriceOverride("game-ps5");
    const [reset] = priceOverrides.applyPriceOverrides([{ id: "game-ps5", precoVendaEUR: 24.99 }], await priceOverrides.readPriceOverrides());
    assert.equal(reset.precoVendaEUR, 24.99);
    assert.equal(reset.precoManual, undefined);
  } finally {
    delete memoryStore.instance;
    priceOverrides._test.resetStoreFactory();
  }
});

test("invalid manual prices are rejected", async () => {
  await assert.rejects(() => priceOverrides.setPriceOverride("game-ps5", 0.5), /invalid_price/);
  await assert.rejects(() => priceOverrides.setPriceOverride("game-ps5", 1000), /invalid_price/);
});

test("admin catalog returns the persisted manual price after saving", async () => {
  let savedDocument = null;
  priceOverrides._test.setStoreFactory(() => ({
    async get() {
      return savedDocument;
    },
    async setJSON(key, value) {
      savedDocument = structuredClone(value);
    }
  }));

  try {
    const product = publicCatalog[0];
    const response = await adminCatalog.handler({
      httpMethod: "POST",
      body: JSON.stringify({ id: product.id, precoVendaEUR: 31.95 })
    }, {
      clientContext: {
        user: {
          email: "admin@galaxygame.pt",
          app_metadata: { roles: ["admin"] }
        }
      }
    });
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(savedDocument.prices[product.id].precoVendaEUR, 31.95);
    assert.equal(body.produto.id, product.id);
    assert.equal(body.produto.precoVendaEUR, 31.95);
    assert.equal(body.produto.precoManual, true);
    assert.equal(body.produto.precoAutomaticoEUR, product.precoVendaEUR);
  } finally {
    priceOverrides._test.resetStoreFactory();
  }
});

test("price update is not confirmed when Blob cannot be read back", async () => {
  let writes = 0;
  priceOverrides._test.setStoreFactory(() => ({
    async get() { throw new Error("Blob unavailable"); },
    async setJSON() { writes += 1; }
  }));
  try {
    await assert.rejects(() => priceOverrides.setPriceOverride("game-ps5", 29.95), /Blob unavailable/);
    assert.equal(writes, 0);
  } finally {
    priceOverrides._test.resetStoreFactory();
  }
});

test("price update rejects a write that is not persisted", async () => {
  priceOverrides._test.setStoreFactory(() => ({
    async get() { return null; },
    async setJSON() {}
  }));
  try {
    await assert.rejects(() => priceOverrides.setPriceOverride("game-ps5", 29.95), /price_update_not_confirmed/);
  } finally {
    priceOverrides._test.resetStoreFactory();
  }
});
