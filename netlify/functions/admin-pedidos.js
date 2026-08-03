const { json, escapeFormulaValue, listOrdersByFormula, requireAdmin } = require("./_orders");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });
  const adminError = requireAdmin(context);
  if (adminError) return adminError;

  try {
    const requestedStatus = new URLSearchParams(event.rawQuery || "").get("status") || "Aguardando codigo";
    const status = ["Aguardando codigo", "Enviado"].includes(requestedStatus)
      ? requestedStatus
      : "Aguardando codigo";
    const formula = `{Status}='${escapeFormulaValue(status)}'`;
    const pedidos = await listOrdersByFormula(formula, { maxRecords: 100 });
    return json(200, { pedidos });
  } catch (error) {
    console.error("[admin-pedidos]", error);
    return json(500, { error: "orders_fetch_failed" });
  }
};
