const { json, getUserEmail } = require("./_orders");

function validSessionId(value) {
  const sessionId = String(value || "").trim();
  return /^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId) && sessionId.length <= 255
    ? sessionId
    : "";
}

async function fetchCheckoutSession(sessionId, secret) {
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      authorization: `Bearer ${secret}`,
      "stripe-version": "2025-10-29.clover"
    }
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
  return data;
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });

  const authenticatedEmail = getUserEmail(context).trim().toLowerCase();
  if (!authenticatedEmail) return json(401, { error: "login_required" });

  const sessionId = validSessionId(event.queryStringParameters?.session_id);
  if (!sessionId) return json(400, { error: "invalid_session_id" });

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.error("[confirmar-compra] STRIPE_SECRET_KEY em falta");
    return json(503, { error: "service_unavailable" });
  }

  try {
    const session = await fetchCheckoutSession(sessionId, secret);
    const stripeEmail = String(session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
    if (!stripeEmail || stripeEmail !== authenticatedEmail) {
      console.warn("[confirmar-compra] sessao nao pertence ao cliente autenticado", {
        sessionSuffix: sessionId.slice(-8)
      });
      return json(403, { error: "forbidden" });
    }
    if (session.payment_status !== "paid") return json(409, { error: "payment_not_confirmed" });
    if (String(session.currency || "").toLowerCase() !== "eur") return json(409, { error: "unexpected_currency" });

    const amountTotal = Number(session.amount_total);
    if (!Number.isInteger(amountTotal) || amountTotal < 0) return json(409, { error: "invalid_amount" });

    return json(200, {
      value: Number((amountTotal / 100).toFixed(2)),
      currency: "EUR",
      transactionId: session.id
    });
  } catch (error) {
    console.error("[confirmar-compra] falha ao validar sessao Stripe", {
      status: error.status || null,
      message: error.message,
      sessionSuffix: sessionId.slice(-8)
    });
    return json(502, { error: "stripe_validation_failed" });
  }
};

exports._test = { validSessionId, fetchCheckoutSession };
