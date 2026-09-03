const {
  PLATFORMS,
  cheerio,
  sleep,
  randomDelay,
  getHtml,
  loadJson,
  saveJson,
  parseMoney,
  normalizeName,
  platformMatches
} = require("./common");

const MAX_NEW_LOOKUPS = Math.max(0, Number(process.env.COMPETITOR_MAX_LOOKUPS || 80));

function referenceKey(product) {
  return `${product.plataforma || product.plataformaKey || ""}:${normalizeName(product.nome).toLowerCase()}`;
}

function scoreCandidate(product, candidateName, platform) {
  const base = normalizeName(product.nome).toLowerCase();
  const candidate = normalizeName(candidateName).toLowerCase();
  const baseTokens = base.split(/\s+/).filter((token) => token.length > 2);
  const hits = baseTokens.filter((token) => candidate.includes(token)).length;
  const platformScore = platformMatches(candidateName, platform) ? 3 : 0;
  return hits + platformScore;
}

function extractCandidates(html, product) {
  const $ = cheerio.load(html);
  const platform = PLATFORMS[product.plataformaKey];
  const candidates = [];

  $(".product, li.product, .dgwt-wcas-product, article, .type-product").each((_, element) => {
    const root = $(element);
    const name =
      root.find(".woocommerce-loop-product__title, .product-title, .dgwt-wcas-st-title, h2, h3, a").first().text().trim() ||
      root.find("a").first().attr("title") ||
      "";
    const priceText = root.find(".price ins .amount, ins bdi, .price .amount, .amount, bdi").last().text() || root.text();
    const price = parseMoney(priceText);
    if (!name || !price) return;

    candidates.push({
      nomeConcorrente: name,
      precoConcorrenteEUR: price,
      score: scoreCandidate(product, name, platform)
    });
  });

  return candidates
    .filter((item) => item.score >= 2)
    .sort((a, b) => a.precoConcorrenteEUR - b.precoConcorrenteEUR || b.score - a.score);
}

async function main() {
  const products = loadJson("enriquecido.json", []);
  const previous = loadJson("concorrente.json", []);
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const previousByReference = new Map(previous
    .filter((item) => !item.pendente)
    .map((item) => [referenceKey(item), item]));
  const result = [];
  let lookups = 0;

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const cached = previousById.get(product.id) || previousByReference.get(referenceKey(product));
    if (cached && !cached.pendente) {
      result.push({ ...cached, id: product.id, nome: product.nome, plataforma: product.plataforma });
      continue;
    }
    if (lookups >= MAX_NEW_LOOKUPS) {
      result.push({
        id: product.id,
        nome: product.nome,
        plataforma: product.plataforma,
        plataformaKey: product.plataformaKey,
        sem_referencia: true,
        pendente: true,
        precoConcorrenteEUR: 0,
        nomeConcorrente: ""
      });
      continue;
    }

    lookups += 1;
    const query = encodeURIComponent(normalizeName(product.nome));
    const url = `https://www.jogodigital.com/?s=${query}&post_type=product&dgwt_wcas=1`;
    console.log(`[Concorrente] Processando ${index + 1}/${products.length}: ${product.nome}`);

    try {
      const html = await getHtml(url);
      const candidates = extractCandidates(html, product);
      const best = candidates[0];
      result.push({
        id: product.id,
        nome: product.nome,
        plataforma: product.plataforma,
        plataformaKey: product.plataformaKey,
        sem_referencia: !best,
        pendente: false,
        consultadoEm: new Date().toISOString(),
        precoConcorrenteEUR: best?.precoConcorrenteEUR || 0,
        nomeConcorrente: best?.nomeConcorrente || "",
        candidatos: candidates.slice(0, 3)
      });
    } catch (error) {
      console.warn(`[Concorrente] Falhou "${product.nome}": ${error.message}`);
      result.push({
        id: product.id,
        nome: product.nome,
        plataforma: product.plataforma,
        plataformaKey: product.plataformaKey,
        sem_referencia: true,
        pendente: true,
        precoConcorrenteEUR: 0,
        nomeConcorrente: "",
        erro: error.message
      });
    }

    await sleep(randomDelay());
  }

  const found = result.filter((item) => !item.sem_referencia).length;
  saveJson("concorrente.json", result);
  const pending = result.filter((item) => item.pendente).length;
  console.log(`\n[Concorrente] Concluido. ${lookups} nova(s) consulta(s), ${found} referencia(s), ${pending} pendente(s).`);
}

main().catch((error) => {
  console.error("[Concorrente] Erro inesperado:", error);
  process.exitCode = 1;
});
