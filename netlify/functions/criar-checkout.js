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

function normalizeCheckoutEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 254) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
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
    success_url: `${siteUrl()}/pedido-confirmado.html?session_id={CHECKOUT_SESSION_ID}${customer.isGuest ? "&guest=1" : ""}`,
    cancel_url: `${siteUrl()}/${safeCancelPath(cancelPath)}`,
    "metadata[ClienteNome]": customer.name || "",
    "metadata[customer_type]": customer.customerType || (customer.isGuest ? "guest" : "registered")
  });

  // For guests Stripe Checkout is the single source of truth for the email.
  // Logged-in customers keep the convenience of a pre-filled account email.
  if (customer.email) {
    params.set("customer_email", customer.email);
    params.set("metadata[customer_email]", customer.email);
  }

  if (customer.userId) params.set("metadata[identity_user_id]", customer.userId);

  checkoutPaymentMethods().forEach((method, index) => {
    params.set(`payment_method_types[${index}]`, method);
  });

  const productIds = products.map((product) => product.id).join(",");
  if (productIds.length <= 500) params.set("metadata[product_ids]", productIds);

  const suppliers = Array.from(new Set(products
    .map((product) => String(product.fornecedorSelecionado || "").trim())
    .filter((supplier) => supplier === "Alpha Games" || supplier === "TCA Games")));
  const supplierCostBRL = products.reduce((total, product) => total + Number(product.custoFornecedorBRL || 0), 0);
  const supplierUrls = products
    .map((product) => String(product.linkFornecedorSelecionado || "").trim())
    .filter(Boolean)
    .join("\n");
  if (suppliers.length === 1) params.set("metadata[Fornecedor]", suppliers[0]);
  if (supplierCostBRL > 0) params.set("metadata[CustoFornecedorBRL]", String(Number(supplierCostBRL.toFixed(2))));
  if (supplierUrls && supplierUrls.length <= 500) params.set("metadata[LinkFornecedor]", supplierUrls);

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

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const authenticatedEmail = normalizeCheckoutEmail(getUserEmail(context));
  const isGuest = !authenticatedEmail;
  const customerType = isGuest ? "guest" : "registered";
  const email = authenticatedEmail;
  const user = context?.clientContext?.user || null;
  const userId = isGuest ? "" : String(user?.sub || user?.id || "").trim();

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
    const session = await createStripeCheckout(products, {
      email,
      name: isGuest ? "" : getUserName(context),
      isGuest,
      customerType,
      userId
    }, body.cancelUrl);
    return json(200, { checkoutUrl: session.url, checkoutMode: customerType });
  } catch (error) {
    console.error("[criar-checkout]", {
      message: error.message,
      status: error.status || null
    });
    return json(500, { error: "checkout_failed" });
  }
};

exports._test = { loadCatalog, createStripeCheckout, checkoutPaymentMethods, normalizeCheckoutEmail, PORTUGAL_PAYMENT_METHODS };
