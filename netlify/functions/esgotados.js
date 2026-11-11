const { connectLambda } = require("@netlify/blobs");
const { json } = require("./_orders");
const { readSoldOut, soldOutIds } = require("./_sold-out");

// Público: só os ids dos jogos esgotados (sem datas nem emails).
exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });
  try {
    if (event?.blobs) connectLambda(event);
    return {
      statusCode: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, max-age=0" },
      body: JSON.stringify({ ids: soldOutIds(await readSoldOut()) })
    };
  } catch (error) {
    console.error("[esgotados]", { message: error.message });
    return json(500, { error: "sold_out_unavailable" });
  }
};
