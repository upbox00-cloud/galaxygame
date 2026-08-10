const { json, listPersistedOrders, requireAdmin } = require("./_orders");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });
  const adminError = requireAdmin(context);
  if (adminError) return adminError;

  try {
    const requestedStatus = event.queryStringParameters?.status
      || new URLSearchParams(event.rawQuery || "").get("status")
      || "all";
    const allowedStatuses = ["all", "Aguardando codigo", "Enviado", "Cancelado"];
    const status = allowedStatuses.includes(requestedStatus) ? requestedStatus : "all";
    const pedidos = await listPersistedOrders({
      status: status === "all" ? "" : status,
      maxRecords: 500
    });
    return json(200, {
      pedidos,
      total: pedidos.length,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("[admin-pedidos]", error);
    return json(500, { error: "orders_fetch_failed" });
  }
};
