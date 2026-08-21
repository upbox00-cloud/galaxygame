const { connectLambda } = require("@netlify/blobs");
const {
  json,
  findPersistedOrderByStripeSessionId,
  persistOrder,
  verifyStripeSignature,
  fetchStripeProducts,
  sendOrderConfirmationEmail,
  sendOperationalAlert,
  claimWebhookEvent,
  finishWebhookEvent
} = require("./_orders");

async function alertSafely(details) {
  try {
    await sendOperationalAlert(details);
    return true;
  } catch (error) {
    console.error("[stripe-webhook:admin-alert]", {
      message: error.message,
      sessionId: details.sessionId || null
    });
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  if (event?.blobs) connectLambda(event);
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

  const session = stripeEvent.data?.object || {};
  const sessionId = session.id;
  const eventId = stripeEvent.id;
  if (!sessionId || !eventId) return json(400, { error: "missing_event_data" });
  if (stripeEvent.type === "checkout.session.completed" && session.payment_status !== "paid") {
    return json(200, { received: true, pendingPayment: true, sessionId });
  }

  let claim;
  try {
    claim = await claimWebhookEvent(eventId, sessionId);
  } catch (error) {
    console.error("[stripe-webhook:idempotency] não foi possível reservar o evento", {
      message: error.message,
      eventId,
      sessionId
    });
    return json(500, { error: "idempotency_unavailable" });
  }
  if (!claim.claimed) {
    return json(200, {
      received: true,
      duplicate: Boolean(claim.duplicate),
      inProgress: Boolean(claim.inProgress),
      sessionId
    });
  }

  try {
    let existing = null;
    try {
      existing = await findPersistedOrderByStripeSessionId(sessionId);
    } catch (lookupError) {
      console.error("[stripe-webhook:order-lookup] consulta de duplicado falhou; o processamento vai continuar", {
        message: lookupError.message,
        sessionId
      });
    }

    if (existing) {
      let emailSent = claim.state?.emailSent === true;
      // Only retry email for a previously failed attempt of this exact event.
      // A different Stripe event can reference the same Checkout Session.
      if (!emailSent && claim.retried) {
        try {
          await sendOrderConfirmationEmail(existing);
          emailSent = true;
        } catch (error) {
          console.error("[stripe-webhook:confirmation-email-retry]", { message: error.message, sessionId });
          await finishWebhookEvent(eventId, { status: "failed", emailSent: false, reason: "confirmation_email_failed" });
          await alertSafely({
            subject: "Falha no email de confirmação",
            message: `O pedido já está guardado, mas o email de confirmação falhou: ${error.message}`,
            sessionId,
            customerEmail: existing.clienteEmail
          });
          return json(500, { error: "confirmation_email_failed", orderId: existing.id });
        }
      }
      if (!claim.retried) emailSent = true;
      await finishWebhookEvent(eventId, { status: "complete", emailSent, orderId: existing.id, duplicateSession: true });
      return json(200, { received: true, duplicate: true, orderId: existing.id, confirmationEmailSent: emailSent });
    }

    const customer = session.customer_details || {};
    const parsed = await fetchStripeProducts(session);
    const amount = Number(session.amount_total || 0) / 100;
    const email = String(customer.email || session.customer_email || "").trim().toLowerCase();
    if (!email || !parsed.produto) {
      await finishWebhookEvent(eventId, { status: "failed", emailSent: false, reason: "missing_order_data" });
      await alertSafely({
        subject: "Pagamento sem dados suficientes",
        message: "O Stripe confirmou o pagamento, mas o webhook não encontrou email ou produto para criar o pedido.",
        sessionId,
        customerEmail: email
      });
      return json(500, { error: "missing_order_data" });
    }

    const customerType = String(session.metadata?.customer_type || "guest").toLowerCase();
    const isEmailOnly = customerType === "email_only";
    const isGuest = customerType === "guest" || isEmailOnly;
    const orderFields = {
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
    };
    const emailOrder = {
      id: `stripe_${sessionId}`,
      clienteEmail: orderFields.ClienteEmail,
      clienteNome: orderFields.ClienteNome,
      produto: orderFields.Produto,
      plataforma: orderFields.Plataforma,
      valorPagoEUR: orderFields.ValorPagoEUR,
      status: orderFields.Status,
      imagem: parsed.imagem || "",
      stripeSessionId: sessionId
    };

    const shouldSendEmail = claim.state?.emailSent !== true;
    const [saveResult, emailResult] = await Promise.allSettled([
      persistOrder(orderFields),
      shouldSendEmail ? sendOrderConfirmationEmail(emailOrder) : Promise.resolve({ skipped: true })
    ]);
    const emailSent = !shouldSendEmail || emailResult.status === "fulfilled";

    if (saveResult.status === "fulfilled" && saveResult.value.storageState?.fallbackUsed) {
      await alertSafely({
        subject: "Pedido guardado na rede de segurança",
        message: `O Airtable falhou após 3 tentativas. O pedido foi preservado no Netlify Blobs. Motivo: ${saveResult.value.storageState.airtableError?.message || "erro desconhecido"}`,
        sessionId,
        customerEmail: email
      });
    }
    if (!emailSent) {
      console.error("[stripe-webhook:confirmation-email]", { message: emailResult.reason?.message || "erro desconhecido", sessionId });
      await alertSafely({
        subject: "Falha no email de confirmação",
        message: `O envio ao cliente falhou: ${emailResult.reason?.message || "erro desconhecido"}`,
        sessionId,
        customerEmail: email
      });
    }
    if (saveResult.status === "rejected") {
      console.error("[stripe-webhook:order-save] Airtable e Netlify Blobs falharam; o Stripe vai repetir o evento", {
        message: saveResult.reason?.message || "erro desconhecido",
        sessionId,
        emailSent
      });
      await finishWebhookEvent(eventId, { status: "failed", emailSent, reason: "order_storage_failed" });
      await alertSafely({
        subject: "URGENTE: pedido pago não foi guardado",
        message: `Airtable e Netlify Blobs falharam: ${saveResult.reason?.message || "erro desconhecido"}. O Stripe voltará a tentar o webhook.`,
        sessionId,
        customerEmail: email
      });
      return json(500, { error: "order_storage_failed", confirmationEmailSent: emailSent });
    }
    if (!emailSent) {
      await finishWebhookEvent(eventId, { status: "failed", emailSent: false, orderId: saveResult.value.id, reason: "confirmation_email_failed" });
      return json(500, { error: "confirmation_email_failed", orderId: saveResult.value.id });
    }

    await finishWebhookEvent(eventId, { status: "complete", emailSent: true, orderId: saveResult.value.id });
    return json(200, {
      received: true,
      orderId: saveResult.value.id,
      confirmationEmailSent: true,
      fallbackUsed: Boolean(saveResult.value.storageState?.fallbackUsed)
    });
  } catch (error) {
    console.error("[stripe-webhook]", {
      message: error.message,
      status: error.status || null,
      eventType: stripeEvent.type,
      eventId,
      sessionId
    });
    try {
      await finishWebhookEvent(eventId, {
        status: "failed",
        emailSent: claim.state?.emailSent === true,
        reason: String(error.message || "webhook_failed").slice(0, 300)
      });
    } catch (stateError) {
      console.error("[stripe-webhook:idempotency-failure]", { message: stateError.message, eventId, sessionId });
    }
    await alertSafely({
      subject: "Erro inesperado no webhook",
      message: String(error.message || "Erro desconhecido"),
      sessionId,
      customerEmail: session.customer_details?.email || session.customer_email || ""
    });
    return json(500, { error: "webhook_failed" });
  }
};
