const axios = require("axios");
const {
  PLATFORMS,
  sleep,
  loadJson,
  saveJson,
  normalizeName,
  gameNameMatch,
  flattenRawFornecedor
} = require("./common");

const RAWG_KEY = process.env.RAWG_KEY || "df3fe197332a4f6d878f51eb8827dc1e";
const RAWG_BASE = "https://api.rawg.io/api";
const RAWG_MATCH_VERSION = 3;

async function rawgGet(path, params = {}) {
  const response = await axios.get(`${RAWG_BASE}${path}`, {
    timeout: 25000,
    proxy: false,
    params: { key: RAWG_KEY, ...params }
  });
  return response.data;
}

function shortDescription(text) {
  if (!text) return "";
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > 300 ? `${clean.slice(0, 297).trim()}...` : clean;
}

function trailerFromDetails(details, movies) {
  const clip = details?.clip;
  const clipUrl = clip?.clips?.["640"] || clip?.clip || clip?.video || "";
  if (/youtube\.com|youtu\.be/.test(clipUrl)) return clipUrl.replace("watch?v=", "embed/");

  const movieUrl = movies?.results?.[0]?.data?.max || movies?.results?.[0]?.data?.["480"] || "";
  return /youtube\.com|youtu\.be/.test(movieUrl) ? movieUrl.replace("watch?v=", "embed/") : "";
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function rawgMeta(details = {}, match = {}) {
  const genres = (details.genres || match.genres || [])
    .map((genre) => typeof genre === "string" ? genre : genre?.name)
    .filter(Boolean);

  return {
    released: details.released || match.released || null,
    rating: numberOrZero(details.rating ?? match.rating),
    ratings_count: numberOrZero(details.ratings_count ?? match.ratings_count),
    added: numberOrZero(details.added ?? match.added),
    genres
  };
}

function hasRawgMeta(product) {
  return product
    && Object.prototype.hasOwnProperty.call(product, "released")
    && Object.prototype.hasOwnProperty.call(product, "rating")
    && Object.prototype.hasOwnProperty.call(product, "ratings_count")
    && Object.prototype.hasOwnProperty.call(product, "added")
    && Array.isArray(product.genres);
}

function unmatchedProduct(product, previous = null, reason = "sem correspondencia") {
  return {
    ...product,
    trailer: previous?.trailer || product.trailer || "",
    screenshots: product.imagemPrincipal ? [product.imagemPrincipal] : [],
    descricao: "",
    imagemFallback: product.imagemPrincipal || "",
    released: null,
    rating: 0,
    ratings_count: 0,
    added: 0,
    genres: [],
    rawgMatchValidated: true,
    rawgMatchVersion: RAWG_MATCH_VERSION,
    rawgMatchReason: reason,
    enriquecido: false
  };
}

function selectBestMatch(search, results = []) {
  const ranked = results
    .map((candidate) => ({ candidate, validation: gameNameMatch(search, candidate.name) }))
    .sort((first, second) => second.validation.score - first.validation.score);
  const best = ranked[0];
  if (!best) return null;

  const status = best.validation.accepted ? "ACEITE" : "REJEITADO";
  console.log(`[RAWG][MATCH ${status}] "${search}" -> "${best.candidate.name}" (${best.validation.score})`);
  return best.validation.accepted ? best : null;
}

async function enrichProduct(product, index, total, previous = null) {
  const search = normalizeName(product.nome);
  console.log(`[RAWG] Processando ${index}/${total}: ${search}`);

  try {
    if (previous?.rawgMatchValidated && previous.rawgMatchVersion === RAWG_MATCH_VERSION && hasRawgMeta(previous)) {
      return { ...previous, ...product };
    }
    const searchData = await rawgGet("/games", { search, page_size: 10 });
    const selected = selectBestMatch(search, searchData.results || []);
    await sleep(100);

    if (!selected) return unmatchedProduct(product, previous, "nome RAWG divergente");
    const match = selected.candidate;

    const [details, screenshots, movies] = await Promise.all([
      rawgGet(`/games/${match.id}`),
      rawgGet(`/games/${match.id}/screenshots`, { page_size: 5 }),
      rawgGet(`/games/${match.id}/movies`, { page_size: 1 }).catch(() => null)
    ]);
    await sleep(250);

    const screenshotUrls = (screenshots.results || []).map((item) => item.image).filter(Boolean).slice(0, 5);
    return {
      ...product,
      rawgId: match.id,
      rawgSlug: match.slug,
      trailer: previous?.trailer || trailerFromDetails(details, movies),
      screenshots: screenshotUrls.length ? screenshotUrls : product.imagemPrincipal ? [product.imagemPrincipal] : [],
      descricao: shortDescription(details.description_raw),
      imagemFallback: match.background_image || product.imagemPrincipal,
      ...rawgMeta(details, match),
      rawgMatchValidated: true,
      rawgMatchVersion: RAWG_MATCH_VERSION,
      rawgMatchedName: match.name,
      rawgMatchScore: selected.validation.score,
      enriquecido: true
    };
  } catch (error) {
    console.warn(`[RAWG] Falhou "${product.nome}": ${error.message}`);
    return {
      ...(previous || {}),
      ...product,
      rawgMatchValidated: false,
      rawgMatchReason: `erro: ${error.message}`
    };
  }
}

async function main() {
  const raw = loadJson("raw-fornecedor.json", {});
  const products = flattenRawFornecedor(raw);
  const previousEnriched = loadJson("enriquecido.json", []);
  const currentCatalogs = Object.values(PLATFORMS)
    .flatMap((platform) => loadJson(platform.output, []));
  const previousById = new Map(previousEnriched.map((item) => [item.id, item]));
  currentCatalogs.forEach((item) => {
    previousById.set(item.id, { ...previousById.get(item.id), ...item });
  });

  const enriched = products.map((product) => previousById.get(product.id) || null);
  const batchSize = 4;

  for (let start = 0; start < products.length; start += batchSize) {
    const batch = products.slice(start, start + batchSize);
    const results = await Promise.all(batch.map((product, offset) => {
      const index = start + offset;
      return enrichProduct(product, index + 1, products.length, previousById.get(product.id));
    }));
    results.forEach((result, offset) => {
      enriched[start + offset] = result;
    });

    if ((start + batchSize) % 40 === 0 || start + batchSize >= products.length) {
      saveJson("enriquecido.json", enriched.filter(Boolean));
      console.log(`[RAWG] Checkpoint: ${Math.min(start + batchSize, products.length)}/${products.length}`);
    }
  }

  const success = enriched.filter((item) => item.enriquecido).length;
  saveJson("enriquecido.json", enriched);
  console.log(`\n[RAWG] Concluido. ${success}/${products.length} enriquecido(s). Ficheiro: data/enriquecido.json`);
}

main().catch((error) => {
  console.error("[RAWG] Erro inesperado:", error);
  process.exitCode = 1;
});
