const { json, requireAdmin, getOrderById, updateOrder, sendCodeEmail } = require("./_orders");

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
  if (!/^rec[a-zA-Z0-9]+$/.test(recordId) || !codigo || codigo.length > 4000) {
    return json(400, { error: "invalid_record_or_code" });
  }

  let updatedOrder;
  try {
    const currentOrder = await getOrderById(recordId);
    if (!currentOrder) return json(404, { error: "order_not_found" });
    if (currentOrder.status === "Enviado") return json(200, { ok: true, duplicate: true, pedido: currentOrder });
    if (!currentOrder.clienteEmail) return json(400, { error: "order_email_missing" });

    updatedOrder = await updateOrder(recordId, {
      Codigo: codigo,
      Status: "Enviado"
    });
    await sendCodeEmail(updatedOrder);
    return json(200, { ok: true, pedido: updatedOrder });
  } catch (error) {
    console.error("[marcar-pedido-enviado]", {
      message: error.message,
      orderId: recordId,
      emailDeliveryFailed: Boolean(updatedOrder)
    });
    if (updatedOrder) {
      try {
        await updateOrder(recordId, { Status: "Aguardando codigo" });
      } catch (rollbackError) {
        console.error("[marcar-pedido-enviado:rollback]", {
          message: rollbackError.message,
          orderId: recordId
        });
      }
    }
    return json(500, { error: "send_failed" });
  }
};
