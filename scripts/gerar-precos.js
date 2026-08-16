const axios = require("axios");
const fs = require("fs");
const path = require("path");
const {
  PLATFORMS,
  loadJson,
  saveJson,
  roundUpTo99
} = require("./common");
const { isExcludedProduct } = require("./product-exclusions");

const INTERNAL_DIR = path.join(__dirname, ".internal");
const INTERNAL_PRICE_FILE = path.join(INTERNAL_DIR, "catalogo-precos-internos.json");
const EXCHANGE_CACHE_FILE = path.join(INTERNAL_DIR, "cambio-brl-eur.json");
const EXCHANGE_API_URL = "https://open.er-api.com/v6/latest/BRL";
const PRICING_CONFIG = Object.freeze({
  fallbackBrlToEur: 0.155,
  exchangeCacheMaxAgeMs: 24 * 60 * 60 * 1000,
  exchangeSafetyBuffer: 0.04,
  minimumMarkup: 0.22,
  noCompetitorMarkup: 0.25,
  stripePercentageFee: 0.029,
  stripeFixedFeeEUR: 0.25
});

function validStoredTrailer(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function readExchangeCache() {
  try {
    const cached = JSON.parse(fs.readFileSync(EXCHANGE_CACHE_FILE, "utf8"));
    const rate = Number(cached?.baseRate);
    const fetchedAt = Date.parse(cached?.fetchedAt || "");
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(fetchedAt)) return null;
    return { rate, fetchedAt, fetchedAtISO: new Date(fetchedAt).toISOString() };
  } catch {
    return null;
  }
}

function saveExchangeCache(rate) {
  fs.mkdirSync(INTERNAL_DIR, { recursive: true });
  fs.writeFileSync(EXCHANGE_CACHE_FILE, `${JSON.stringify({
    base: "BRL",
    target: "EUR",
    baseRate: rate,
    fetchedAt: new Date().toISOString(),
    source: EXCHANGE_API_URL
  }, null, 2)}\n`, "utf8");
}

function exchangeResult(baseRate, source, fetchedAt = null) {
  return {
    baseRate,
    effectiveRate: baseRate * (1 + PRICING_CONFIG.exchangeSafetyBuffer),
    source,
    fetchedAt
  };
}

async function getExchangeRate(options = {}) {
  const cached = readExchangeCache();
  const cacheIsFresh = cached && Date.now() - cached.fetchedAt < PRICING_CONFIG.exchangeCacheMaxAgeMs;
  if (!options.forceRefresh && cacheIsFresh) {
    console.log(`[Precos] Cambio BRL -> EUR do cache diario: ${cached.rate} (${cached.fetchedAtISO})`);
    return exchangeResult(cached.rate, "cache", cached.fetchedAtISO);
  }

  try {
    const response = await axios.get(EXCHANGE_API_URL, { timeout: 15000 });
    const rate = Number(response.data?.rates?.EUR);
    if (response.data?.result === "success" && Number.isFinite(rate) && rate > 0) {
      saveExchangeCache(rate);
      console.log(`[Precos] Cambio BRL -> EUR obtido pela API: ${rate}`);
      return exchangeResult(rate, "api", new Date().toISOString());
    }
    throw new Error(`resposta invalida: ${response.data?.result || "sem resultado"}`);
  } catch (error) {
    console.warn(`[Precos] API de cambio falhou: ${error.message}`);
  }

  if (cached) {
    console.warn(`[Precos] A usar ultimo cambio valido em cache: ${cached.rate} (${cached.fetchedAtISO})`);
    return exchangeResult(cached.rate, "cache-expirado", cached.fetchedAtISO);
  }

  console.warn(`[Precos] A usar cambio fallback BRL -> EUR: ${PRICING_CONFIG.fallbackBrlToEur}`);
  return exchangeResult(PRICING_CONFIG.fallbackBrlToEur, "fallback");
}

function priceIncludingStripe(targetAfterFees) {
  return (targetAfterFees + PRICING_CONFIG.stripeFixedFeeEUR) / (1 - PRICING_CONFIG.stripePercentageFee);
}

function minimumSalePrice(cost, markup) {
  return roundUpTo99(priceIncludingStripe(cost * (1 + markup)));
}

function makeFinalProduct(product, competitor, rate, previous = null) {
  const custoFornecedorBRL = Number(product.precoAtualBRL || product.custoFornecedorBRL || 0);
  const custoFornecedorEUR = Number((custoFornecedorBRL * rate).toFixed(2));
  const precoMinimoEUR = minimumSalePrice(custoFornecedorEUR, PRICING_CONFIG.minimumMarkup);
  const precoSemConcorrenteEUR = minimumSalePrice(custoFornecedorEUR, PRICING_CONFIG.noCompetitorMarkup);
  const precoConcorrenteEUR = competitor?.sem_referencia ? 0 : Number(competitor?.precoConcorrenteEUR || 0);

  let precoVendaEUR;
  let abaixoDoConcorrente = false;
  let regraPreco;

  if (precoConcorrenteEUR) {
    if (precoConcorrenteEUR >= precoMinimoEUR) {
      precoVendaEUR = roundUpTo99(precoConcorrenteEUR);
      regraPreco = "concorrente";
    } else {
      precoVendaEUR = precoMinimoEUR;
      abaixoDoConcorrente = true;
      regraPreco = "margem-minima";
    }
  } else {
    precoVendaEUR = precoSemConcorrenteEUR;
    regraPreco = "sem-concorrente";
  }

  const precoSeguroEUR = precoMinimoEUR;
  const travaMargemAcionada = custoFornecedorEUR > 0 && precoVendaEUR < precoSeguroEUR;
  if (travaMargemAcionada) {
    console.warn(
      `[Precos][Trava margem] ${product.nome}: custo ${custoFornecedorEUR.toFixed(2)} EUR, venda calculada ${precoVendaEUR.toFixed(2)} EUR, venda corrigida ${precoSeguroEUR.toFixed(2)} EUR.`
    );
    precoVendaEUR = precoSeguroEUR;
    abaixoDoConcorrente = Boolean(precoConcorrenteEUR && precoConcorrenteEUR < precoSeguroEUR);
    regraPreco = "trava-margem";
  }

  const precoOriginalBRL = Number(product.precoOriginalBRL || product.precoAtualBRL || 0);
  const precoOriginalEUR = roundUpTo99(Math.max(precoVendaEUR, precoOriginalBRL * rate));
  const taxaStripeEstimadaEUR = Number(
    (precoVendaEUR * PRICING_CONFIG.stripePercentageFee + PRICING_CONFIG.stripeFixedFeeEUR).toFixed(2)
  );
  const receitaLiquidaEUR = precoVendaEUR - taxaStripeEstimadaEUR;
  const margemReal = custoFornecedorEUR
    ? `${(((receitaLiquidaEUR - custoFornecedorEUR) / custoFornecedorEUR) * 100).toFixed(1)}%`
    : "0%";

  return {
    id: product.id,
    nome: product.nome,
    plataforma: product.plataforma,
    tipoMidia: product.tipoMidia || "unica",
    varianteFornecedorId: product.varianteFornecedorId || "",
    custoFornecedorBRL,
    custoFornecedorEUR,
    precoVendaEUR,
    precoOriginalEUR,
    margemReal,
    taxaStripeEstimadaEUR,
    abaixoDoConcorrente,
    travaMargemAcionada,
    precoConcorrenteEUR,
    regraPreco,
    margemMinimaConfigurada: PRICING_CONFIG.minimumMarkup,
    taxaStripeConsiderada: true,
    trailer: validStoredTrailer(previous?.trailer) ? previous.trailer : previous?.trailer === null ? null : product.trailer || "",
    screenshots: product.screenshots || [],
    descricao: product.descricao || "",
    imagemFallback: product.imagemFallback || product.imagemPrincipal || "",
    released: product.released || null,
    rating: Number(product.rating || 0),
    ratings_count: Number(product.ratings_count || 0),
    added: Number(product.added || 0),
    genres: Array.isArray(product.genres) ? product.genres : [],
    capaSteamGridDB: previous?.capaSteamGridDB || null,
    steamGridMatchValidated: Boolean(previous?.steamGridMatchValidated),
    steamGridMatchedName: previous?.steamGridMatchedName || null,
    steamGridMatchScore: Number(previous?.steamGridMatchScore || 0),
    linkFornecedor: product.linkFornecedor || "",
    enriquecido: Boolean(product.enriquecido)
  };
}

function makePublicProduct(product) {
  const {
    custoFornecedorBRL,
    custoFornecedorEUR,
    margemReal,
    taxaStripeEstimadaEUR,
    abaixoDoConcorrente,
    travaMargemAcionada,
    precoConcorrenteEUR,
    regraPreco,
    margemMinimaConfigurada,
    taxaStripeConsiderada,
    ...publicProduct
  } = product;

  return publicProduct;
}

function saveInternalPrices(grouped) {
  fs.mkdirSync(INTERNAL_DIR, { recursive: true });
  const allProducts = Object.values(grouped).flat();
  fs.writeFileSync(INTERNAL_PRICE_FILE, `${JSON.stringify(allProducts, null, 2)}\n`, "utf8");
  console.log(`[Precos] Catalogo interno de margem gravado em scripts/.internal/catalogo-precos-internos.json`);
}

function readCliOptions(argv = process.argv.slice(2)) {
  const sampleOption = argv.find((item) => item.startsWith("--sample="));
  const sampleSize = Number.parseInt(sampleOption?.split("=")[1] || "15", 10);
  return {
    dryRun: argv.includes("--dry-run"),
    forceExchangeRefresh: argv.includes("--refresh-exchange"),
    sampleSize: Number.isFinite(sampleSize) ? Math.min(Math.max(sampleSize, 1), 50) : 15
  };
}

function showPricePreview(products, previousCatalogById, sampleSize) {
  const allRows = products
    .map((product) => ({
      id: product.id,
      jogo: product.nome,
      plataforma: product.plataforma,
      custo: product.custoFornecedorEUR,
      antigo: Number(previousCatalogById.get(product.id)?.precoVendaEUR || 0),
      novo: product.precoVendaEUR,
      concorrente: product.precoConcorrenteEUR || "-",
      regra: product.regraPreco,
      diferenca: Number((product.precoVendaEUR - Number(previousCatalogById.get(product.id)?.precoVendaEUR || 0)).toFixed(2))
    }));

  const changed = allRows.filter((row) => row.antigo !== row.novo);
  const godOfWar = changed.find((row) => row.id === "god-of-war-ragnarok-ps5");
  const increases = changed.filter((row) => row.diferenca > 0).sort((a, b) => b.diferenca - a.diferenca);
  const decreases = changed.filter((row) => row.diferenca < 0).sort((a, b) => a.diferenca - b.diferenca);
  const rows = [];
  if (godOfWar) rows.push(godOfWar);
  const addUnique = (row) => {
    if (row && !rows.some((current) => current.id === row.id) && rows.length < sampleSize) rows.push(row);
  };
  increases.slice(0, Math.ceil((sampleSize - rows.length) / 2)).forEach(addUnique);
  decreases.forEach(addUnique);
  increases.forEach(addUnique);

  console.log("\n[Impacto global]");
  console.log(`Precos reduzidos: ${decreases.length}`);
  console.log(`Precos aumentados: ${increases.length}`);
  console.log(`Precos inalterados: ${allRows.length - changed.length}`);
  console.log(`\n[Pre-visualizacao] ${rows.length} alteracoes (catalogo nao gravado)`);
  console.table(rows);
}

async function main(options = readCliOptions()) {
  const products = loadJson("enriquecido.json", []);
  const competitors = loadJson("concorrente.json", []);
  const competitorMap = new Map(competitors.map((item) => [item.id, item]));
  const previousCatalog = Object.values(PLATFORMS)
    .flatMap((platform) => loadJson(platform.output, []));
  const previousCatalogById = new Map(previousCatalog.map((item) => [item.id, item]));
  const exchange = await getExchangeRate({ forceRefresh: options.forceExchangeRefresh });
  const rate = exchange.effectiveRate;
  console.log(
    `[Precos] Cambio base ${exchange.baseRate.toFixed(6)} + buffer ${(PRICING_CONFIG.exchangeSafetyBuffer * 100).toFixed(0)}% = ${rate.toFixed(6)} BRL -> EUR.`
  );

  const grouped = Object.fromEntries(Object.keys(PLATFORMS).map((key) => [key, []]));
  let belowCompetitor = 0;
  let safetyLocked = 0;

  const sellableProducts = products.filter((product) => !isExcludedProduct(product));
  const removedProducts = products.length - sellableProducts.length;
  if (removedProducts) {
    console.log(`[Precos] ${removedProducts} produto(s) bloqueado(s) removido(s) antes da precificacao.`);
  }

  sellableProducts.forEach((product, index) => {
    if (!options.dryRun) console.log(`[Precos] Processando ${index + 1}/${sellableProducts.length}: ${product.nome}`);
    const finalProduct = makeFinalProduct(product, competitorMap.get(product.id), rate, previousCatalogById.get(product.id));
    if (finalProduct.abaixoDoConcorrente) belowCompetitor += 1;
    if (finalProduct.travaMargemAcionada) safetyLocked += 1;
    grouped[product.plataformaKey || "ps5"]?.push(finalProduct);
  });

  if (options.dryRun) {
    showPricePreview(Object.values(grouped).flat(), previousCatalogById, options.sampleSize);
  } else {
    Object.values(PLATFORMS).forEach((platform) => {
      saveJson(platform.output, (grouped[platform.key] || []).map(makePublicProduct));
      console.log(`[Precos] Gravado data/${platform.output}: ${(grouped[platform.key] || []).length} produto(s).`);
    });
    saveInternalPrices(grouped);
  }

  const enrichedCount = sellableProducts.filter((item) => item.enriquecido).length;
  console.log("\n[Resumo]");
  console.log(`Total de produtos processados: ${sellableProducts.length}`);
  console.log(`Produtos bloqueados removidos: ${removedProducts}`);
  console.log(`Enriquecidos com sucesso pela RAWG: ${enrichedCount}`);
  console.log(`Abaixo do concorrente para revisao manual: ${belowCompetitor}`);
  console.log(`Salvos pela trava de margem: ${safetyLocked}`);
  if (options.dryRun) console.log("Modo de simulacao: nenhum preco do catalogo foi alterado.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[Precos] Erro inesperado:", error);
    process.exitCode = 1;
  });
}

module.exports._test = {
  PRICING_CONFIG,
  exchangeResult,
  priceIncludingStripe,
  minimumSalePrice,
  makeFinalProduct,
  readCliOptions
};
