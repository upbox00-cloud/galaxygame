const crypto = require("crypto");

const AIRTABLE_TABLE = "Pedidos";
const AIRTABLE_API = "https://api.airtable.com/v0";

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variavel de ambiente em falta: ${name}`);
  return value;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function escapeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function airtableUrl(path, params = {}) {
  const url = new URL(`${AIRTABLE_API}/${env("AIRTABLE_BASE_ID")}/${encodeURIComponent(path)}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  return url;
}

async function airtableRequest(path, options = {}) {
  const response = await fetch(airtableUrl(path, options.params), {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${env("AIRTABLE_TOKEN")}`,
      "content-type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.error?.message || `Airtable respondeu ${response.status}`);
  }
  return data;
}

async function listOrdersByFormula(filterByFormula, { maxRecords = 100, sortNewest = true } = {}) {
  const records = [];
  let offset = null;
  do {
    const data = await airtableRequest(AIRTABLE_TABLE, {
      params: {
        pageSize: Math.min(maxRecords, 100),
        offset,
        filterByFormula,
        ...(sortNewest ? { "sort[0][field]": "DataCompra", "sort[0][direction]": "desc" } : {})
      }
    });
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset && records.length < maxRecords);
  return records.slice(0, maxRecords).map(normalizeOrder);
}

async function findOrderByStripeSessionId(sessionId) {
  if (!sessionId) return null;
  const formula = `{StripeSessionId}='${escapeFormulaValue(sessionId)}'`;
  const records = await listOrdersByFormula(formula, { maxRecords: 1, sortNewest: false });
  return records[0] || null;
}

async function createOrder(fields) {
  const data = await airtableRequest(AIRTABLE_TABLE, {
    method: "POST",
    body: { records: [{ fields }] }
  });
  return normalizeOrder(data.records?.[0]);
}

async function updateOrder(recordId, fields) {
  const data = await airtableRequest(AIRTABLE_TABLE, {
    method: "PATCH",
    body: { records: [{ id: recordId, fields }] }
  });
  return normalizeOrder(data.records?.[0]);
}

function normalizeOrder(record) {
  if (!record) return null;
  const fields = record.fields || {};
  return {
    id: record.id,
    clienteEmail: fields.ClienteEmail || "",
    clienteNome: fields.ClienteNome || "",
    produto: fields.Produto || "",
    plataforma: fields.Plataforma || "",
    valorPagoEUR: Number(fields.ValorPagoEUR || 0),
    status: fields.Status || "",
    codigo: fields.Codigo || "",
    dataCompra: fields.DataCompra || "",
    stripeSessionId: fields.StripeSessionId || ""
  };
}

function getUser(context) {
  return context?.clientContext?.user || null;
}

function getUserEmail(context) {
  const user = getUser(context);
  return user?.email || user?.user_metadata?.email || "";
}

function getUserRoles(context) {
  const user = getUser(context);
  const appRoles = user?.app_metadata?.roles || user?.app_metadata?.authorization?.roles || [];
  const userRoles = user?.user_metadata?.roles || [];
  return [...appRoles, ...userRoles].map((role) => String(role).toLowerCase());
}

function requireAdmin(context) {
  if (!getUser(context)) return json(401, { error: "login_required" });
  if (!getUserRoles(context).includes("admin")) return json(403, { error: "admin_required" });
  return null;
}

function verifyStripeSignature(event) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return true;
  const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  if (!signature) return false;

  const parts = Object.fromEntries(signature.split(",").map((part) => {
    const [key, value] = part.split("=");
    return [key, value];
  }));
  if (!parts.t || !parts.v1) return false;

  const payload = `${parts.t}.${event.body || ""}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}

function parseStripeProducts(session) {
  const metadata = session.metadata || {};
  const productFields = [
    metadata.cart,
    metadata.products,
    metadata.items,
    metadata.produtos
  ].filter(Boolean);

  for (const value of productFields) {
    try {
      const parsed = JSON.parse(value);
      const list = Array.isArray(parsed) ? parsed : parsed?.items || [];
      if (Array.isArray(list) && list.length) {
        return {
          produto: list.map((item) => item.nome || item.name || item.produto || item.title).filter(Boolean).join(", "),
          plataforma: Array.from(new Set(list.map((item) => item.plataforma || item.platform).filter(Boolean))).join(", ")
        };
      }
    } catch {
      // Metadata can be plain text; keep trying the next shape.
    }
  }

  return {
    produto: metadata.Produto || metadata.produto || metadata.product || metadata.productName || "Produto GalaxyGame",
    plataforma: metadata.Plataforma || metadata.plataforma || metadata.platform || ""
  };
}

async function sendCodeEmail(order) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "GalaxyGame <pedidos@galaxygame.pt>",
      to: [order.clienteEmail],
      reply_to: "gamegalaxy26@gmail.com",
      subject: "O teu c\u00f3digo est\u00e1 pronto! \ud83c\udfae GalaxyGame",
      html: renderCodeEmail(order)
    })
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.message || `Resend respondeu ${response.status}`);
  }
  return data;
}

function renderCodeEmail(order) {
  const safeName = escapeHtml(order.clienteNome || "cliente");
  const product = escapeHtml(order.produto);
  const platform = escapeHtml(order.plataforma);
  const code = escapeHtml(order.codigo);
  const accountUrl = `${process.env.URL || "https://galaxygame.pt"}/minha-conta.html`;

  return `
    <div style="margin:0;background:#171717;color:#f5f5f5;font-family:Arial,sans-serif;padding:28px">
      <div style="max-width:620px;margin:auto;background:#242424;border:1px solid #383838;border-radius:10px;overflow:hidden">
        <div style="padding:24px;background:linear-gradient(135deg,#ff6a00,#6b38d8)">
          <h1 style="margin:0;font-size:28px">GalaxyGame</h1>
          <p style="margin:8px 0 0">O teu c&oacute;digo j&aacute; est&aacute; pronto.</p>
        </div>
        <div style="padding:24px">
          <p>Ol&aacute; ${safeName},</p>
          <p>O teu pedido foi marcado como enviado. Guarda este email e consulta tamb&eacute;m a tua &aacute;rea <strong>Minha Conta &gt; Meus Pedidos</strong>.</p>
          <div style="background:#111;border:1px solid #ff6a00;border-radius:8px;padding:18px;margin:20px 0">
            <p style="margin:0 0 8px;color:#bdbdbd">Produto</p>
            <strong style="font-size:18px">${product}</strong>
            <p style="margin:10px 0 0;color:#bdbdbd">Plataforma: ${platform}</p>
          </div>
          <div style="background:#fff;color:#111;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
            <p style="margin:0 0 8px;font-weight:700">C&oacute;digo / dados de acesso</p>
            <div style="font-size:24px;font-weight:900;letter-spacing:1px;word-break:break-all">${code}</div>
          </div>
          <h2 style="font-size:18px">Como ativar</h2>
          <ol>
            <li>Confirma que est&aacute;s na consola correta.</li>
            <li>Segue exatamente as instru&ccedil;&otilde;es recebidas no pedido.</li>
            <li>Adiciona a conta/c&oacute;digo conforme indicado e descarrega o jogo pela biblioteca.</li>
          </ol>
          <p><a href="${accountUrl}" style="display:inline-block;background:#ff6a00;color:#111;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:7px">Ver na Minha Conta</a></p>
          <p style="color:#bdbdbd;font-size:13px">Precisas de ajuda? Escreve para gamegalaxy26@gmail.com.</p>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = {
  json,
  escapeFormulaValue,
  listOrdersByFormula,
  findOrderByStripeSessionId,
  createOrder,
  updateOrder,
  normalizeOrder,
  getUserEmail,
  requireAdmin,
  verifyStripeSignature,
  parseStripeProducts,
  sendCodeEmail
};
