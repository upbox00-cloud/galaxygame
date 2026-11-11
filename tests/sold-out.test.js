const test = require("node:test");
const assert = require("node:assert/strict");

const soldOut = require("../netlify/functions/_sold-out");
const adminCatalog = require("../netlify/functions/admin-catalogo");
const checkout = require("../netlify/functions/criar-checkout");
const esgotados = require("../netlify/functions/esgotados");
const publicCatalog = require("../data/catalog-lite.json");

function memoryStore() {
  const values = new Map();
  return {
    async get(key) { return values.get(key) ?? null; },
    async setJSON(key, value) { values.set(key, structuredClone(value)); }
  };
}

const adminContext = { clientContext: { user: { email: "admin@galaxygame.pt", app_metadata: { roles: ["admin"] } } } };

async function withStore(run) {
  const store = memoryStore();
  soldOut._test.setStoreFactory(() => store);
  try { await run(store); } finally { soldOut._test.resetStoreFactory(); }
}

test("sold-out list is persisted, applied and removed", async () => {
  await withStore(async () => {
    await soldOut.setSoldOut("game-ps5", true, "admin@example.com");
    const document = await soldOut.readSoldOut({ strict: true });
    assert.deepEqual(soldOut.soldOutIds(document), ["game-ps5"]);
    const [a, b] = soldOut.applySoldOut([{ id: "game-ps5" }, { id: "other" }], document);
    assert.equal(a.esgotado, true);
    assert.equal(b.esgotado, undefined);
    await soldOut.setSoldOut("game-ps5", false);
    assert.deepEqual(soldOut.soldOutIds(await soldOut.readSoldOut()), []);
  });
});

test("sold-out reads are tolerant, strict reads reject corrupt documents", async () => {
  soldOut._test.setStoreFactory(() => ({ async get() { return { version: 2, items: {} }; } }));
  try {
    await assert.rejects(() => soldOut.readSoldOut({ strict: true }), /invalid_sold_out/);
    assert.deepEqual(soldOut.soldOutIds(await soldOut.readSoldOut()), []);
  } finally { soldOut._test.resetStoreFactory(); }
  soldOut._test.setStoreFactory(() => ({ async get() { throw new Error("blob down"); } }));
  try {
    assert.deepEqual(soldOut.soldOutIds(await soldOut.readSoldOut()), []); // loja continua a vender
  } finally { soldOut._test.resetStoreFactory(); }
});

test("admin can mark a catalog game and a special game (GTA VI) as sold out and back", async () => {
  await withStore(async () => {
    const product = publicCatalog[0];
    for (const id of [product.id, "gta-vi-ps5"]) {
      let response = await adminCatalog.handler({ httpMethod: "POST", body: JSON.stringify({ id, esgotado: true }) }, adminContext);
      assert.equal(response.statusCode, 200);
      assert.equal(JSON.parse(response.body).produto.esgotado, true);
      const publicList = await esgotados.handler({ httpMethod: "GET" });
      assert.ok(JSON.parse(publicList.body).ids.includes(id));
      response = await adminCatalog.handler({ httpMethod: "POST", body: JSON.stringify({ id, esgotado: false }) }, adminContext);
      assert.equal(response.statusCode, 200);
      assert.equal(JSON.parse(response.body).produto.esgotado, undefined);
    }
    const list = JSON.parse((await adminCatalog.handler({ httpMethod: "GET" }, adminContext)).body);
    assert.ok(list.especiais.some((item) => item.id === "gta-vi-ps5"));
  });
});

test("only admins can change sold-out state and unknown products are rejected", async () => {
  await withStore(async (store) => {
    const anonymous = await adminCatalog.handler({ httpMethod: "POST", body: JSON.stringify({ id: publicCatalog[0].id, esgotado: true }) }, {});
    assert.ok([401, 403].includes(anonymous.statusCode));
    assert.equal(await store.get("catalog/sold-out-v1.json"), null);
    const unknown = await adminCatalog.handler({ httpMethod: "POST", body: JSON.stringify({ id: "nao-existe", esgotado: true }) }, adminContext);
    assert.equal(unknown.statusCode, 404);
  });
});

test("checkout refuses sold-out games (direct link or cart) before reaching Stripe", async () => {
  await withStore(async () => {
    await soldOut.setSoldOut("gta-vi-ps5", true, "admin@galaxygame.pt");
    const response = await checkout.handler({ httpMethod: "POST", body: JSON.stringify({ items: [{ id: "gta-vi-ps5" }] }), headers: {} }, {});
    assert.equal(response.statusCode, 409);
    const body = JSON.parse(response.body);
    assert.equal(body.error, "sold_out");
    assert.deepEqual(body.productIds, ["gta-vi-ps5"]);
    const cart = await checkout.handler({ httpMethod: "POST", body: JSON.stringify({ items: [{ id: publicCatalog[0].id }, { id: "gta-vi-ps5" }] }), headers: {} }, {});
    assert.equal(cart.statusCode, 409);
  });
});
