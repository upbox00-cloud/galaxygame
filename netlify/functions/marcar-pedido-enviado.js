const { json, requireAdmin, getPersistedOrderById, updatePersistedOrder, sendCodeEmail } = require("./_orders");

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
  if (!/^(rec[a-zA-Z0-9]+|blob_[a-zA-Z0-9_-]+)$/.test(recordId) || !codigo || codigo.length > 4000) {
    return json(400, { error: "invalid_record_or_code" });
  }

  let updatedOrder;
  try {
    const currentOrder = await getPersistedOrderById(recordId);
    if (!currentOrder) return json(404, { error: "order_not_found" });
    if (currentOrder.status === "Enviado") return json(200, { ok: true, duplicate: true, pedido: currentOrder });
    if (!currentOrder.clienteEmail) return json(400, { error: "order_email_missing" });

    updatedOrder = await updatePersistedOrder(recordId, {
      Codigo: codigo,
      Status: "Enviado"
    });
    if (!updatedOrder || updatedOrder.codigo !== codigo || updatedOrder.status !== "Enviado") {
      updatedOrder = null;
      return json(409, {
        error: "airtable_delivery_fields_missing",
        requiredFields: ["Status", "Codigo"]
      });
    }
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
        await updatePersistedOrder(recordId, { Status: "Aguardando codigo" });
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
