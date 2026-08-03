const { json, escapeFormulaValue, getUserEmail, listOrdersByFormula } = require("./_orders");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });
  const email = getUserEmail(context);
  if (!email) return json(401, { error: "login_required" });

  try {
    const formula = `{ClienteEmail}='${escapeFormulaValue(email)}'`;
    const pedidos = await listOrdersByFormula(formula, { maxRecords: 100 });
    return json(200, {
      pedidos: pedidos.map((pedido) => ({
        id: pedido.id,
        produto: pedido.produto,
        plataforma: pedido.plataforma,
        valorPagoEUR: pedido.valorPagoEUR,
        status: pedido.status,
        dataCompra: pedido.dataCompra,
        codigo: pedido.status === "Enviado" ? pedido.codigo : ""
      }))
    });
  } catch (error) {
    console.error("[meus-pedidos]", error);
    return json(500, { error: "orders_fetch_failed" });
  }
};
