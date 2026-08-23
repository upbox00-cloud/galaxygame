const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const productSource = fs.readFileSync(path.join(root, "produto.js"), "utf8");
const cartSource = fs.readFileSync(path.join(root, "cart.js"), "utf8");
const confirmationSource = fs.readFileSync(path.join(root, "pedido-confirmado.js"), "utf8");
const confirmationHtml = fs.readFileSync(path.join(root, "pedido-confirmado.html"), "utf8");

test("eventos Meta acompanham apenas passos reais do funil", () => {
  assert.match(productSource, /if \(added\) \{[\s\S]*?trackMetaEvent\("AddToCart"/);
  assert.ok(productSource.indexOf('trackMetaEvent("InitiateCheckout"') < productSource.indexOf("window.location.assign(data.checkoutUrl)"));
  assert.ok(cartSource.indexOf('trackMetaEvent("InitiateCheckout"') < cartSource.indexOf("window.location.assign(data.checkoutUrl)"));
  assert.match(productSource, /currency: "EUR"/);
  assert.match(cartSource, /currency: "EUR"/);
  assert.match(productSource, /eventID: data\.checkoutSessionId/);
  assert.match(cartSource, /eventID: data\.checkoutSessionId/);
});

test("Purchase valida no servidor e nao repete na mesma sessao do navegador", () => {
  assert.match(confirmationHtml, /pedido-confirmado\.js\?v=20260822-1/);
  assert.match(confirmationSource, /\.netlify\/functions\/confirmar-compra\?session_id=/);
  assert.match(confirmationSource, /sessionStorage\.getItem\(storageKey\) === "tracked"/);
  assert.match(confirmationSource, /GalaxyGameConsent\?\.hasMarketingConsent\(\)/);
  assert.match(confirmationSource, /galaxygame:consent/);
  assert.match(confirmationSource, /window\.fbq\("track", "Purchase"/);
  assert.match(confirmationSource, /headers: token \? \{ Authorization:/);
  assert.doesNotMatch(confirmationSource, /if \(!user \|\| requestInFlight\) return/);
  assert.ok(confirmationSource.indexOf("window.fbq") < confirmationSource.indexOf("sessionStorage.setItem"));
});
