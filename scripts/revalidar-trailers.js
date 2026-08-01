const axios = require("axios");
const {
  PLATFORMS,
  loadJson,
  saveJson,
  sleep,
  normalizeName
} = require("./common");

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "AIzaSyC76FHRs9GAtGDCWV5hnM4JbGnvA9wIQx4";
const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const DAILY_SEARCH_LIMIT = Math.max(1, Number(process.env.YOUTUBE_DAILY_SEARCH_LIMIT || 90));
const SEARCH_LIMIT = Math.min(DAILY_SEARCH_LIMIT, Math.max(1, Number(process.env.YOUTUBE_REVALIDATE_SEARCH_LIMIT || 90)));
const REQUEST_DELAY_MS = Math.max(0, Number(process.env.YOUTUBE_REQUEST_DELAY_MS || 250));
const PROGRESS_FILE = "youtube-revalidacao-progresso.json";

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
    .replace(/\b(xbox\s*one|xbox\s*series\s*(x\|s|s\/x|x\/s)?|series\s*(x\|s|x\/s|s\/x))\b/g, " ")
    .replace(/\b(midia|media|digital|digita|codigo|conteudo|premium|low cost)\b/g, " ")
    .replace(/\b(edicao|edition|standard|deluxe|ultimate|exclusiva|exclusivo)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchName(product) {
  return baseGameName(product.nome)
    .replace(/\b(i{1,3}|iv|v|vi|vii|viii|ix|x)\b/g, (match) => match.toUpperCase());
}

function platformKeyFromFile(file) {
  return Object.values(PLATFORMS).find((platform) => platform.output === file)?.key || "";
}

function productPlatformKind(product, file = "") {
  const text = normalizeText(`${product?.plataforma || ""} ${product?.nome || ""} ${file}`);
  if (/\bps4\b|\bps5\b|playstation/.test(text)) return "playstation";
  if (/xbox/.test(text)) return "xbox";
  const key = platformKeyFromFile(file);
  if (["ps4", "ps5"].includes(key)) return "playstation";
  if (["xbox-one", "xbox-series"].includes(key)) return "xbox";
  return "unknown";
}

function platformSearchLabelForProduct(product, file = "") {
  const kind = productPlatformKind(product, file);
  if (kind === "playstation") {
    const text = normalizeText(`${product?.plataforma || ""} ${product?.nome || ""} ${file}`);
    return /\bps5\b|playstation 5/.test(text) ? "PS5" : "PlayStation";
  }
  if (kind === "xbox") return "Xbox";
  return "";
}

function videoPlatformMentions(value) {
  const text = normalizeText(value);
  return {
    playstation: /\bps4\b|\bps5\b|playstation/.test(text),
    xbox: /\bxbox\b|\bseries x\b|\bseries s\b/.test(text)
  };
}

function trailerPlatformConflict(product, file, title) {
  const kind = productPlatformKind(product, file);
  const mentions = videoPlatformMentions(title);
  if (kind === "playstation") return mentions.xbox && !mentions.playstation;
  if (kind === "xbox") return mentions.playstation && !mentions.xbox;
  return false;
}

function validTrailer(value) {
  return typeof value === "string" && /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{6,}$/.test(value.trim());
}

function trailerVideoId(value) {
  return validTrailer(value) ? value.trim().split("/embed/")[1] : "";
}

function loadProgress() {
  const progress = loadJson(PROGRESS_FILE, null);
  return progress && typeof progress === "object"
    ? { version: 1, runs: [], ...progress }
    : { version: 1, runs: [] };
}

function searchesUsedToday(progress) {
  const today = new Date().toISOString().slice(0, 10);
  return (progress.runs || [])
    .filter((run) => String(run.date || "").slice(0, 10) === today)
    .reduce((sum, run) => sum + Number(run.searchRequests || 0), 0);
}

function isQuotaError(error) {
  const reason = error.response?.data?.error?.errors?.[0]?.reason || "";
  return error.response?.status === 403 && /quota|dailyLimit/i.test(reason);
}

async function videoDetails(videoIds) {
  if (!videoIds.length) return new Map();
  const response = await axios.get(YOUTUBE_VIDEOS_URL, {
    timeout: 20000,
    params: {
      part: "snippet,status",
      id: videoIds.join(","),
      key: YOUTUBE_API_KEY
    }
  });

  return new Map((response.data?.items || []).map((item) => {
    const status = item.status || {};
    const embeddable = status.embeddable === true
      && status.uploadStatus === "processed"
      && status.privacyStatus !== "private";
    return [item.id, {
      id: item.id,
      title: item.snippet?.title || "",
      channelTitle: item.snippet?.channelTitle || "",
      embeddable
    }];
  }));
}

async function searchTrailerCandidates(query) {
  const response = await axios.get(YOUTUBE_SEARCH_URL, {
    timeout: 20000,
    params: {
      part: "snippet",
      q: query,
      type: "video",
      maxResults: 8,
      key: YOUTUBE_API_KEY
    }
  });

  return (response.data?.items || [])
    .map((item) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title || "",
      channelTitle: item.snippet?.channelTitle || ""
    }))
    .filter((item) => item.videoId);
}

async function findReplacementTrailer(product, file) {
  const name = searchName(product);
  if (!name) return { trailer: null, query: "" };

  const platformLabel = platformSearchLabelForProduct(product, file);
  const query = platformLabel ? `${name} ${platformLabel} trailer oficial` : `${name} trailer oficial`;
  const candidates = (await searchTrailerCandidates(query)).slice(0, 5);
  const details = await videoDetails(candidates.map((item) => item.videoId));

  for (const candidate of candidates) {
    const detail = details.get(candidate.videoId) || {};
    const hydrated = { ...candidate, ...detail };
    if (!hydrated.embeddable) continue;
    if (trailerPlatformConflict(product, file, hydrated.title)) continue;
    return {
      trailer: `https://www.youtube.com/embed/${hydrated.videoId}`,
      videoId: hydrated.videoId,
      title: hydrated.title,
      channelTitle: hydrated.channelTitle,
      query
    };
  }

  return { trailer: null, query };
}

function loadCatalogs() {
  const files = Object.values(PLATFORMS).map((platform) => platform.output);
  return Object.fromEntries(files.map((file) => [file, loadJson(file, [])]));
}

function allTrailerProducts(catalogs) {
  return Object.entries(catalogs).flatMap(([file, products]) => {
    return products
      .map((product, index) => ({ file, product, index, videoId: trailerVideoId(product.trailer) }))
      .filter((entry) => entry.videoId);
  });
}

async function main() {
  const catalogs = loadCatalogs();
  const entries = allTrailerProducts(catalogs);
  const progress = loadProgress();
  const searchesAlreadyUsed = searchesUsedToday(progress);
  const searchLimit = Math.max(0, Math.min(SEARCH_LIMIT, DAILY_SEARCH_LIMIT - searchesAlreadyUsed));

  let validationCalls = 0;
  let valid = 0;
  let broken = 0;
  let corrected = 0;
  let removed = 0;
  let searchRequests = 0;
  let errors = 0;
  let quotaReached = false;

  console.log(`[Trailers] A validar ${entries.length} trailer(s) existentes.`);

  for (let start = 0; start < entries.length; start += 50) {
    const batch = entries.slice(start, start + 50);
    const videoIds = [...new Set(batch.map((entry) => entry.videoId))];

    let details;
    try {
      details = await videoDetails(videoIds);
      validationCalls += 1;
    } catch (error) {
      errors += batch.length;
      console.warn(`[Trailers] Falhou validacao do lote ${start + 1}-${start + batch.length}: ${error.message}`);
      if (isQuotaError(error)) {
        quotaReached = true;
        break;
      }
      continue;
    }

    for (const entry of batch) {
      const detail = details.get(entry.videoId);
      const stillValid = detail?.embeddable === true;
      if (stillValid) {
        valid += 1;
        continue;
      }

      broken += 1;
      console.log(`[Trailers][Quebrado] ${entry.product.nome} (${entry.file})`);

      if (searchRequests >= searchLimit) {
        entry.product.trailer = null;
        removed += 1;
        console.log("  Removido: limite de busca atingido.");
        continue;
      }

      searchRequests += 1;
      try {
        const replacement = await findReplacementTrailer(entry.product, entry.file);
        if (replacement.trailer) {
          entry.product.trailer = replacement.trailer;
          delete entry.product.sem_alternativa_encontrada;
          corrected += 1;
          console.log(`  Corrigido: ${replacement.title}`);
        } else {
          entry.product.trailer = null;
          removed += 1;
          console.log("  Removido: sem substituto incorporavel.");
        }
      } catch (error) {
        errors += 1;
        entry.product.trailer = null;
        removed += 1;
        console.warn(`  Removido apos erro na busca: ${error.message}`);
        if (isQuotaError(error)) {
          quotaReached = true;
          break;
        }
      }

      await sleep(REQUEST_DELAY_MS);
    }

    Object.entries(catalogs).forEach(([file, products]) => saveJson(file, products));
    if (quotaReached) break;
  }

  Object.entries(catalogs).forEach(([file, products]) => saveJson(file, products));
  progress.updatedAt = new Date().toISOString();
  progress.runs.push({
    date: new Date().toISOString(),
    validatedTrailers: entries.length,
    validationCalls,
    broken,
    corrected,
    removed,
    searchRequests,
    errors
  });
  saveJson(PROGRESS_FILE, progress);

  console.log("\n[Trailers] Revalidacao concluida.");
  console.log(`Trailers existentes analisados: ${entries.length}`);
  console.log(`Videos.list chamadas: ${validationCalls}`);
  console.log(`Ainda validos: ${valid}`);
  console.log(`Quebrados encontrados: ${broken}`);
  console.log(`Corrigidos com substituto: ${corrected}`);
  console.log(`Removidos sem substituto: ${removed}`);
  console.log(`Buscas de substituto usadas: ${searchRequests}/${searchLimit}`);
  console.log(`Erros: ${errors}`);

  if (quotaReached) {
    console.log("Limite de quota atingido durante a revalidacao. Rode novamente mais tarde para continuar.");
  }
}

main().catch((error) => {
  console.error("[Trailers] Erro inesperado:", error);
  process.exitCode = 1;
});
