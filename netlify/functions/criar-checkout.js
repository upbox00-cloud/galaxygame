const fs = require("fs");
const path = require("path");
const { json, getUserEmail, getUserName } = require("./_orders");

const SPECIAL_PRODUCTS = [
  {
    id: "gta-vi-ps5",
    nome: "Grand Theft Auto VI - PlayStation 5",
    plataforma: "PlayStation 5",
    precoVendaEUR: 57.99
  },
  {
    id: "gta-vi-xbox-series",
    nome: "Grand Theft Auto VI - Xbox Series X|S",
    plataforma: "Xbox Series X|S",
    precoVendaEUR: 69.99
  }
];

let catalogById;

function loadCatalog() {
  if (catalogById) return catalogById;
  const file = path.resolve(__dirname, "..", "..", "data", "catalog-lite.json");
  const products = JSON.parse(fs.readFileSync(file, "utf8"));
  catalogById = new Map([...products, ...SPECIAL_PRODUCTS].map((product) => [product.id, product]));
  return catalogById;
}

function siteUrl() {
  return String(process.env.URL || process.env.DEPLOY_PRIME_URL || "https://galaxygame.pt").replace(/\/$/, "");
}

async function createStripeCheckout(products, customer) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY em falta");

  const params = new URLSearchParams({
    mode: "payment",
    locale: "pt",
    customer_email: customer.email,
    success_url: `${siteUrl()}/minha-conta.html?checkout=sucesso&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/carrinho.html?checkout=cancelado`,
    "metadata[ClienteNome]": customer.name || "",
    "metadata[customer_email]": customer.email
  });

  const productIds = products.map((product) => product.id).join(",");
  if (productIds.length <= 500) params.set("metadata[product_ids]", productIds);

  products.forEach((product, index) => {
    const prefix = `line_items[${index}]`;
    params.set(`${prefix}[quantity]`, "1");
    params.set(`${prefix}[price_data][currency]`, "eur");
    params.set(`${prefix}[price_data][unit_amount]`, String(Math.round(Number(product.precoVendaEUR) * 100)));
    params.set(`${prefix}[price_data][product_data][name]`, String(product.nome).slice(0, 250));
    params.set(`${prefix}[price_data][product_data][metadata][product_id]`, product.id);
    params.set(`${prefix}[price_data][product_data][metadata][platform]`, product.plataforma || "Consola");
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok || !data.url) {
    const error = new Error(data?.error?.message || `Stripe respondeu ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  const email = getUserEmail(context).trim().toLowerCase();
  if (!email) return json(401, { error: "login_required" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const ids = Array.from(new Set((Array.isArray(body.items) ? body.items : [])
    .map((item) => String(item?.id || item || "").trim())
    .filter(Boolean)));
  if (!ids.length || ids.length > 10) return json(400, { error: "invalid_cart" });

  try {
    const catalog = loadCatalog();
    const products = ids.map((id) => catalog.get(id));
    if (products.some((product) => !product || Number(product.precoVendaEUR) <= 0)) {
      return json(400, { error: "invalid_product" });
    }
    const session = await createStripeCheckout(products, { email, name: getUserName(context) });
    return json(200, { checkoutUrl: session.url });
  } catch (error) {
    console.error("[criar-checkout]", {
      message: error.message,
      status: error.status || null
    });
    return json(500, { error: "checkout_failed" });
  }
};

exports._test = { loadCatalog, createStripeCheckout };
