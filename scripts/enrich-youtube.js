const axios = require("axios");
const {
  PLATFORMS,
  loadJson,
  saveJson,
  sleep,
  normalizeName
} = require("./common");

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
if (!YOUTUBE_API_KEY) {
  console.error("[enrich-youtube] YOUTUBE_API_KEY em falta nas variaveis de ambiente");
  process.exit(1);
}
const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const DAILY_SEARCH_LIMIT = 90;
const REQUEST_LIMIT = Math.min(90, Math.max(1, Number(process.env.YOUTUBE_REQUEST_LIMIT || 90)));
const REQUEST_DELAY_MS = Math.max(0, Number(process.env.YOUTUBE_REQUEST_DELAY_MS || 250));
const PROGRESS_FILE = "youtube-progresso.json";
const REVIEW_FILE = "trailers-para-revisar.json";
const FIX_REVIEW_MODE = process.argv.includes("--fix-review");

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

function discountValue(product) {
  const original = Number(product.precoOriginalEUR || 0);
  const sale = Number(product.precoVendaEUR || 0);
  if (!original || !sale || sale >= original) return 0;
  return Math.round((1 - sale / original) * 100);
}

function trendScore(product) {
  return discountValue(product) + Number(product.rating || 0) * 10;
}

function popularityScore(product, platformKey = "") {
  const popularity = Math.max(Number(product.added || 0), Number(product.ratings_count || 0));
  const playStationBoost = ["ps4", "ps5"].includes(platformKey) ? 1000 : 0;
  return popularity + playStationBoost;
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

function platformSearchLabelForGroup(group) {
  const kinds = new Set(group.items.map(({ product, file }) => productPlatformKind(product, file)));
  if (kinds.size !== 1) return "";
  if (kinds.has("playstation")) {
    const hasPs5 = group.items.some(({ product, file }) => /\bps5\b|playstation 5/i.test(`${product?.plataforma || ""} ${product?.nome || ""}`) || platformKeyFromFile(file) === "ps5");
    return hasPs5 ? "PS5" : "PlayStation";
  }
  if (kinds.has("xbox")) return "Xbox";
  return "";
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

function groupHasTrailerConflict(group, title) {
  return group.items.some(({ product, file }) => trailerPlatformConflict(product, file, title));
}

function reviewKey(product, file, videoId = "") {
  return `${product?.id || product?.nome || "produto"}::${file}::${videoId}`;
}

function makeReviewEntry({ product, file, trailer, videoId, title, channelTitle, reason, source, query }) {
  return {
    id: product.id || "",
    nome: product.nome || "",
    plataforma: product.plataforma || PLATFORMS[platformKeyFromFile(file)]?.label || "",
    arquivo: file,
    trailer: trailer || (videoId ? `https://www.youtube.com/embed/${videoId}` : ""),
    videoId: videoId || trailerVideoId(trailer),
    tituloVideo: title || "",
    canal: channelTitle || "",
    motivo: reason,
    origem: source,
    query: query || "",
    revisadoEm: new Date().toISOString()
  };
}

function addReview(reviewMap, entry) {
  const key = `${entry.id || entry.nome}::${entry.arquivo}::${entry.videoId}::${entry.motivo}`;
  reviewMap.set(key, entry);
}

function loadReviewMap() {
  const current = loadJson(REVIEW_FILE, []);
  const map = new Map();
  if (Array.isArray(current)) {
    current.forEach((entry) => {
      const key = `${entry.id || entry.nome}::${entry.arquivo}::${entry.videoId}::${entry.motivo}`;
      map.set(key, entry);
    });
  }
  return map;
}

function saveReviews(reviewMap) {
  saveJson(REVIEW_FILE, [...reviewMap.values()].sort((first, second) => {
    return String(first.nome).localeCompare(String(second.nome)) || String(first.plataforma).localeCompare(String(second.plataforma));
  }));
}

function groupTrendScore(group) {
  return Math.max(...group.items.map(({ product }) => trendScore(product)), 0);
}

function groupPopularityScore(group) {
  return Math.max(...group.items.map(({ product, file }) => popularityScore(product, platformKeyFromFile(file))), 0);
}

function groupProducts(catalogs) {
  const groups = new Map();

  Object.entries(catalogs).forEach(([file, products]) => {
    products.forEach((product) => {
      const key = baseGameName(product.nome) || product.id;
      const item = { product, file };
      const group = groups.get(key) || { key, items: [], representative: product };
      group.items.push(item);
      if (Number(product.precoVendaEUR || 0) > Number(group.representative.precoVendaEUR || 0)) {
        group.representative = product;
      }
      groups.set(key, group);
    });
  });

  return [...groups.values()];
}

function topUniqueKeys(groups, score, limit = 8) {
  return new Set([...groups]
    .sort((first, second) => score(second) - score(first))
    .slice(0, limit)
    .map((group) => group.key));
}

function prioritizedGroups(groups) {
  const trending = topUniqueKeys(groups, groupTrendScore);
  const bestSellers = topUniqueKeys(groups, groupPopularityScore);

  return [...groups].sort((first, second) => {
    const firstCurated = trending.has(first.key) || bestSellers.has(first.key);
    const secondCurated = trending.has(second.key) || bestSellers.has(second.key);
    if (firstCurated !== secondCurated) return firstCurated ? -1 : 1;

    if (firstCurated && secondCurated) {
      const firstScore = Math.max(groupTrendScore(first), groupPopularityScore(first));
      const secondScore = Math.max(groupTrendScore(second), groupPopularityScore(second));
      if (firstScore !== secondScore) return secondScore - firstScore;
    }

    return Number(second.representative.precoVendaEUR || 0) - Number(first.representative.precoVendaEUR || 0);
  });
}

function validTrailer(value) {
  return typeof value === "string" && /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{6,}$/.test(value.trim());
}

function trailerVideoId(value) {
  return validTrailer(value) ? value.trim().split("/embed/")[1] : "";
}

function setGroupTrailer(group, trailer) {
  group.items.forEach(({ product }) => {
    product.trailer = trailer;
  });
}

function saveCatalogs(catalogs) {
  Object.entries(catalogs).forEach(([file, products]) => saveJson(file, products));
}

function loadProgress() {
  const progress = loadJson(PROGRESS_FILE, null);
  return progress && typeof progress === "object"
    ? { version: 1, processed: {}, runs: [], ...progress }
    : { version: 1, processed: {}, runs: [] };
}

async function embeddableVideoIds(videoIds) {
  if (!videoIds.length) return new Map();
  const response = await axios.get(YOUTUBE_VIDEOS_URL, {
    timeout: 20000,
    params: {
      part: "status",
      id: videoIds.join(","),
      key: YOUTUBE_API_KEY
    }
  });

  const statuses = new Map(videoIds.map((id) => [id, false]));
  (response.data?.items || []).forEach((item) => {
    const status = item.status || {};
    const available = status.embeddable === true
      && status.uploadStatus === "processed"
      && status.privacyStatus !== "private";
    statuses.set(item.id, available);
  });
  return statuses;
}

async function videoDetails(videoIds, part = "snippet,status") {
  if (!videoIds.length) return new Map();
  const response = await axios.get(YOUTUBE_VIDEOS_URL, {
    timeout: 20000,
    params: {
      part,
      id: videoIds.join(","),
      key: YOUTUBE_API_KEY
    }
  });

  return new Map((response.data?.items || []).map((item) => {
    const status = item.status || {};
    const available = status.embeddable === true
      && status.uploadStatus === "processed"
      && status.privacyStatus !== "private";
    return [item.id, {
      id: item.id,
      title: item.snippet?.title || "",
      channelTitle: item.snippet?.channelTitle || "",
      embeddable: available
    }];
  }));
}

function searchQueriesForGroup(group, name) {
  const platformLabel = platformSearchLabelForGroup(group);
  const generic = `${name} trailer oficial`;
  if (!platformLabel) return [generic, `${name} official trailer`];
  return [`${name} ${platformLabel} trailer oficial`, generic, `${name} official trailer`];
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
      channelTitle: item.snippet?.channelTitle || "",
      query
    }))
    .filter((item) => item.videoId);
}

async function findReplacementTrailerForProduct(product, file) {
  const name = searchName(product);
  const platformLabel = platformSearchLabelForProduct(product, file);
  const query = platformLabel ? `${name} ${platformLabel} trailer oficial` : `${name} trailer oficial`;
  const candidates = (await searchTrailerCandidates(query)).slice(0, 3);
  const details = await videoDetails(candidates.map((item) => item.videoId), "snippet,status");

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

async function findOfficialTrailer(group, name) {
  const queries = searchQueriesForGroup(group, name);
  const seen = new Set();
  const candidates = [];

  for (const query of queries) {
    const results = await searchTrailerCandidates(query);
    results.forEach((item) => {
      if (seen.has(item.videoId)) return;
      seen.add(item.videoId);
      candidates.push(item);
    });
    if (results.length) break;
  }

  const details = await videoDetails(candidates.map((item) => item.videoId), "snippet,status");
  const hydrated = candidates
    .map((item) => ({ ...item, ...(details.get(item.videoId) || {}) }))
    .filter((item) => item.embeddable);

  const preferred = hydrated.find((item) => !groupHasTrailerConflict(group, item.title));
  const fallback = preferred || hydrated[0] || null;

  if (!fallback) return { trailer: null, status: "not-found", query: queries[0], fallbackUsed: false };
  return {
    trailer: `https://www.youtube.com/embed/${fallback.videoId}`,
    videoId: fallback.videoId,
    title: fallback.title,
    channelTitle: fallback.channelTitle,
    query: fallback.query || queries[0],
    status: preferred ? "found" : "found-needs-review",
    fallbackUsed: !preferred
  };
}

async function validateExistingTrailers(groups, progress, catalogs, reviewMap) {
  const groupsByVideoId = new Map();

  groups.forEach((group) => {
    const trailer = progress.processed[group.key]?.trailer
      || group.items.map(({ product }) => product.trailer).find(validTrailer);
    const videoId = trailerVideoId(trailer);
    if (!videoId) return;
    const entries = groupsByVideoId.get(videoId) || [];
    entries.push(group);
    groupsByVideoId.set(videoId, entries);
  });

  const videoIds = [...groupsByVideoId.keys()];
  let calls = 0;
  let valid = 0;
  let invalid = 0;
  let errors = 0;

  for (let start = 0; start < videoIds.length; start += 50) {
    const batch = videoIds.slice(start, start + 50);
    try {
      const details = await videoDetails(batch, "snippet,status");
      calls += 1;
      batch.forEach((videoId) => {
        const detail = details.get(videoId) || {};
        const isValid = detail.embeddable === true;
        (groupsByVideoId.get(videoId) || []).forEach((group) => {
          const trailer = isValid ? `https://www.youtube.com/embed/${videoId}` : null;
          setGroupTrailer(group, trailer);
          if (isValid) {
            group.items.forEach(({ product, file }) => {
              if (!trailerPlatformConflict(product, file, detail.title)) return;
              addReview(reviewMap, makeReviewEntry({
                product,
                file,
                trailer,
                videoId,
                title: detail.title,
                channelTitle: detail.channelTitle,
                reason: "trailer-existente-com-branding-de-outra-plataforma",
                source: "videos.list"
              }));
            });
          }
          progress.processed[group.key] = {
            ...progress.processed[group.key],
            trailer,
            status: isValid ? "found" : "invalid-embed",
            videoTitle: isValid ? detail.title : progress.processed[group.key]?.videoTitle,
            channelTitle: isValid ? detail.channelTitle : progress.processed[group.key]?.channelTitle,
            validatedAt: new Date().toISOString()
          };
        });
        if (isValid) valid += 1;
        else invalid += 1;
      });
      saveCatalogs(catalogs);
      saveJson(PROGRESS_FILE, progress);
      saveReviews(reviewMap);
    } catch (error) {
      errors += 1;
      console.warn(`[YouTube] Falhou a validacao de ${batch.length} video(s): ${error.message}`);
    }
  }

  return { calls, valid, invalid, errors };
}

function searchesUsedToday(progress) {
  const today = new Date().toISOString().slice(0, 10);
  return (progress.runs || [])
    .filter((run) => String(run.date || "").slice(0, 10) === today)
    .reduce((sum, run) => sum + Number(run.requests || 0), 0);
}

function isQuotaError(error) {
  const reason = error.response?.data?.error?.errors?.[0]?.reason || "";
  return error.response?.status === 403 && /quota|dailyLimit/i.test(reason);
}

async function fixReviewedTrailers() {
  const reviews = loadJson(REVIEW_FILE, []);
  if (!Array.isArray(reviews) || !reviews.length) {
    saveJson(REVIEW_FILE, []);
    console.log("[YouTube][Revisao] Nenhum produto para corrigir.");
    return;
  }

  const platformFiles = Object.values(PLATFORMS).map((platform) => platform.output);
  const catalogs = Object.fromEntries(platformFiles.map((file) => [file, loadJson(file, [])]));
  const progress = loadProgress();
  const remaining = [];
  let corrected = 0;
  let withoutAlternative = 0;
  let requests = 0;
  let errors = 0;

  for (const review of reviews) {
    const file = review.arquivo;
    const products = catalogs[file];
    const product = Array.isArray(products)
      ? products.find((item) => item.id === review.id) || products.find((item) => item.nome === review.nome)
      : null;

    if (!product) {
      remaining.push({ ...review, sem_alternativa_encontrada: true, motivo: "produto-nao-encontrado-no-catalogo" });
      withoutAlternative += 1;
      continue;
    }

    requests += 1;
    console.log(`[YouTube][Revisao] ${requests}/${reviews.length}: ${product.nome}`);

    try {
      const replacement = await findReplacementTrailerForProduct(product, file);
      if (replacement.trailer) {
        product.trailer = replacement.trailer;
        delete product.sem_alternativa_encontrada;
        delete progress.processed[baseGameName(product.nome) || product.id];
        corrected += 1;
        console.log(`  Corrigido: ${replacement.title}`);
      } else {
        product.sem_alternativa_encontrada = true;
        remaining.push({
          ...review,
          sem_alternativa_encontrada: true,
          tentativaQuery: replacement.query,
          revisadoEm: new Date().toISOString()
        });
        withoutAlternative += 1;
        console.log("  Sem alternativa limpa nos 3 primeiros candidatos.");
      }
    } catch (error) {
      errors += 1;
      product.sem_alternativa_encontrada = true;
      remaining.push({
        ...review,
        sem_alternativa_encontrada: true,
        erro: error.message,
        revisadoEm: new Date().toISOString()
      });
      withoutAlternative += 1;
      console.warn(`  Falhou: ${error.message}`);
      if (isQuotaError(error)) break;
    }

    saveJson(file, products);
    saveJson(PROGRESS_FILE, progress);
    saveJson(REVIEW_FILE, remaining);
    await sleep(REQUEST_DELAY_MS);
  }

  saveCatalogs(catalogs);
  saveJson(PROGRESS_FILE, progress);
  saveJson(REVIEW_FILE, remaining);

  console.log("\n[YouTube][Revisao] Correcao concluida.");
  console.log(`Produtos analisados: ${reviews.length}`);
  console.log(`Corrigidos com sucesso: ${corrected}`);
  console.log(`Sem alternativa encontrada: ${withoutAlternative}`);
  console.log(`Erros: ${errors}`);
  console.log(`Produtos ainda em data/${REVIEW_FILE}: ${remaining.length}`);
}

async function main() {
  const platformFiles = Object.values(PLATFORMS).map((platform) => platform.output);
  const catalogs = Object.fromEntries(platformFiles.map((file) => [file, loadJson(file, [])]));
  const groups = prioritizedGroups(groupProducts(catalogs));
  const progress = loadProgress();
  const reviewMap = loadReviewMap();
  let requests = 0;
  let found = 0;
  let notFound = 0;
  let networkErrors = 0;
  let quotaReached = false;

  groups.forEach((group) => {
    const saved = progress.processed[group.key];
    if (saved && Object.prototype.hasOwnProperty.call(saved, "trailer")) {
      setGroupTrailer(group, saved.trailer);
      return;
    }

    const existing = group.items.map(({ product }) => product.trailer).find(validTrailer);
    if (existing) {
      setGroupTrailer(group, existing);
      progress.processed[group.key] = { trailer: existing, status: "found", source: "catalogo" };
    } else if (group.items.every(({ product }) => product.trailer === null)) {
      progress.processed[group.key] = { trailer: null, status: "not-found", source: "catalogo" };
    }
  });

  saveCatalogs(catalogs);
  saveJson(PROGRESS_FILE, progress);

  const validation = await validateExistingTrailers(groups, progress, catalogs, reviewMap);
  const searchesAlreadyUsed = searchesUsedToday(progress);
  const searchLimit = Math.min(REQUEST_LIMIT, Math.max(0, DAILY_SEARCH_LIMIT - searchesAlreadyUsed));

  for (const group of groups) {
    if (requests >= searchLimit) break;
    if (progress.processed[group.key]) continue;

    const name = searchName(group.representative);
    if (!name) continue;

    requests += 1;
    console.log(`[YouTube] ${requests}/${searchLimit}: ${name}`);

    try {
      const result = await findOfficialTrailer(group, name);
      const trailer = result.trailer;
      setGroupTrailer(group, trailer);
      if (result.fallbackUsed) {
        group.items.forEach(({ product, file }) => {
          if (!trailerPlatformConflict(product, file, result.title)) return;
          addReview(reviewMap, makeReviewEntry({
            product,
            file,
            trailer,
            videoId: result.videoId,
            title: result.title,
            channelTitle: result.channelTitle,
            reason: "sem-candidato-limpo-foi-usado-fallback",
            source: "search.list",
            query: result.query
          }));
        });
      }
      progress.processed[group.key] = {
        trailer,
        status: result.status,
        query: result.query,
        videoTitle: result.title || "",
        channelTitle: result.channelTitle || "",
        processedAt: new Date().toISOString()
      };
      if (trailer) found += 1;
      else notFound += 1;
    } catch (error) {
      console.warn(`[YouTube] Falhou "${name}": ${error.message}`);
      networkErrors += 1;
      if (isQuotaError(error)) {
        quotaReached = true;
        break;
      }
    }

    progress.updatedAt = new Date().toISOString();
    saveJson(PROGRESS_FILE, progress);
    saveReviews(reviewMap);
    if (requests % 5 === 0) saveCatalogs(catalogs);
    await sleep(REQUEST_DELAY_MS);
  }

  saveCatalogs(catalogs);
  progress.updatedAt = new Date().toISOString();
  progress.runs.push({
    date: new Date().toISOString(),
    requests,
    found,
    notFound,
    networkErrors,
    validationCalls: validation.calls,
    invalidEmbeds: validation.invalid
  });
  saveJson(PROGRESS_FILE, progress);
  saveReviews(reviewMap);

  console.log("\n[YouTube] Execucao concluida.");
  console.log(`Validacoes de embed: ${validation.valid} validos, ${validation.invalid} rejeitados, ${validation.errors} erro(s)`);
  console.log(`Buscas realizadas nesta execucao: ${requests}/${searchLimit}`);
  console.log(`Buscas usadas hoje: ${searchesAlreadyUsed + requests}/${DAILY_SEARCH_LIMIT}`);
  console.log(`Trailers encontrados: ${found}`);
  console.log(`Sem resultado: ${notFound}`);
  console.log(`Erros de rede: ${networkErrors}`);
  console.log(`Jogos unicos concluidos: ${Object.keys(progress.processed).length}/${groups.length}`);
  console.log(`Produtos em revisao manual de trailer: ${reviewMap.size}`);

  if (quotaReached || searchesAlreadyUsed + requests >= DAILY_SEARCH_LIMIT) {
    console.log(`Limite diario quase atingido. Processados ${searchesAlreadyUsed + requests} jogos hoje. Rode novamente amanha para continuar de onde parou.`);
  }
}

(FIX_REVIEW_MODE ? fixReviewedTrailers() : main()).catch((error) => {
  console.error("[YouTube] Erro inesperado:", error);
  process.exitCode = 1;
});
