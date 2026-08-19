const {
  json,
  findPersistedOrderByStripeSessionId,
  persistOrder,
  verifyStripeSignature,
  fetchStripeProducts,
  sendOrderConfirmationEmail
} = require("./_orders");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET nao configurado");
    return json(503, { error: "webhook_not_configured" });
  }
  if (!verifyStripeSignature(event)) return json(400, { error: "invalid_signature" });

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const acceptedTypes = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];
  if (!acceptedTypes.includes(stripeEvent.type)) {
    return json(200, { received: true, ignored: stripeEvent.type || "unknown" });
  }

  try {
    const session = stripeEvent.data?.object || {};
    const sessionId = session.id;
    if (!sessionId) return json(400, { error: "missing_session_id" });
    if (stripeEvent.type === "checkout.session.completed" && session.payment_status !== "paid") {
      return json(200, { received: true, pendingPayment: true, sessionId });
    }

    const existing = await findPersistedOrderByStripeSessionId(sessionId);
    if (existing) {
      let confirmationEmailSent = false;
      try {
        await sendOrderConfirmationEmail(existing);
        confirmationEmailSent = true;
      } catch (emailError) {
        console.error("[stripe-webhook:duplicate-confirmation-email]", {
          message: emailError.message,
          orderId: existing.id
        });
      }
      return json(200, {
        received: true,
        duplicate: true,
        orderId: existing.id,
        confirmationEmailSent
      });
    }

    const customer = session.customer_details || {};
    const parsed = await fetchStripeProducts(session);
    const amount = Number(session.amount_total || 0) / 100;
    const email = String(customer.email || session.customer_email || "").trim().toLowerCase();
    if (!email || !parsed.produto) return json(400, { error: "missing_order_data" });
    const customerType = String(session.metadata?.customer_type || "registered").toLowerCase();
    const isEmailOnly = customerType === "email_only";
    const isGuest = customerType === "guest" || isEmailOnly;

    const order = await persistOrder({
      ClienteEmail: email,
      ClienteNome: customer.name || session.metadata?.ClienteNome || (isEmailOnly ? "Compra por email" : (isGuest ? "Convidado" : "")),
      TipoCliente: isEmailOnly ? "Apenas email" : (isGuest ? "Convidado" : "Cadastrado"),
      UserId: isGuest ? "" : String(session.metadata?.identity_user_id || ""),
      Produto: parsed.produto,
      Plataforma: parsed.plataforma,
      ValorPagoEUR: Number(amount.toFixed(2)),
      Status: "Aguardando codigo",
      Codigo: "",
      DataCompra: new Date().toISOString(),
      StripeSessionId: sessionId,
      Fornecedor: parsed.fornecedor || "",
      CustoFornecedorBRL: Number(parsed.custoFornecedorBRL || 0),
      LinkFornecedor: parsed.linkFornecedor || ""
    });

    let confirmationEmailSent = false;
    try {
      await sendOrderConfirmationEmail(order);
      confirmationEmailSent = true;
    } catch (emailError) {
      console.error("[stripe-webhook:confirmation-email]", {
        message: emailError.message,
        orderId: order.id
      });
    }

    return json(200, { received: true, orderId: order.id, confirmationEmailSent });
  } catch (error) {
    console.error("[stripe-webhook]", {
      message: error.message,
      status: error.status || null,
      eventType: stripeEvent.type,
      eventId: stripeEvent.id || null,
      sessionId: stripeEvent.data?.object?.id || null
    });
    return json(500, { error: "webhook_failed" });
  }
};
