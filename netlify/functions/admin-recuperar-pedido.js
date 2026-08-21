const { connectLambda } = require("@netlify/blobs");
const {
  json,
  requireAdmin,
  findPersistedOrderByStripeSessionId,
  fetchStripeProducts,
  persistOrder,
  sendOrderConfirmationEmail
} = require("./_orders");

async function retrieveStripeSession(sessionId) {
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY || ""}` }
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Stripe respondeu ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

exports.handler = async (event, context) => {
  if (event?.blobs) connectLambda(event);
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  const adminError = requireAdmin(context);
  if (adminError) return adminError;
  if (!process.env.STRIPE_SECRET_KEY) return json(503, { error: "stripe_not_configured" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "invalid_json" }); }
  const sessionId = String(body.sessionId || "").trim();
  if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) return json(400, { error: "invalid_session_id" });

  try {
    const existing = await findPersistedOrderByStripeSessionId(sessionId);
    if (existing) return json(200, { recovered: false, existing: true, pedido: existing });

    const session = await retrieveStripeSession(sessionId);
    if (session.payment_status !== "paid") return json(409, { error: "payment_not_paid" });
    const parsed = await fetchStripeProducts(session);
    const email = String(session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
    if (!email || !parsed.produto) return json(409, { error: "missing_order_data" });
    const customerType = String(session.metadata?.customer_type || "guest").toLowerCase();
    const isGuest = customerType !== "registered";
    const fields = {
      ClienteEmail: email,
      ClienteNome: session.customer_details?.name || session.metadata?.ClienteNome || (isGuest ? "Convidado" : ""),
      TipoCliente: isGuest ? "Convidado" : "Cadastrado",
      UserId: isGuest ? "" : String(session.metadata?.identity_user_id || ""),
      Produto: parsed.produto,
      Plataforma: parsed.plataforma,
      ValorPagoEUR: Number((Number(session.amount_total || 0) / 100).toFixed(2)),
      Status: "Aguardando codigo",
      Codigo: "",
      DataCompra: new Date(Number(session.created || 0) * 1000 || Date.now()).toISOString(),
      StripeSessionId: sessionId,
      Fornecedor: parsed.fornecedor || "",
      CustoFornecedorBRL: Number(parsed.custoFornecedorBRL || 0),
      LinkFornecedor: parsed.linkFornecedor || ""
    };
    const pedido = await persistOrder(fields);
    let confirmationEmailSent = false;
    if (body.sendConfirmation === true) {
      await sendOrderConfirmationEmail({
        ...pedido,
        clienteEmail: fields.ClienteEmail,
        clienteNome: fields.ClienteNome,
        produto: fields.Produto,
        plataforma: fields.Plataforma,
        imagem: parsed.imagem || ""
      });
      confirmationEmailSent = true;
    }
    return json(200, { recovered: true, pedido, confirmationEmailSent });
  } catch (error) {
    console.error("[admin-recuperar-pedido]", { message: error.message, status: error.status || null, sessionId });
    return json(error.status === 404 ? 404 : 500, { error: "order_recovery_failed" });
  }
};

exports._test = { retrieveStripeSession };
