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
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Airtable respondeu ${response.status}`);
    error.status = response.status;
    throw error;
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

async function getOrderById(recordId) {
  if (!/^rec[a-zA-Z0-9]+$/.test(String(recordId || ""))) return null;
  const formula = `RECORD_ID()='${escapeFormulaValue(recordId)}'`;
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

async function upsertOrderByStripeSessionId(fields) {
  if (!fields?.StripeSessionId) throw new Error("StripeSessionId em falta no pedido");
  const data = await airtableRequest(AIRTABLE_TABLE, {
    method: "PATCH",
    body: {
      performUpsert: { fieldsToMergeOn: ["StripeSessionId"] },
      records: [{ fields }]
    }
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
    imagem: normalizeImageField(fields.ImagemURL || fields.Imagem || fields.Capa),
    dataCompra: fields.DataCompra || "",
    stripeSessionId: fields.StripeSessionId || ""
  };
}

function normalizeImageField(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0]?.url || "";
  return value?.url || "";
}

function getUser(context) {
  return context?.clientContext?.user || null;
}

function getUserEmail(context) {
  const user = getUser(context);
  return user?.email || user?.user_metadata?.email || "";
}

function getUserName(context) {
  const user = getUser(context);
  return user?.user_metadata?.full_name || user?.user_metadata?.name || "";
}

function getUserRoles(context) {
  const user = getUser(context);
  const directRoles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
  const authorizationRoles = Array.isArray(user?.app_metadata?.authorization?.roles)
    ? user.app_metadata.authorization.roles
    : [];
  return [...directRoles, ...authorizationRoles].map((role) => String(role).toLowerCase());
}

function requireAdmin(context) {
  if (!getUser(context)) return json(401, { error: "login_required" });
  if (!getUserRoles(context).includes("admin")) return json(403, { error: "admin_required" });
  return null;
}

function verifyStripeSignature(event) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  if (!signature) return false;

  const parts = signature.split(",").reduce((result, part) => {
    const separator = part.indexOf("=");
    if (separator === -1) return result;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!result[key]) result[key] = [];
    result[key].push(value);
    return result;
  }, {});
  const timestamp = Number(parts.t?.[0]);
  const signatures = parts.v1 || [];
  if (!Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return false;

  const payload = `${timestamp}.${event.body || ""}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return signatures.some((signatureValue) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signatureValue, "hex"));
    } catch {
      return false;
    }
  });
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

async function fetchStripeProducts(session) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !session?.id) return parseStripeProducts(session || {});

  const params = new URLSearchParams({ limit: "100" });
  params.append("expand[]", "data.price.product");
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session.id)}/line_items?${params}`, {
    headers: { authorization: `Bearer ${secret}` }
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Stripe respondeu ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const lines = Array.isArray(data.data) ? data.data : [];
  if (!lines.length) return parseStripeProducts(session);
  return {
    produto: lines.map((line) => line.description || line.price?.product?.name).filter(Boolean).join(", "),
    plataforma: Array.from(new Set(lines
      .map((line) => line.price?.product?.metadata?.platform)
      .filter(Boolean))).join(", ")
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
  const product = escapeHtml(order.produto || "Jogo digital GalaxyGame");
  const platform = escapeHtml(order.plataforma || "Consola");
  const code = escapeHtml(order.codigo);
  const siteUrl = publicSiteUrl();
  const accountUrl = escapeHtml(`${siteUrl}/minha-conta.html`);
  const logoUrl = escapeHtml(`${siteUrl}/assets/galaxygame-header-logo-cropped.webp`);
  const coverUrl = safeHttpUrl(order.imagem);
  const coverCell = coverUrl ? `
    <td width="122" valign="middle" style="width:122px;padding:16px 8px 16px 16px;">
      <img src="${escapeHtml(coverUrl)}" width="104" alt="Capa de ${product}" style="display:block;width:104px;max-width:104px;height:auto;border:0;border-radius:6px;outline:none;text-decoration:none;" />
    </td>` : "";

  return `
<!doctype html>
<html lang="pt-PT">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>O teu jogo est&aacute; pronto - GalaxyGame</title>
  </head>
  <body style="margin:0;padding:0;background-color:#111116;color:#f7f5fb;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#111116" style="width:100%;margin:0;background-color:#111116;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#1c1c22" style="width:100%;max-width:600px;background-color:#1c1c22;border:1px solid #35343d;border-radius:8px;overflow:hidden;">
            <tr>
              <td align="center" bgcolor="#241a32" style="padding:28px 24px 26px;background-color:#241a32;background-image:linear-gradient(135deg,#21182f 0%,#512b72 55%,#c64f16 100%);">
                <img src="${logoUrl}" width="260" alt="GalaxyGame - Jogos Digitais" style="display:block;width:260px;max-width:90%;height:auto;margin:0 auto 16px;border:0;outline:none;text-decoration:none;" />
                <h1 style="margin:0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:34px;font-weight:800;">O teu jogo est&aacute; pronto! &#127918;</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 8px;color:#f7f5fb;">
                <p style="margin:0 0 12px;color:#ffffff;font-size:20px;line-height:28px;font-weight:700;">Ol&aacute;, ${safeName}!</p>
                <p style="margin:0;color:#cbc8d2;font-size:15px;line-height:24px;">O teu pedido foi preparado. Guarda este email e consulta-o sempre que precisares dos dados de acesso.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#26252d" style="width:100%;background-color:#26252d;border:1px solid #3c3a45;border-radius:7px;">
                  <tr>
                    ${coverCell}
                    <td valign="middle" style="padding:18px 18px 18px ${coverUrl ? "10px" : "18px"};">
                      <p style="margin:0 0 7px;color:#a9a6b2;font-size:12px;line-height:16px;text-transform:uppercase;">O teu jogo</p>
                      <p style="margin:0 0 9px;color:#ffffff;font-size:18px;line-height:24px;font-weight:800;">${product}</p>
                      <p style="margin:0;color:#ff8a3d;font-size:14px;line-height:20px;font-weight:700;">${platform}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#2b1735" style="width:100%;background-color:#2b1735;border:2px solid #ff6a00;border-radius:7px;">
                  <tr>
                    <td align="center" style="padding:21px 14px 23px;">
                      <p style="margin:0 0 10px;color:#d7cde0;font-size:13px;line-height:18px;font-weight:700;text-transform:uppercase;">O teu c&oacute;digo:</p>
                      <p style="margin:0;color:#ffffff;font-family:'Courier New',Courier,monospace;font-size:27px;line-height:35px;font-weight:800;letter-spacing:2px;word-break:break-all;">${code}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 28px 4px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#ff6a00" style="border-radius:6px;background-color:#ff6a00;">
                      <a href="${accountUrl}" style="display:inline-block;padding:14px 24px;color:#171117;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:18px;font-weight:800;text-decoration:none;">Ver o meu pedido</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px 12px;">
                <h2 style="margin:0 0 15px;color:#ffffff;font-size:19px;line-height:25px;">Como resgatar</h2>
                ${renderEmailStep(1, "Abre a tua consola e confirma que estás na plataforma indicada no pedido.")}
                ${renderEmailStep(2, "Acede à loja da consola e escolhe a opção para resgatar um código.")}
                ${renderEmailStep(3, "Insere o código acima exatamente como aparece neste email.")}
                ${renderEmailStep(4, "Confirma, abre a biblioteca e descarrega o jogo. Boa diversão!")}
                <p style="margin:12px 0 0;color:#aaa7b1;font-size:12px;line-height:19px;">Se recebeste dados de acesso ou instru&ccedil;&otilde;es adicionais, segue primeiro o procedimento apresentado em Minha Conta &gt; Meus Pedidos.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid #3a3941;">
                  <tr>
                    <td align="center" style="padding-top:21px;color:#aaa7b1;">
                      <p style="margin:0 0 8px;font-size:13px;line-height:20px;">Precisas de ajuda? Escreve para <a href="mailto:gamegalaxy26@gmail.com" style="color:#ff8a3d;text-decoration:none;">gamegalaxy26@gmail.com</a></p>
                      <p style="margin:0 0 8px;font-size:12px;line-height:18px;">Este &eacute; um email autom&aacute;tico, mas respondemos sempre que precisares de ajuda.</p>
                      <p style="margin:0;font-size:12px;line-height:18px;">&copy; 2026 GalaxyGame. Todos os direitos reservados.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}

function renderEmailStep(number, text) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 10px;">
      <tr>
        <td width="34" valign="top" style="width:34px;padding:0 10px 0 0;">
          <div style="width:26px;height:26px;border-radius:13px;background-color:#5a3474;color:#ffffff;font-size:13px;line-height:26px;font-weight:800;text-align:center;">${number}</div>
        </td>
        <td valign="middle" style="color:#d4d1da;font-size:14px;line-height:21px;">${escapeHtml(text)}</td>
      </tr>
    </table>`;
}

function publicSiteUrl() {
  const configured = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://galaxygame.pt";
  try {
    const url = new URL(configured);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "https://galaxygame.pt";
  }
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
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
  getOrderById,
  createOrder,
  upsertOrderByStripeSessionId,
  updateOrder,
  normalizeOrder,
  getUserEmail,
  getUserName,
  getUserRoles,
  requireAdmin,
  verifyStripeSignature,
  parseStripeProducts,
  fetchStripeProducts,
  sendCodeEmail,
  renderCodeEmail
};
