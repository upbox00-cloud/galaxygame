const fs = require("fs");
const path = require("path");
const { json, getUserEmail, getUserName } = require("./_orders");
const commercialCatalog = require("./_data/catalogo-comercial.json");

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
  const commercialById = new Map(commercialCatalog.map((product) => [product.id, product]));
  catalogById = new Map([...products, ...SPECIAL_PRODUCTS].map((product) => [
    product.id,
    { ...product, ...(commercialById.get(product.id) || {}) }
  ]));
  return catalogById;
}

function siteUrl() {
  return String(process.env.URL || "https://galaxygame.pt").replace(/\/$/, "");
}

function productImageUrl(product) {
  const screenshot = Array.isArray(product.screenshots) ? product.screenshots[0] : "";
  const candidate = product.capaSteamGridDB || product.imagemFallback || product.imagemPrincipal || screenshot || "assets/gta-vi-landscape-hq.webp";
  if (/^https?:\/\//i.test(candidate)) return candidate;
  return `${siteUrl()}/${String(candidate).replace(/^\/+/, "")}`;
}

function safeCancelPath(value) {
  const path = String(value || "").trim();
  if (/^[a-zA-Z0-9_-]+\.html(\?[a-zA-Z0-9=&%._~-]*)?$/.test(path)) return path;
  return "carrinho.html?checkout=cancelado";
}

const PORTUGAL_PAYMENT_METHODS = ["card", "link", "mb_way", "multibanco", "klarna", "paypal"];

function checkoutPaymentMethods() {
  const configured = String(process.env.STRIPE_PAYMENT_METHOD_TYPES || "")
    .split(",")
    .map((method) => method.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? Array.from(new Set(configured)) : PORTUGAL_PAYMENT_METHODS;
}

async function requestStripeCheckout(params, secret) {
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": "2025-10-29.clover"
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
  return { response, data };
}

async function createStripeCheckout(products, customer, cancelPath) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY em falta");

  const params = new URLSearchParams({
    mode: "payment",
    locale: "pt",
    "adaptive_pricing[enabled]": "false",
    customer_email: customer.email,
    success_url: `${siteUrl()}/pedido-confirmado.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/${safeCancelPath(cancelPath)}`,
    "metadata[ClienteNome]": customer.name || "",
    "metadata[customer_email]": customer.email
  });

  checkoutPaymentMethods().forEach((method, index) => {
    params.set(`payment_method_types[${index}]`, method);
  });

  const productIds = products.map((product) => product.id).join(",");
  if (productIds.length <= 500) params.set("metadata[product_ids]", productIds);

  products.forEach((product, index) => {
    const prefix = `line_items[${index}]`;
    params.set(`${prefix}[quantity]`, "1");
    params.set(`${prefix}[price_data][currency]`, "eur");
    params.set(`${prefix}[price_data][unit_amount]`, String(Math.round(Number(product.precoVendaEUR) * 100)));
    params.set(`${prefix}[price_data][product_data][name]`, String(product.nome).slice(0, 250));
    params.set(`${prefix}[price_data][product_data][images][0]`, productImageUrl(product));
    params.set(`${prefix}[price_data][product_data][metadata][product_id]`, product.id);
    params.set(`${prefix}[price_data][product_data][metadata][platform]`, product.plataforma || "Consola");
    if (product.fornecedorSelecionado) {
      params.set(`${prefix}[price_data][product_data][metadata][supplier]`, product.fornecedorSelecionado);
      params.set(`${prefix}[price_data][product_data][metadata][supplier_cost_brl]`, String(product.custoFornecedorBRL || ""));
      params.set(`${prefix}[price_data][product_data][metadata][supplier_url]`, product.linkFornecedorSelecionado || "");
    }
  });

  let { response, data } = await requestStripeCheckout(params, secret);

  // Keep checkout available while a newly requested method is still being
  // activated in the Stripe Dashboard. Dynamic methods remain the fallback.
  if (!response.ok && response.status === 400 && data?.error?.param?.startsWith("payment_method_types")) {
    console.warn("[criar-checkout] metodo de pagamento ainda indisponivel; a usar configuracao dinamica", {
      param: data.error.param,
      code: data.error.code || null
    });
    [...params.keys()]
      .filter((key) => key.startsWith("payment_method_types["))
      .forEach((key) => params.delete(key));
    ({ response, data } = await requestStripeCheckout(params, secret));
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
    const session = await createStripeCheckout(products, { email, name: getUserName(context) }, body.cancelUrl);
    return json(200, { checkoutUrl: session.url });
  } catch (error) {
    console.error("[criar-checkout]", {
      message: error.message,
      status: error.status || null
    });
    return json(500, { error: "checkout_failed" });
  }
};

exports._test = { loadCatalog, createStripeCheckout, checkoutPaymentMethods, PORTUGAL_PAYMENT_METHODS };
