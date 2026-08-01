const axios = require("axios");
const {
  PLATFORMS,
  loadJson,
  saveJson,
  sleep,
  normalizeName,
  gameNameMatch
} = require("./common");

const STEAMGRIDDB_TOKEN = process.env.STEAMGRIDDB_TOKEN || "aff91ae25ffecb0de75c38c035396ff5";
const STEAMGRIDDB_BASE = "https://www.steamgriddb.com/api/v2";
const REQUEST_DELAY_MS = Number(process.env.STEAMGRIDDB_DELAY_MS || 750);
const PREFERRED_GRID_QUERY = "dimensions=600x900&styles=alternate,white_logo,material";
const FALLBACK_GRID_QUERY = "dimensions=600x900";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function baseGameName(value) {
  return normalizeText(normalizeName(value))
    .replace(/\bxbox\s*one\s*&\s*(xbox\s*)?series\s*(s\/x|x\/s|x\|s)\b/g, " ")
    .replace(/\b(playstation\s*4|playstation\s*5|ps4|ps5)\b/g, " ")
    .replace(/\b(xbox\s*one|xbox\s*series\s*(x\|s|s\/x|x\/s)?|series\s*(x\|s|s\/x|x\/s))\b/g, " ")
    .replace(/\b(s\/x|x\/s|x\|s|s\|x)\b/g, " ")
    .replace(/\b(midia|media|digital|digita|codigo|conteudo|conteudo digital)\b/g, " ")
    .replace(/\b(edicao|edition|standard|deluxe|ultimate|premium|exclusiva|exclusivo)\b/g, " ")
    .replace(/&/g, " e ")
    .replace(/\bs\s*x\b/g, " ")
    .replace(/\b(e|xbox|series)\b/g, " ")
    .replace(/\bpay\s+day\b/g, "payday")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function curatedSearchName(name) {
  const normalized = normalizeText(name);

  if (/\b(gta|grand theft auto)\b/.test(normalized)) {
    if (/\b(vi|6)\b/.test(normalized)) return "Grand Theft Auto VI";
    if (/\btrilogy\b/.test(normalized)) return "Grand Theft Auto The Trilogy Definitive Edition";
    if (/\b(v|5)\b/.test(normalized)) return "Grand Theft Auto V";
  }

  return "";
}

function searchName(product) {
  return (curatedSearchName(product.nome) || baseGameName(product.nome))
    .replace(/\b(i{1,3}|iv|v|vi|vii|viii|ix|x)\b/g, (match) => match.toUpperCase())
    .trim();
}

async function steamGridGet(path) {
  const response = await axios.get(`${STEAMGRIDDB_BASE}${path}`, {
    timeout: 25000,
    proxy: false,
    headers: {
      Authorization: `Bearer ${STEAMGRIDDB_TOKEN}`,
      "user-agent": "GalaxyGame catalog enricher"
    }
  });
  return response.data;
}

function gridScore(grid) {
  return Number(grid.score || 0) * 1000 + Number(grid.upvotes || 0) - Number(grid.downvotes || 0);
}

async function getGridCandidates(gameId, query, label) {
  try {
    const response = await steamGridGet(`/grids/game/${gameId}?${query}`);
    return (response.data || []).filter((grid) => grid.url);
  } catch (error) {
    console.warn(`[SteamGridDB] Sem grids ${label}: ${error.message}`);
    return [];
  } finally {
    await sleep(REQUEST_DELAY_MS);
  }
}

function bestGrid(grids) {
  return [...grids].sort((first, second) => gridScore(second) - gridScore(first))[0] || null;
}

async function findCoverUrl(name) {
  if (!name) return null;

  const search = await steamGridGet(`/search/autocomplete/${encodeURIComponent(name)}`);
  const ranked = (search.data || [])
    .map((game) => ({ game, validation: gameNameMatch(name, game.name) }))
    .sort((first, second) => second.validation.score - first.validation.score);
  const selected = ranked[0];
  await sleep(REQUEST_DELAY_MS);

  if (!selected?.game?.id || !selected.validation.accepted) {
    if (selected?.game?.name) {
      console.log(`[SteamGridDB][MATCH REJEITADO] "${name}" -> "${selected.game.name}" (${selected.validation.score})`);
    }
    return { url: null, matchedName: selected?.game?.name || null, score: selected?.validation?.score || 0 };
  }

  const game = selected.game;
  console.log(`[SteamGridDB][MATCH ACEITE] "${name}" -> "${game.name}" (${selected.validation.score})`);

  const preferredGrids = await getGridCandidates(game.id, PREFERRED_GRID_QUERY, "preferidos");
  const preferredGrid = bestGrid(preferredGrids);

  if (preferredGrid) {
    return {
      url: preferredGrid.url,
      matchedName: game.name,
      score: selected.validation.score,
      gridScore: gridScore(preferredGrid),
      gridStyle: preferredGrid.style || "preferred",
      risky: false
    };
  }

  const fallbackGrids = await getGridCandidates(game.id, FALLBACK_GRID_QUERY, "fallback");
  const fallbackGrid = bestGrid(fallbackGrids);

  return {
    url: fallbackGrid?.url || null,
    matchedName: game.name,
    score: selected.validation.score,
    gridScore: fallbackGrid ? gridScore(fallbackGrid) : 0,
    gridStyle: fallbackGrid?.style || null,
    risky: Boolean(fallbackGrid)
  };
}

async function main() {
  const platformFiles = Object.values(PLATFORMS).map((platform) => platform.output);
  const catalogs = Object.fromEntries(platformFiles.map((file) => [file, loadJson(file, [])]));
  const cache = new Map();
  let processed = 0;
  let success = 0;
  let failed = 0;
  const reviewItems = [];
  const total = Object.values(catalogs).reduce((sum, products) => sum + products.length, 0);

  for (const file of platformFiles) {
    const products = catalogs[file];

    for (const product of products) {
      processed += 1;
      const name = searchName(product);
      const key = normalizeText(name) || baseGameName(product.nome) || product.id;

      try {
        if (!cache.has(key)) {
          console.log(`[SteamGridDB] ${processed}/${total} A procurar capa: ${name}`);
          cache.set(key, await findCoverUrl(name));
        } else {
          console.log(`[SteamGridDB] ${processed}/${total} Cache: ${name}`);
        }

        const result = cache.get(key);
        product.capaSteamGridDB = result?.url || null;
        product.steamGridMatchValidated = true;
        product.steamGridMatchedName = result?.matchedName || null;
        product.steamGridMatchScore = result?.score || 0;
        product.steamGridGridScore = result?.gridScore || 0;
        product.steamGridGridStyle = result?.gridStyle || null;
        product.steamGridNeedsReview = Boolean(result?.risky);
        if (product.capaSteamGridDB) success += 1;
        else failed += 1;

        if (product.steamGridNeedsReview) {
          reviewItems.push({
            id: product.id,
            nome: product.nome,
            plataforma: product.plataforma,
            arquivo: file,
            busca: name,
            match: product.steamGridMatchedName,
            matchScore: product.steamGridMatchScore,
            gridStyle: product.steamGridGridStyle,
            capaSteamGridDB: product.capaSteamGridDB,
            motivo: "Sem capa nos estilos preferidos; usada imagem fallback possivelmente com selo de plataforma."
          });
        }
      } catch (error) {
        console.warn(`[SteamGridDB] Falhou "${product.nome}": ${error.message}`);
        product.capaSteamGridDB = null;
        product.steamGridNeedsReview = false;
        cache.set(key, { url: null, matchedName: null, score: 0, risky: false });
        failed += 1;
        await sleep(REQUEST_DELAY_MS);
      }

      if (processed % 25 === 0) saveJson(file, products);
    }

    saveJson(file, products);
    console.log(`[SteamGridDB] Gravado data/${file}: ${products.length} produto(s).`);
  }

  console.log("\n[SteamGridDB] Concluido.");
  console.log(`Produtos processados: ${processed}`);
  console.log(`Com capa encontrada: ${success}`);
  console.log(`Sem capa encontrada: ${failed}`);
  console.log(`Jogos unicos pesquisados: ${cache.size}`);
  saveJson("imagens-para-revisar.json", reviewItems);
  console.log(`Produtos para revisao manual: ${reviewItems.length}`);
}

main().catch((error) => {
  console.error("[SteamGridDB] Erro inesperado:", error);
  process.exitCode = 1;
});
