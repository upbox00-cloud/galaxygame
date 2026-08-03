const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");

const orders = require("../netlify/functions/_orders");
const stripeWebhook = require("../netlify/functions/stripe-webhook");
const checkout = require("../netlify/functions/criar-checkout");

function signedEvent(body, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return {
    httpMethod: "POST",
    body,
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }
  };
}

test("valida a assinatura Stripe e rejeita eventos antigos", () => {
  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_only";
  const body = JSON.stringify({ id: "evt_test" });
  assert.equal(orders.verifyStripeSignature(signedEvent(body, process.env.STRIPE_WEBHOOK_SECRET)), true);
  assert.equal(orders.verifyStripeSignature(signedEvent(body, process.env.STRIPE_WEBHOOK_SECRET, 1)), false);
  assert.equal(orders.verifyStripeSignature({ body, headers: {} }), false);
  if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = previous;
});

test("webhook recusa funcionar sem segredo configurado", async () => {
  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const response = await stripeWebhook.handler({ httpMethod: "POST", body: "{}", headers: {} });
  assert.equal(response.statusCode, 503);
  if (previous !== undefined) process.env.STRIPE_WEBHOOK_SECRET = previous;
});

test("cargo admin só é aceite em app_metadata protegido", () => {
  const unsafeContext = { clientContext: { user: { user_metadata: { roles: ["admin"] }, app_metadata: {} } } };
  const safeContext = { clientContext: { user: { user_metadata: {}, app_metadata: { roles: ["admin"] } } } };
  assert.deepEqual(orders.getUserRoles(unsafeContext), []);
  assert.deepEqual(orders.getUserRoles(safeContext), ["admin"]);
  assert.equal(orders.requireAdmin(unsafeContext).statusCode, 403);
  assert.equal(orders.requireAdmin(safeContext), null);
});

test("extrai produtos compactos guardados nos metadados Stripe", () => {
  const result = orders.parseStripeProducts({
    metadata: {
      items: JSON.stringify([
        { nome: "Jogo A", plataforma: "PlayStation 5" },
        { nome: "Jogo B", plataforma: "Xbox Series X|S" }
      ])
    }
  });
  assert.equal(result.produto, "Jogo A, Jogo B");
  assert.equal(result.plataforma, "PlayStation 5, Xbox Series X|S");
});

test("checkout conhece o catálogo e os destaques manuais", () => {
  const catalog = checkout._test.loadCatalog();
  assert.equal(catalog.get("gta-vi-ps5").precoVendaEUR, 57.99);
  assert.ok(catalog.get("the-witcher-3-wild-hunt-ps5"));
});

test("email de entrega usa tabelas, estilos inline e imagens acessíveis", () => {
  const previousUrl = process.env.URL;
  process.env.URL = "https://galaxygame.example";
  const html = orders.renderCodeEmail({
    clienteNome: "Ana & Rui",
    produto: "Jogo <Especial>",
    plataforma: "PlayStation 5",
    codigo: "ABCD-1234",
    imagem: "https://images.example/cover.jpg"
  });
  assert.match(html, /max-width:600px/);
  assert.match(html, /<table role="presentation"/);
  assert.match(html, /alt="GalaxyGame - Jogos Digitais"/);
  assert.match(html, /alt="Capa de Jogo &lt;Especial&gt;"/);
  assert.match(html, /font-family:'Courier New'/);
  assert.match(html, />ABCD-1234</);
  assert.match(html, />Ver o meu pedido</);
  assert.doesNotMatch(html, /class=/);
  if (previousUrl === undefined) delete process.env.URL;
  else process.env.URL = previousUrl;
});

test("email ignora URLs de capa inseguras", () => {
  const html = orders.renderCodeEmail({
    clienteNome: "Cliente",
    produto: "Jogo",
    plataforma: "Xbox Series X|S",
    codigo: "SAFE-CODE",
    imagem: "javascript:alert(1)"
  });
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /alt="Capa de/);
});
