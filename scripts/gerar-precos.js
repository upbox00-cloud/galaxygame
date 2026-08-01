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

const FALLBACK_BRL_TO_EUR = 0.155;
const INTERNAL_DIR = path.join(__dirname, ".internal");
const INTERNAL_PRICE_FILE = path.join(INTERNAL_DIR, "catalogo-precos-internos.json");

function validStoredTrailer(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function getExchangeRate() {
  try {
    const response = await axios.get("https://api.exchangerate-api.com/v4/latest/BRL", { timeout: 15000 });
    const rate = Number(response.data?.rates?.EUR);
    if (Number.isFinite(rate) && rate > 0) {
      console.log(`[Precos] Cambio BRL -> EUR obtido pela API: ${rate}`);
      return rate;
    }
  } catch (error) {
    console.warn(`[Precos] API de cambio falhou: ${error.message}`);
  }
  console.log(`[Precos] A usar cambio fallback BRL -> EUR: ${FALLBACK_BRL_TO_EUR}`);
  return FALLBACK_BRL_TO_EUR;
}

function makeFinalProduct(product, competitor, rate, previous = null) {
  const custoFornecedorBRL = Number(product.precoAtualBRL || product.custoFornecedorBRL || 0);
  const custoFornecedorEUR = Number((custoFornecedorBRL * rate).toFixed(2));
  const margemMinima = custoFornecedorEUR * 1.25;
  const precoConcorrenteEUR = competitor?.sem_referencia ? 0 : Number(competitor?.precoConcorrenteEUR || 0);

  let precoVendaEUR;
  let abaixoDoConcorrente = false;

  if (precoConcorrenteEUR) {
    if (precoConcorrenteEUR >= margemMinima) {
      precoVendaEUR = roundUpTo99(precoConcorrenteEUR);
    } else {
      precoVendaEUR = roundUpTo99(margemMinima);
      abaixoDoConcorrente = true;
    }
  } else {
    precoVendaEUR = roundUpTo99(custoFornecedorEUR * 1.5);
  }

  const precoSeguroEUR = roundUpTo99(margemMinima);
  const travaMargemAcionada = custoFornecedorEUR > 0 && precoVendaEUR < precoSeguroEUR;
  if (travaMargemAcionada) {
    console.warn(
      `[Precos][Trava margem] ${product.nome}: custo ${custoFornecedorEUR.toFixed(2)} EUR, venda calculada ${precoVendaEUR.toFixed(2)} EUR, venda corrigida ${precoSeguroEUR.toFixed(2)} EUR.`
    );
    precoVendaEUR = precoSeguroEUR;
    abaixoDoConcorrente = Boolean(precoConcorrenteEUR && precoConcorrenteEUR < precoSeguroEUR);
  }

  const precoOriginalBRL = Number(product.precoOriginalBRL || product.precoAtualBRL || 0);
  const precoOriginalEUR = roundUpTo99(Math.max(precoVendaEUR, precoOriginalBRL * rate));
  const margemReal = custoFornecedorEUR
    ? `${(((precoVendaEUR - custoFornecedorEUR) / custoFornecedorEUR) * 100).toFixed(1)}%`
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
    abaixoDoConcorrente,
    travaMargemAcionada,
    precoConcorrenteEUR,
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
    abaixoDoConcorrente,
    travaMargemAcionada,
    precoConcorrenteEUR,
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

async function main() {
  const products = loadJson("enriquecido.json", []);
  const competitors = loadJson("concorrente.json", []);
  const competitorMap = new Map(competitors.map((item) => [item.id, item]));
  const previousCatalog = Object.values(PLATFORMS)
    .flatMap((platform) => loadJson(platform.output, []));
  const previousCatalogById = new Map(previousCatalog.map((item) => [item.id, item]));
  const rate = await getExchangeRate();

  const grouped = Object.fromEntries(Object.keys(PLATFORMS).map((key) => [key, []]));
  let belowCompetitor = 0;
  let safetyLocked = 0;

  const sellableProducts = products.filter((product) => !isExcludedProduct(product));
  const removedProducts = products.length - sellableProducts.length;
  if (removedProducts) {
    console.log(`[Precos] ${removedProducts} produto(s) bloqueado(s) removido(s) antes da precificacao.`);
  }

  sellableProducts.forEach((product, index) => {
    console.log(`[Precos] Processando ${index + 1}/${sellableProducts.length}: ${product.nome}`);
    const finalProduct = makeFinalProduct(product, competitorMap.get(product.id), rate, previousCatalogById.get(product.id));
    if (finalProduct.abaixoDoConcorrente) belowCompetitor += 1;
    if (finalProduct.travaMargemAcionada) safetyLocked += 1;
    grouped[product.plataformaKey || "ps5"]?.push(finalProduct);
  });

  Object.values(PLATFORMS).forEach((platform) => {
    saveJson(platform.output, (grouped[platform.key] || []).map(makePublicProduct));
    console.log(`[Precos] Gravado data/${platform.output}: ${(grouped[platform.key] || []).length} produto(s).`);
  });
  saveInternalPrices(grouped);

  const enrichedCount = sellableProducts.filter((item) => item.enriquecido).length;
  console.log("\n[Resumo]");
  console.log(`Total de produtos processados: ${sellableProducts.length}`);
  console.log(`Produtos bloqueados removidos: ${removedProducts}`);
  console.log(`Enriquecidos com sucesso pela RAWG: ${enrichedCount}`);
  console.log(`Abaixo do concorrente para revisao manual: ${belowCompetitor}`);
  console.log(`Salvos pela trava de margem: ${safetyLocked}`);
}

main().catch((error) => {
  console.error("[Precos] Erro inesperado:", error);
  process.exitCode = 1;
});
