const test = require("node:test");
const assert = require("node:assert/strict");

const { _test } = require("../scripts/gerar-precos");

test("pricing configuration is centralized and includes exchange and Stripe protection", () => {
  assert.equal(_test.PRICING_CONFIG.exchangeSafetyBuffer, 0.04);
  assert.equal(_test.PRICING_CONFIG.minimumMarkup, 0.22);
  assert.equal(_test.PRICING_CONFIG.noCompetitorMarkup, 0.25);
  assert.equal(_test.PRICING_CONFIG.stripePercentageFee, 0.029);
  assert.equal(_test.PRICING_CONFIG.stripeFixedFeeEUR, 0.25);
});

test("exchange buffer is applied on top of the commercial BRL to EUR rate", () => {
  const exchange = _test.exchangeResult(0.166, "test");
  assert.equal(exchange.baseRate, 0.166);
  assert.ok(Math.abs(exchange.effectiveRate - 0.17264) < 1e-10);
});

test("minimum price preserves markup after estimated Stripe fees", () => {
  const price = _test.minimumSalePrice(32.78, 0.22);
  const net = price - (price * 0.029 + 0.25);
  assert.ok(price.toFixed(2).endsWith(".99"));
  assert.ok(net >= 32.78 * 1.22);
});

test("missing competitor uses 25 percent instead of the old 50 percent markup", () => {
  const product = {
    id: "god-of-war-ragnarok-ps5",
    nome: "GOD OF WAR RAGNAROK - PS5",
    plataforma: "PlayStation 5",
    precoAtualBRL: 189.9,
    precoOriginalBRL: 349.9
  };
  const result = _test.makeFinalProduct(product, { sem_referencia: true }, 0.17264);
  assert.equal(result.regraPreco, "sem-concorrente");
  assert.equal(result.precoVendaEUR, 42.99);
  assert.equal(result.taxaStripeConsiderada, true);
});

test("dry run option is explicit and sample size is limited", () => {
  assert.deepEqual(_test.readCliOptions(["--dry-run", "--sample=12"]), {
    dryRun: true,
    forceExchangeRefresh: false,
    sampleSize: 12
  });
  assert.equal(_test.readCliOptions(["--sample=999"]).sampleSize, 50);
});
