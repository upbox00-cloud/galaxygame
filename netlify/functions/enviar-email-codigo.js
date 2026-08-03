const { json, requireAdmin, getOrderById, sendCodeEmail } = require("./_orders");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  const adminError = requireAdmin(context);
  if (adminError) return adminError;

  try {
    const body = JSON.parse(event.body || "{}");
    const order = await getOrderById(String(body.recordId || ""));
    if (!order) return json(404, { error: "order_not_found" });
    if (!order.clienteEmail || !order.codigo) return json(400, { error: "missing_email_or_code" });
    const result = await sendCodeEmail(order);
    return json(200, { ok: true, result });
  } catch (error) {
    console.error("[enviar-email-codigo]", error);
    return json(500, { error: "email_failed" });
  }
};
