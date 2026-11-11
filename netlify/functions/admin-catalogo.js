const { connectLambda } = require("@netlify/blobs");
const { json, requireAdmin, getUserEmail } = require("./_orders");
const { productsWithCurrentPrices, productsWithCommercialData } = require("./_commercial-catalog");
const { setPriceOverride, removePriceOverride } = require("./_price-overrides");
const { SPECIAL_PRODUCTS, readSoldOut, setSoldOut, applySoldOut } = require("./_sold-out");

exports.handler = async (event, context) => {
  if (event?.blobs) connectLambda(event);
  const adminError = requireAdmin(context);
  if (adminError) return adminError;

  if (event.httpMethod === "GET") {
    const produtos = await productsWithCurrentPrices();
    // jogos fora do catálogo público (ex.: GTA VI): só admitem o estado "esgotado"
    const especiais = applySoldOut(SPECIAL_PRODUCTS, await readSoldOut());
    return json(200, { produtos, especiais, total: produtos.length });
  }
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (typeof body.esgotado === "boolean") {
    const id = String(body.id || "");
    const known = productsWithCommercialData().find((item) => item.id === id) || SPECIAL_PRODUCTS.find((item) => item.id === id);
    if (!known) return json(404, { error: "product_not_found" });
    try {
      await setSoldOut(id, body.esgotado, getUserEmail(context));
      const current = (await productsWithCurrentPrices()).find((item) => item.id === id);
      const produto = current || applySoldOut([known], await readSoldOut())[0];
      return json(200, { produto });
    } catch (error) {
      console.error("[admin-catalogo:sold-out]", { message: error.message, productId: id });
      return json(500, { error: "sold_out_update_failed" });
    }
  }

  const product = productsWithCommercialData().find((item) => item.id === String(body.id || ""));
  if (!product) return json(404, { error: "product_not_found" });

  try {
    let updated = product;
    if (body.reset === true) {
      await removePriceOverride(product.id);
    } else {
      const override = await setPriceOverride(product.id, body.precoVendaEUR, getUserEmail(context));
      updated = {
        ...product,
        precoVendaEUR: override.precoVendaEUR,
        precoManual: true,
        precoAutomaticoEUR: Number(product.precoVendaEUR || 0),
        precoManualAtualizadoEm: override.updatedAt
      };
    }
    return json(200, { produto: updated });
  } catch (error) {
    if (error.code === "invalid_price") return json(400, { error: "invalid_price" });
    console.error("[admin-catalogo]", { message: error.message, productId: product.id });
    return json(500, { error: "price_update_failed" });
  }
};
