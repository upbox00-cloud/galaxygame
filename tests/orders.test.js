const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");

const orders = require("../netlify/functions/_orders");
const stripeWebhook = require("../netlify/functions/stripe-webhook");
const checkout = require("../netlify/functions/criar-checkout");
const adminOrders = require("../netlify/functions/admin-pedidos");
const updateOrderStatus = require("../netlify/functions/atualizar-pedido-status");
const sendOrder = require("../netlify/functions/marcar-pedido-enviado");
const customerOrders = require("../netlify/functions/meus-pedidos");
const sitePresence = require("../netlify/functions/site-presence");

function signedEvent(body, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return {
    httpMethod: "POST",
    body,
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }
  };
}

function createMemoryStore() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key) || null;
    },
    async setJSON(key, value) {
      values.set(key, structuredClone(value));
      return { etag: "test" };
    },
    async delete(key) {
      values.delete(key);
    },
    list(options = {}) {
      const page = { blobs: [...values.keys()].map((key) => ({ key })), directories: [] };
      if (options.paginate) return (async function* pages() { yield page; })();
      return Promise.resolve(page);
    }
  };
}

function createEventuallyConsistentMemoryStore() {
  const values = new Map();
  const staleValues = new Map();
  return {
    async get(key) {
      return structuredClone(staleValues.get(key) || values.get(key) || null);
    },
    async setJSON(key, value) {
      if (!staleValues.has(key) && values.has(key)) staleValues.set(key, structuredClone(values.get(key)));
      values.set(key, structuredClone(value));
      return { etag: "test" };
    },
    async delete(key) { values.delete(key); staleValues.delete(key); },
    list(options = {}) {
      const page = { blobs: [...values.keys()].map((key) => ({ key })), directories: [] };
      if (options.paginate) return (async function* pages() { yield page; })();
      return Promise.resolve(page);
    },
    latest(key) { return structuredClone(values.get(key) || null); }
  };
}

test("linhas vazias do Airtable não são tratadas como pedidos", () => {
  assert.equal(orders.isMeaningfulOrder(orders.normalizeOrder({ id: "recEmpty", fields: {} })), false);
  assert.equal(orders.isMeaningfulOrder(orders.normalizeOrder({
    id: "recPaid",
    fields: {
      ClienteEmail: "cliente@example.com",
      Produto: "Jogo digital",
      StripeSessionId: "cs_test_paid"
    }
  })), true);
});

test("presença regista sessões anónimas e só revela a contagem ao admin", async () => {
  const store = createMemoryStore();
  sitePresence._test.setStoreFactory(() => store);
  const heartbeat = await sitePresence.handler({
    httpMethod: "POST",
    body: JSON.stringify({ visitorId: "visitante_anonimo_123456", page: "/catalogo.html?busca=gta" })
  }, {});
  assert.equal(heartbeat.statusCode, 200);

  const denied = await sitePresence.handler({ httpMethod: "GET" }, {});
  assert.equal(denied.statusCode, 401);

  const previousEmails = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "admin@galaxygame.pt";
  const allowed = await sitePresence.handler({ httpMethod: "GET" }, {
    clientContext: { user: { email: "admin@galaxygame.pt", app_metadata: {} } }
  });
  const payload = JSON.parse(allowed.body);
  assert.equal(allowed.statusCode, 200);
  assert.equal(payload.active, 1);
  assert.deepEqual(payload.pages, [{ page: "/catalogo.html", count: 1 }]);
  if (previousEmails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = previousEmails;
  sitePresence._test.resetStoreFactory();
});

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
  const previousEmails = process.env.ADMIN_EMAILS;
  delete process.env.ADMIN_EMAILS;
  const unsafeContext = { clientContext: { user: { user_metadata: { roles: ["admin"] }, app_metadata: {} } } };
  const safeContext = { clientContext: { user: { user_metadata: {}, app_metadata: { roles: ["admin"] } } } };
  assert.deepEqual(orders.getUserRoles(unsafeContext), []);
  assert.deepEqual(orders.getUserRoles(safeContext), ["admin"]);
  assert.equal(orders.requireAdmin(unsafeContext).statusCode, 403);
  assert.equal(orders.requireAdmin(safeContext), null);
  if (previousEmails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = previousEmails;
});

test("ADMIN_EMAILS limita o painel ao email confirmado no token", () => {
  const previousEmails = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "dono@galaxygame.pt, segunda@galaxygame.pt";
  const allowed = { clientContext: { user: { email: "DONO@galaxygame.pt", app_metadata: {} } } };
  const denied = { clientContext: { user: { email: "cliente@example.com", app_metadata: { roles: ["admin"] } } } };
  assert.deepEqual(orders.getConfiguredAdminEmails(), ["dono@galaxygame.pt", "segunda@galaxygame.pt"]);
  assert.equal(orders.requireAdmin(allowed), null);
  assert.equal(orders.requireAdmin(denied).statusCode, 403);
  if (previousEmails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = previousEmails;
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

test("checkout cobra apenas em euros e pede meios de pagamento portugueses", async () => {
  const previousSecret = process.env.STRIPE_SECRET_KEY;
  const previousMethods = process.env.STRIPE_PAYMENT_METHOD_TYPES;
  const originalFetch = global.fetch;
  let request;
  process.env.STRIPE_SECRET_KEY = "sk_test_only";
  delete process.env.STRIPE_PAYMENT_METHOD_TYPES;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ url: "https://checkout.stripe.test/session" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    await checkout._test.createStripeCheckout([
      { id: "jogo", nome: "Jogo", plataforma: "PlayStation 5", precoVendaEUR: 19.99 }
    ], { email: "cliente@example.com", name: "Cliente" });
    const params = new URLSearchParams(request.options.body);
    const methods = [...params.entries()]
      .filter(([key]) => key.startsWith("payment_method_types["))
      .map(([, value]) => value);
    assert.equal(params.get("line_items[0][price_data][currency]"), "eur");
    assert.equal(params.get("adaptive_pricing[enabled]"), "false");
    assert.equal(
      params.get("success_url"),
      "https://galaxygame.pt/pedido-confirmado.html?session_id={CHECKOUT_SESSION_ID}"
    );
    assert.equal(params.get("cancel_url"), "https://galaxygame.pt/carrinho.html?checkout=cancelado");
    assert.deepEqual(methods, ["card", "link", "mb_way", "multibanco", "klarna", "paypal"]);
    assert.equal(request.options.headers["stripe-version"], "2025-10-29.clover");
  } finally {
    global.fetch = originalFetch;
    if (previousSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousSecret;
    if (previousMethods === undefined) delete process.env.STRIPE_PAYMENT_METHOD_TYPES;
    else process.env.STRIPE_PAYMENT_METHOD_TYPES = previousMethods;
  }
});

test("Airtable adapta Status para Estado quando a base usa o nome portugues", async () => {
  const previousBase = process.env.AIRTABLE_BASE_ID;
  const previousToken = process.env.AIRTABLE_TOKEN;
  const originalFetch = global.fetch;
  const requests = [];
  process.env.AIRTABLE_BASE_ID = "app_test";
  process.env.AIRTABLE_TOKEN = "pat_test";
  global.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    requests.push(payload);
    if (requests.length === 1) {
      return new Response(JSON.stringify({ error: { message: 'Unknown field name: "Status"' } }), {
        status: 422,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({
      records: [{ id: "rec_test", fields: payload.records[0].fields }]
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const order = await orders.upsertOrderByStripeSessionId({
      ClienteEmail: "cliente@example.com",
      Produto: "Jogo teste",
      Status: "Aguardando codigo",
      StripeSessionId: "cs_test_airtable"
    });
    assert.equal(requests.length, 2);
    assert.equal(requests[1].records[0].fields.Status, undefined);
    assert.equal(requests[1].records[0].fields.Estado, "Aguardando codigo");
    assert.equal(order.status, "Aguardando codigo");
  } finally {
    global.fetch = originalFetch;
    if (previousBase === undefined) delete process.env.AIRTABLE_BASE_ID;
    else process.env.AIRTABLE_BASE_ID = previousBase;
    if (previousToken === undefined) delete process.env.AIRTABLE_TOKEN;
    else process.env.AIRTABLE_TOKEN = previousToken;
  }
});

test("pedidos continuam disponiveis em Netlify Blobs quando o Airtable falha", async () => {
  const previousBase = process.env.AIRTABLE_BASE_ID;
  const previousToken = process.env.AIRTABLE_TOKEN;
  const store = createMemoryStore();
  delete process.env.AIRTABLE_BASE_ID;
  delete process.env.AIRTABLE_TOKEN;
  orders._test.setOrdersStoreFactory(() => store);

  try {
    const created = await orders.persistOrder({
      ClienteEmail: "cliente@example.com",
      ClienteNome: "Cliente",
      Produto: "Jogo teste",
      Plataforma: "PlayStation 5",
      ValorPagoEUR: 19.99,
      Status: "Aguardando codigo",
      Codigo: "",
      DataCompra: "2026-08-10T10:00:00.000Z",
      StripeSessionId: "cs_test_blob"
    });
    assert.equal(created.id, "blob_cs_test_blob");

    const customerOrders = await orders.listPersistedOrders({ email: "cliente@example.com" });
    assert.equal(customerOrders.length, 1);
    assert.equal(customerOrders[0].produto, "Jogo teste");

    const sent = await orders.updatePersistedOrder(created.id, { Status: "Enviado", Codigo: "CODE-123" });
    assert.equal(sent.status, "Enviado");
    assert.equal(sent.codigo, "CODE-123");
  } finally {
    orders._test.setOrdersStoreFactory();
    if (previousBase === undefined) delete process.env.AIRTABLE_BASE_ID;
    else process.env.AIRTABLE_BASE_ID = previousBase;
    if (previousToken === undefined) delete process.env.AIRTABLE_TOKEN;
    else process.env.AIRTABLE_TOKEN = previousToken;
  }
});

test("painel lista, cancela e reabre pedidos apenas para o email administrador", async () => {
  const previousBase = process.env.AIRTABLE_BASE_ID;
  const previousToken = process.env.AIRTABLE_TOKEN;
  const previousAdmins = process.env.ADMIN_EMAILS;
  delete process.env.AIRTABLE_BASE_ID;
  delete process.env.AIRTABLE_TOKEN;
  process.env.ADMIN_EMAILS = "admin@galaxygame.pt";
  const store = createMemoryStore();
  orders._test.setOrdersStoreFactory(() => store);
  const adminContext = { clientContext: { user: { email: "admin@galaxygame.pt", app_metadata: {} } } };

  try {
    const created = await orders.persistOrder({
      ClienteEmail: "cliente@example.com",
      Produto: "Jogo do painel",
      Plataforma: "Xbox Series X|S",
      ValorPagoEUR: 29.99,
      Status: "Aguardando codigo",
      DataCompra: "2026-08-10T20:00:00.000Z",
      StripeSessionId: "cs_test_admin"
    });
    const denied = await adminOrders.handler({ httpMethod: "GET", rawQuery: "status=all" }, {
      clientContext: { user: { email: "cliente@example.com", app_metadata: { roles: ["admin"] } } }
    });
    assert.equal(denied.statusCode, 403);

    const listed = await adminOrders.handler({ httpMethod: "GET", rawQuery: "status=all" }, adminContext);
    assert.equal(listed.statusCode, 200);
    assert.equal(JSON.parse(listed.body).pedidos[0].produto, "Jogo do painel");

    const cancelled = await updateOrderStatus.handler({
      httpMethod: "POST",
      body: JSON.stringify({ recordId: created.id, status: "Cancelado" })
    }, adminContext);
    assert.equal(cancelled.statusCode, 200);
    assert.equal(JSON.parse(cancelled.body).pedido.status, "Cancelado");

    const reopened = await updateOrderStatus.handler({
      httpMethod: "POST",
      body: JSON.stringify({ recordId: created.id, status: "Aguardando codigo" })
    }, adminContext);
    assert.equal(reopened.statusCode, 200);
    assert.equal(JSON.parse(reopened.body).pedido.status, "Aguardando codigo");
  } finally {
    orders._test.setOrdersStoreFactory();
    if (previousBase === undefined) delete process.env.AIRTABLE_BASE_ID;
    else process.env.AIRTABLE_BASE_ID = previousBase;
    if (previousToken === undefined) delete process.env.AIRTABLE_TOKEN;
    else process.env.AIRTABLE_TOKEN = previousToken;
    if (previousAdmins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previousAdmins;
  }
});

test("pedido do Airtable continua atualizavel quando a coluna de estado e recusada", async () => {
  const previousBase = process.env.AIRTABLE_BASE_ID;
  const previousToken = process.env.AIRTABLE_TOKEN;
  const originalFetch = global.fetch;
  const store = createMemoryStore();
  process.env.AIRTABLE_BASE_ID = "app_test";
  process.env.AIRTABLE_TOKEN = "pat_test";
  orders._test.setOrdersStoreFactory(() => store);
  await store.setJSON("orders/cs_test_schema.json", {
    clienteEmail: "cliente@example.com",
    clienteNome: "Cliente",
    produto: "Jogo com esquema antigo",
    plataforma: "PlayStation 5",
    valorPagoEUR: 19.99,
    status: "Aguardando codigo",
    codigo: "",
    dataCompra: "2026-08-13T10:00:00.000Z",
    stripeSessionId: "cs_test_schema"
  });
  global.fetch = async (_url, options = {}) => {
    if ((options.method || "GET") === "PATCH") {
      return new Response(JSON.stringify({ error: { message: 'Unknown field name: "Status"' } }), {
        status: 422,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ records: [{
      id: "recSchema123",
      fields: {
        ClienteEmail: "cliente@example.com",
        ClienteNome: "Cliente",
        Produto: "Jogo com esquema antigo",
        Plataforma: "PlayStation 5",
        ValorPagoEUR: 19.99,
        Estado: "Aguardando codigo",
        DataCompra: "2026-08-13T10:00:00.000Z",
        StripeSessionId: "cs_test_schema"
      }
    }] }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const updated = await orders.updatePersistedOrder("recSchema123", { Status: "Cancelado" });
    assert.equal(updated.status, "Cancelado");
    const stored = await store.get("orders/cs_test_schema.json");
    assert.equal(stored.status, "Cancelado");
  } finally {
    global.fetch = originalFetch;
    orders._test.setOrdersStoreFactory();
    if (previousBase === undefined) delete process.env.AIRTABLE_BASE_ID;
    else process.env.AIRTABLE_BASE_ID = previousBase;
    if (previousToken === undefined) delete process.env.AIRTABLE_TOKEN;
    else process.env.AIRTABLE_TOKEN = previousToken;
  }
});

test("Minha Conta encontra a entrega por leitura direta mesmo antes do Blob aparecer na listagem", async () => {
  const previousBase = process.env.AIRTABLE_BASE_ID;
  const previousToken = process.env.AIRTABLE_TOKEN;
  const originalFetch = global.fetch;
  const store = createMemoryStore();
  process.env.AIRTABLE_BASE_ID = "app_test";
  process.env.AIRTABLE_TOKEN = "pat_test";
  orders._test.setOrdersStoreFactory(() => store);
  await store.setJSON("orders/cs_test_direct_delivery.json", {
    clienteEmail: "cliente@example.com",
    clienteNome: "Cliente",
    produto: "Jogo entregue",
    plataforma: "PlayStation 5",
    valorPagoEUR: 29.99,
    status: "Enviado",
    codigo: "Email: conta@example.com\nPalavra-passe: teste",
    dataCompra: "2026-08-14T10:00:00.000Z",
    stripeSessionId: "cs_test_direct_delivery"
  });
  store.list = async function listWithoutNewKey() {
    return { blobs: [], directories: [] };
  };
  global.fetch = async () => new Response(JSON.stringify({ records: [{
    id: "recDirect123",
    fields: {
      ClienteEmail: "cliente@example.com",
      ClienteNome: "Cliente",
      Produto: "Jogo entregue",
      Plataforma: "PlayStation 5",
      ValorPagoEUR: 29.99,
      DataCompra: "2026-08-14T10:00:00.000Z",
      StripeSessionId: "cs_test_direct_delivery"
    }
  }] }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const listed = await orders.listPersistedOrders({ email: "cliente@example.com" });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].status, "Enviado");
    assert.match(listed[0].codigo, /conta@example\.com/);
  } finally {
    global.fetch = originalFetch;
    orders._test.setOrdersStoreFactory();
    if (previousBase === undefined) delete process.env.AIRTABLE_BASE_ID;
    else process.env.AIRTABLE_BASE_ID = previousBase;
    if (previousToken === undefined) delete process.env.AIRTABLE_TOKEN;
    else process.env.AIRTABLE_TOKEN = previousToken;
  }
});

test("cancelamento confirma o novo estado mesmo com leitura eventual do Blobs", async () => {
  const previousBase = process.env.AIRTABLE_BASE_ID;
  const previousToken = process.env.AIRTABLE_TOKEN;
  const originalFetch = global.fetch;
  const store = createEventuallyConsistentMemoryStore();
  process.env.AIRTABLE_BASE_ID = "app_test";
  process.env.AIRTABLE_TOKEN = "pat_test";
  orders._test.setOrdersStoreFactory(() => store);
  await store.setJSON("orders/cs_test_eventual.json", {
    clienteEmail: "cliente@example.com",
    produto: "Jogo eventual",
    plataforma: "PlayStation 5",
    status: "Aguardando codigo",
    stripeSessionId: "cs_test_eventual"
  });
  global.fetch = async (_url, options = {}) => {
    const status = (options.method || "GET") === "PATCH" ? "Cancelado" : "Aguardando codigo";
    return new Response(JSON.stringify({ records: [{
      id: "recEventual123",
      fields: {
        ClienteEmail: "cliente@example.com",
        Produto: "Jogo eventual",
        Plataforma: "PlayStation 5",
        Estado: status,
        StripeSessionId: "cs_test_eventual"
      }
    }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const updated = await orders.updatePersistedOrder("recEventual123", { Status: "Cancelado" });
    assert.equal(updated.status, "Cancelado");
    assert.equal(store.latest("orders/cs_test_eventual.json").status, "Cancelado");
  } finally {
    global.fetch = originalFetch;
    orders._test.setOrdersStoreFactory();
    if (previousBase === undefined) delete process.env.AIRTABLE_BASE_ID;
    else process.env.AIRTABLE_BASE_ID = previousBase;
    if (previousToken === undefined) delete process.env.AIRTABLE_TOKEN;
    else process.env.AIRTABLE_TOKEN = previousToken;
  }
});

test("function de cancelamento responde com o estado pedido depois de uma escrita valida", async () => {
  const previousBase = process.env.AIRTABLE_BASE_ID;
  const previousToken = process.env.AIRTABLE_TOKEN;
  const previousAdmins = process.env.ADMIN_EMAILS;
  const originalFetch = global.fetch;
  const store = createEventuallyConsistentMemoryStore();
  process.env.AIRTABLE_BASE_ID = "app_test";
  process.env.AIRTABLE_TOKEN = "pat_test";
  process.env.ADMIN_EMAILS = "admin@galaxygame.pt";
  orders._test.setOrdersStoreFactory(() => store);
  await store.setJSON("orders/cs_test_cancel_function.json", {
    clienteEmail: "cliente@example.com",
    produto: "Jogo para cancelar",
    plataforma: "PlayStation 5",
    status: "Aguardando codigo",
    stripeSessionId: "cs_test_cancel_function"
  });
  global.fetch = async (_url, options = {}) => {
    const requested = options.body ? JSON.parse(options.body) : {};
    const status = requested.records?.[0]?.fields?.Status || "Aguardando codigo";
    return new Response(JSON.stringify({ records: [{
      id: "recCancelFunction123",
      fields: {
        ClienteEmail: "cliente@example.com",
        Produto: "Jogo para cancelar",
        Plataforma: "PlayStation 5",
        Status: status,
        StripeSessionId: "cs_test_cancel_function"
      }
    }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await updateOrderStatus.handler({
      httpMethod: "POST",
      body: JSON.stringify({ recordId: "recCancelFunction123", status: "Cancelado" })
    }, { clientContext: { user: { email: "admin@galaxygame.pt", app_metadata: {} } } });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).pedido.status, "Cancelado");
  } finally {
    global.fetch = originalFetch;
    orders._test.setOrdersStoreFactory();
    if (previousBase === undefined) delete process.env.AIRTABLE_BASE_ID;
    else process.env.AIRTABLE_BASE_ID = previousBase;
    if (previousToken === undefined) delete process.env.AIRTABLE_TOKEN;
    else process.env.AIRTABLE_TOKEN = previousToken;
    if (previousAdmins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previousAdmins;
  }
});

test("entrega administrativa guarda o codigo, envia email e atualiza Minha Conta", async () => {
  const previousBase = process.env.AIRTABLE_BASE_ID;
  const previousToken = process.env.AIRTABLE_TOKEN;
  const previousAdmins = process.env.ADMIN_EMAILS;
  const previousResend = process.env.RESEND_API_KEY;
  const originalFetch = global.fetch;
  delete process.env.AIRTABLE_BASE_ID;
  delete process.env.AIRTABLE_TOKEN;
  process.env.ADMIN_EMAILS = "admin@galaxygame.pt";
  process.env.RESEND_API_KEY = "re_test_only";
  const store = createMemoryStore();
  orders._test.setOrdersStoreFactory(() => store);
  global.fetch = async () => new Response(JSON.stringify({ id: "email_delivery_test" }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
  const adminContext = { clientContext: { user: { email: "admin@galaxygame.pt", app_metadata: {} } } };

  try {
    const created = await orders.persistOrder({
      ClienteEmail: "cliente@example.com",
      ClienteNome: "Cliente",
      Produto: "Jogo entregue",
      Plataforma: "PlayStation 5",
      ValorPagoEUR: 39.99,
      Status: "Aguardando codigo",
      DataCompra: "2026-08-10T21:00:00.000Z",
      StripeSessionId: "cs_test_delivery"
    });
    const delivered = await sendOrder.handler({
      httpMethod: "POST",
      body: JSON.stringify({ recordId: created.id, codigo: "CONTA: cliente / SENHA: teste" })
    }, adminContext);
    assert.equal(delivered.statusCode, 200);
    assert.equal(JSON.parse(delivered.body).pedido.status, "Enviado");

    const account = await customerOrders.handler({ httpMethod: "GET" }, {
      clientContext: { user: { email: "cliente@example.com" } }
    });
    const accountOrder = JSON.parse(account.body).pedidos[0];
    assert.equal(accountOrder.status, "Enviado");
    assert.equal(accountOrder.codigo, "CONTA: cliente / SENHA: teste");
  } finally {
    global.fetch = originalFetch;
    orders._test.setOrdersStoreFactory();
    if (previousBase === undefined) delete process.env.AIRTABLE_BASE_ID;
    else process.env.AIRTABLE_BASE_ID = previousBase;
    if (previousToken === undefined) delete process.env.AIRTABLE_TOKEN;
    else process.env.AIRTABLE_TOKEN = previousToken;
    if (previousAdmins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previousAdmins;
    if (previousResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousResend;
  }
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
  assert.match(html, /galaxygame-email-banner\.jpg/);
  assert.match(html, /<img[^>]+width="600"[^>]+alt="GalaxyGame - Jogos Digitais"/);
  assert.match(html, /alt="GalaxyGame - Jogos Digitais"/);
  assert.match(html, /alt="Capa de Jogo &lt;Especial&gt;"/);
  assert.match(html, /font-family:'Courier New'/);
  assert.match(html, />ABCD-1234</);
  assert.match(html, />Ver o meu pedido</);
  assert.match(html, /Dados da tua conta partilhada/);
  assert.match(html, /Como adicionar a conta e descarregar/);
  assert.doesNotMatch(html, /Como resgatar na Xbox/);
  assert.doesNotMatch(html, /class=/);
  if (previousUrl === undefined) delete process.env.URL;
  else process.env.URL = previousUrl;
});

test("email de confirmacao informa que o pedido esta pendente e liga a Minha Conta", async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  const previousUrl = process.env.URL;
  const originalFetch = global.fetch;
  let request;
  process.env.RESEND_API_KEY = "re_test_only";
  process.env.RESEND_FROM_EMAIL = "GalaxyGame <pedidos@galaxygame.pt>";
  process.env.URL = "https://galaxygame.pt";
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: "email_test" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    await orders.sendOrderConfirmationEmail({
      id: "blob_cs_test_email",
      clienteEmail: "cliente@example.com",
      clienteNome: "Cliente",
      produto: "Jogo teste",
      plataforma: "PlayStation 5"
    });
    const payload = JSON.parse(request.options.body);
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.deepEqual(payload.to, ["cliente@example.com"]);
    assert.match(payload.subject, /Recebemos o teu pedido/);
    assert.match(payload.html, /Estado: A aguardar preparacao do codigo/);
    assert.match(payload.html, /https:\/\/galaxygame\.pt\/minha-conta\.html/);
    assert.match(payload.html, /Jogo teste/);
  } finally {
    global.fetch = originalFetch;
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = previousFrom;
    if (previousUrl === undefined) delete process.env.URL;
    else process.env.URL = previousUrl;
  }
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
  assert.match(html, /O teu c&oacute;digo Xbox/);
  assert.match(html, /Como resgatar na Xbox/);
});
