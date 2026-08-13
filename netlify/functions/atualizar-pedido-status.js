const { json, requireAdmin, getPersistedOrderById, updatePersistedOrder } = require("./_orders");

const ALLOWED_STATUSES = ["Aguardando codigo", "Cancelado"];

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
  const status = String(body.status || "").trim();
  if (!/^(rec[a-zA-Z0-9]+|blob_[a-zA-Z0-9_-]+)$/.test(recordId) || !ALLOWED_STATUSES.includes(status)) {
    return json(400, { error: "invalid_order_or_status" });
  }

  try {
    const currentOrder = await getPersistedOrderById(recordId);
    if (!currentOrder) return json(404, { error: "order_not_found" });
    const updatedOrder = await updatePersistedOrder(recordId, { Status: status });
    if (!updatedOrder) return json(409, { error: "order_status_not_saved" });
    return json(200, { ok: true, pedido: { ...updatedOrder, status } });
  } catch (error) {
    console.error("[atualizar-pedido-status]", {
      message: error.message,
      orderId: recordId,
      status
    });
    return json(500, { error: "order_update_failed" });
  }
};
