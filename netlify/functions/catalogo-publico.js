const { connectLambda } = require("@netlify/blobs");
const { json } = require("./_orders");
const { publicProducts } = require("./_commercial-catalog");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });
  try {
    if (event?.blobs) connectLambda(event);
    const products = await publicProducts();
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, max-age=0"
      },
      body: JSON.stringify(products)
    };
  } catch (error) {
    console.error("[catalogo-publico]", { message: error.message });
    return json(500, { error: "catalog_unavailable" });
  }
};
