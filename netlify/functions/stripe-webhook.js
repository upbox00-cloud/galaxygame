const {
  json,
  findOrderByStripeSessionId,
  createOrder,
  verifyStripeSignature,
  parseStripeProducts
} = require("./_orders");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  if (!verifyStripeSignature(event)) return json(400, { error: "invalid_signature" });

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return json(200, { received: true, ignored: stripeEvent.type || "unknown" });
  }

  try {
    const session = stripeEvent.data?.object || {};
    const sessionId = session.id;
    if (!sessionId) return json(400, { error: "missing_session_id" });

    const existing = await findOrderByStripeSessionId(sessionId);
    if (existing) return json(200, { received: true, duplicate: true, orderId: existing.id });

    const customer = session.customer_details || {};
    const parsed = parseStripeProducts(session);
    const amount = Number(session.amount_total || 0) / 100;

    const order = await createOrder({
      ClienteEmail: customer.email || session.customer_email || "",
      ClienteNome: customer.name || session.metadata?.ClienteNome || "",
      Produto: parsed.produto,
      Plataforma: parsed.plataforma,
      ValorPagoEUR: Number(amount.toFixed(2)),
      Status: "Aguardando codigo",
      Codigo: "",
      DataCompra: new Date().toISOString(),
      StripeSessionId: sessionId
    });

    return json(200, { received: true, orderId: order.id });
  } catch (error) {
    console.error("[stripe-webhook]", error);
    return json(500, { error: "webhook_failed" });
  }
};
