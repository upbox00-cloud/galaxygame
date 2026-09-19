const { connectLambda } = require("@netlify/blobs");
const { json, requireAdmin, getUserEmail } = require("./_orders");
const { productsWithCurrentPrices, productsWithCommercialData } = require("./_commercial-catalog");
const { setPriceOverride, removePriceOverride } = require("./_price-overrides");

exports.handler = async (event, context) => {
  if (event?.blobs) connectLambda(event);
  const adminError = requireAdmin(context);
  if (adminError) return adminError;

  if (event.httpMethod === "GET") {
    const produtos = await productsWithCurrentPrices();
    return json(200, { produtos, total: produtos.length });
  }
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const product = productsWithCommercialData().find((item) => item.id === String(body.id || ""));
  if (!product) return json(404, { error: "product_not_found" });

  try {
    if (body.reset === true) await removePriceOverride(product.id);
    else await setPriceOverride(product.id, body.precoVendaEUR, getUserEmail(context));
    const updated = (await productsWithCurrentPrices()).find((item) => item.id === product.id);
    return json(200, { produto: updated });
  } catch (error) {
    if (error.code === "invalid_price") return json(400, { error: "invalid_price" });
    console.error("[admin-catalogo]", { message: error.message, productId: product.id });
    return json(500, { error: "price_update_failed" });
  }
};
