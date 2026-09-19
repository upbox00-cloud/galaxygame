const test = require("node:test");
const assert = require("node:assert/strict");

const priceOverrides = require("../netlify/functions/_price-overrides");

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
