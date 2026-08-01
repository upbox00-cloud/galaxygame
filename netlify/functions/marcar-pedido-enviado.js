const { json, requireAdmin, updateOrder, sendCodeEmail } = require("./_orders");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  const adminError = requireAdmin(context);
  if (adminError) return adminError;

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const recordId = String(body.recordId || "").trim();
  const codigo = String(body.codigo || "").trim();
  if (!recordId || !codigo) return json(400, { error: "missing_record_or_code" });

  try {
    const order = await updateOrder(recordId, {
      Codigo: codigo,
      Status: "Enviado"
    });
    await sendCodeEmail(order);
    return json(200, { ok: true, pedido: order });
  } catch (error) {
    console.error("[marcar-pedido-enviado]", error);
    return json(500, { error: "send_failed" });
  }
};
