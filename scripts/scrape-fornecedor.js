const {
  PLATFORMS,
  cheerio,
  sleep,
  randomDelay,
  getHtml,
  saveJson,
  extractPrices,
  toProductId,
  firstText,
  firstAttr
} = require("./common");
const { isExcludedProduct } = require("./product-exclusions");

const TEST_BATMAN_MODE = process.argv.includes("--test-batman");
const DETAIL_DELAY_MIN_MS = TEST_BATMAN_MODE ? 0 : 150;
const DETAIL_DELAY_MAX_MS = TEST_BATMAN_MODE ? 0 : 350;

function discoverMaxPages($, totalProducts = null) {
  let maxPage = 1;
  $("a[href*='/page/']").each((_, element) => {
    const href = $(element).attr("href") || "";
    const match = href.match(/\/page\/(\d+)/);
    if (match) maxPage = Math.max(maxPage, Number(match[1]));
  });

  const productsOnPage = $(".js-item-product").length;
  if (totalProducts && productsOnPage) {
    maxPage = Math.max(maxPage, Math.ceil(totalProducts / productsOnPage));
  }

  return maxPage;
}

function discoverProductCount($) {
  const bodyText = $("body").text().replace(/\s+/g, " ");
  const match = bodyText.match(/(\d+)\s+produtos?/i);
  return match ? Number(match[1]) : null;
}

function parseProductsFromPage(html, platform, pageUrl) {
  const $ = cheerio.load(html);
  const products = [];
  const seenLinks = new Set();
  const productSelector = ".js-item-product, li.product, .product-small, .product, .product-item";

  $(productSelector).each((_, element) => {
    const root = $(element);
    const variants = parseVariants(root.find("[data-variants]").first().attr("data-variants"));
    const bestVariant = pickBestVariant(variants);
    const link = firstAttr($, root, ["a[title][href]", "a[href*='/produtos/']", "a.woocommerce-LoopProduct-link", "a.product-loop-title", "a[href*='/produto/']", "a"], "href");
    const nome =
      firstText($, root, [".js-item-name", ".item-name", ".woocommerce-loop-product__title", ".product-title", ".name", "h2", "h3", "a[title]"]) ||
      root.find("a[title]").first().attr("title") ||
      bestVariant?.name ||
      "";

    if (!nome || !link || seenLinks.has(link)) return;
    seenLinks.add(link);

    const image = absoluteUrl(
      bestVariant?.image_url ||
      firstAttr($, root, ["img"], "data-src") ||
      firstAttr($, root, ["img"], "data-lazy-src") ||
      firstAttr($, root, ["img"], "data-original") ||
      firstAttr($, root, ["img"], "src") ||
      "",
      pageUrl
    );
    const priceFromAttr = Number(root.find(".js-price-display").first().attr("data-product-price") || 0) / 100;
    const { precoAtualBRL: fallbackAtual, precoOriginalBRL: fallbackOriginal } = extractPrices($, root);
    const precoAtualBRL =
      priceFromAttr ||
      fallbackAtual ||
      Number(bestVariant?.price_number);
    const rawPrecoOriginalBRL =
      fallbackOriginal ||
      Number(bestVariant?.compare_at_price_number) ||
      Number(bestVariant?.price_number) ||
      precoAtualBRL;
    const precoOriginalBRL = rawPrecoOriginalBRL > precoAtualBRL ? rawPrecoOriginalBRL : precoAtualBRL;

    if (!precoAtualBRL) return;

    products.push({
      id: toProductId(nome, platform.key),
      nome,
      precoAtualBRL,
      precoOriginalBRL,
      tipoMidia: "listagem",
      linkFornecedor: new URL(link, pageUrl).href,
      imagemPrincipal: image,
      plataforma: platform.label,
      plataformaKey: platform.key,
      fornecedorProductId: root.attr("data-product-id") || bestVariant?.product_id || ""
    });
  });

  return products;
}

function normalizeMediaType(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseVariants(raw) {
  if (!raw) return [];
  try {
    const variants = JSON.parse(raw);
    return Array.isArray(variants) ? variants : [];
  } catch {
    return [];
  }
}

function visibleVariants(variants) {
  return variants
    .filter((variant) => variant && variant.available !== false && variant.is_visible !== false)
    .filter((variant) => Number(variant.price_number || 0) > 0);
}

function pickPrimaryVariant(variants) {
  const available = visibleVariants(variants);
  return available.find((variant) => {
    const mediaType = normalizeMediaType(variant.option0 || variant.option1 || variant.option2 || variant.name);
    return mediaType.includes("primaria");
  }) || null;
}

function pickBestVariant(variants) {
  return visibleVariants(variants)
    .sort((a, b) => Number(a.price_number || Infinity) - Number(b.price_number || Infinity))[0] ||
    variants[0] ||
    null;
}

function productDetailVariants($) {
  const singleProductVariants = $("#single-product").first().attr("data-variants");
  const parsedFromSingleProduct = parseVariants(singleProductVariants);
  if (parsedFromSingleProduct.length) return parsedFromSingleProduct;

  const scriptText = $("script").toArray()
    .map((element) => $(element).html() || "")
    .find((text) => text.includes("LS.variants ="));
  if (!scriptText) return [];

  const match = scriptText.match(/LS\.variants\s*=\s*(\[[\s\S]*?\]);/);
  return match ? parseVariants(match[1]) : [];
}

function readProductDetailPrice(html) {
  const $ = cheerio.load(html);
  const variants = productDetailVariants($);
  const primaryVariant = pickPrimaryVariant(variants);
  const selectedVariant = primaryVariant || pickBestVariant(variants);
  const { precoAtualBRL: fallbackAtual, precoOriginalBRL: fallbackOriginal } = extractPrices($, $("#single-product").first());
  const precoAtualBRL = Number(selectedVariant?.price_number || 0) || fallbackAtual;
  const rawOriginal =
    Number(selectedVariant?.compare_at_price_number || 0) ||
    fallbackOriginal ||
    precoAtualBRL;
  const precoOriginalBRL = rawOriginal > precoAtualBRL ? rawOriginal : precoAtualBRL;

  if (!precoAtualBRL) return null;
  return {
    precoAtualBRL,
    precoOriginalBRL,
    tipoMidia: primaryVariant ? "Primaria" : variants.length ? "unica" : "unica",
    varianteFornecedorId: selectedVariant?.id || ""
  };
}

async function enrichProductFromDetail(product) {
  const html = await getHtml(product.linkFornecedor);
  const detailPrice = readProductDetailPrice(html);
  if (!detailPrice) return product;

  return {
    ...product,
    ...detailPrice
  };
}

function absoluteUrl(value, baseUrl) {
  if (!value || String(value).startsWith("data:")) return "";
  const normalized = String(value).startsWith("//") ? `https:${value}` : String(value);
  try {
    return new URL(normalized, baseUrl).href;
  } catch {
    return "";
  }
}

async function scrapePlatform(platform) {
  console.log(`\n[Fornecedor] A descobrir paginas: ${platform.label}`);
  const firstHtml = await getHtml(platform.fornecedorUrl);
  const $ = cheerio.load(firstHtml);
  const totalText = discoverProductCount($);
  const maxPages = discoverMaxPages($, totalText);
  console.log(`[Fornecedor] ${platform.label}: ${maxPages} pagina(s) detectada(s)${totalText ? `, ${totalText} produtos no texto` : ""}.`);

  const products = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = page === 1 ? platform.fornecedorUrl : new URL(`page/${page}/`, platform.fornecedorUrl).href;
    try {
      console.log(`[Fornecedor] ${platform.label}: pagina ${page}/${maxPages}`);
      const html = page === 1 ? firstHtml : await getHtml(pageUrl);
      products.push(...parseProductsFromPage(html, platform, pageUrl));
    } catch (error) {
      console.warn(`[Fornecedor] Falhou ${pageUrl}: ${error.message}`);
    }
    if (page < maxPages) await sleep(randomDelay());
  }

  const unique = Array.from(new Map(products.map((item) => [item.id, item])).values())
    .filter((item) => !isExcludedProduct(item));
  const filtered = TEST_BATMAN_MODE
    ? unique.filter((item) => /batman.*arkham.*knight/i.test(item.nome) && ["ps4", "ps5"].includes(item.plataformaKey))
    : unique;
  const enriched = [];

  for (let index = 0; index < filtered.length; index += 1) {
    const product = filtered[index];
    try {
      console.log(`[Fornecedor] ${platform.label}: produto ${index + 1}/${filtered.length} (${product.nome})`);
      enriched.push(await enrichProductFromDetail(product));
    } catch (error) {
      console.warn(`[Fornecedor] Detalhe falhou (${product.nome}): ${error.message}`);
      enriched.push(product);
    }
    if (DETAIL_DELAY_MAX_MS > 0 && index < filtered.length - 1) {
      await sleep(randomDelay(DETAIL_DELAY_MIN_MS, DETAIL_DELAY_MAX_MS));
    }
  }

  console.log(`[Fornecedor] ${platform.label}: ${enriched.length} produto(s) recolhido(s).`);
  return enriched;
}

async function main() {
  const result = {};
  for (const platform of Object.values(PLATFORMS)) {
    try {
      result[platform.key] = await scrapePlatform(platform);
    } catch (error) {
      console.warn(`[Fornecedor] Categoria falhou (${platform.label}): ${error.message}`);
      result[platform.key] = [];
    }
  }

  const total = Object.values(result).reduce((sum, items) => sum + items.length, 0);
  saveJson("raw-fornecedor.json", result);
  console.log(`\n[Fornecedor] Concluido. Total: ${total} produto(s). Ficheiro: data/raw-fornecedor.json`);
}

main().catch((error) => {
  console.error("[Fornecedor] Erro inesperado:", error);
  process.exitCode = 1;
});
