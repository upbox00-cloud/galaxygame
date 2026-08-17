const test = require("node:test");
const assert = require("node:assert/strict");

const { _test } = require("../scripts/scrape-fornecedor");

test("Alpha Pix discount is preferred over the regular supplier price", () => {
  const prices = _test.variantPrices({
    price_number: 159.9,
    price_with_payment_discount_short: "R$ 148,71",
    popup_discount_visibility: {
      paghiper: { methods: { pix: { show_discount: true } } }
    }
  });
  assert.deepEqual(prices, {
    precoAtualBRL: 148.71,
    precoPixBRL: 148.71,
    precoSemPixBRL: 159.9,
    descontoPixAplicado: true
  });
});
