const { json, requireAdmin } = require("./_orders");
const { productsWithCommercialData } = require("./_commercial-catalog");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });
  const adminError = requireAdmin(context);
  if (adminError) return adminError;

  const produtos = productsWithCommercialData();
  return json(200, { produtos, total: produtos.length });
};
