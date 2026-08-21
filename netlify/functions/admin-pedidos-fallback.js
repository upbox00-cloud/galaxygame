const { connectLambda } = require("@netlify/blobs");
const { json, listFallbackOrders, requireAdmin } = require("./_orders");

exports.handler = async (event, context) => {
  if (event?.blobs) connectLambda(event);
  if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });
  const adminError = requireAdmin(context);
  if (adminError) return adminError;

  try {
    const pedidos = await listFallbackOrders({ maxRecords: 500 });
    return json(200, {
      pedidos,
      total: pedidos.length,
      explanation: "Pedidos presentes no Netlify Blobs sem cópia correspondente no Airtable.",
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("[admin-pedidos-fallback]", { message: error.message });
    return json(500, { error: "fallback_orders_fetch_failed" });
  }
};
