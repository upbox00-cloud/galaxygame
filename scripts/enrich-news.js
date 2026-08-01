const fs = require("fs/promises");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const ROOT = path.resolve(__dirname, "..");
const CATALOG_FILES = ["ps4.json", "ps5.json", "xbox-one.json", "xbox-series.json"];
const OUTPUT_FILE = path.join(ROOT, "data", "noticias-jogos.json");
const GAME_LIMIT = Math.max(1, Number(process.env.NEWS_GAME_LIMIT || 50));
const ARTICLES_PER_GAME = 6;
const REQUEST_DELAY_MS = 250;

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanGameName(value) {
  return String(value || "")
    .replace(/\s*-?\s*(m[ií]dia|media)\s+digital\s*$/i, "")
    .replace(/\s*-\s*(playstation\s*[45]|ps[45]|xbox\s+one.*|xbox\s+series.*)$/i, "")
    .replace(/\s+(playstation\s*[45]|ps[45]|xbox\s+one.*|xbox\s+series.*)$/i, "")
    .replace(/\s+-\s*$/, "")
    .trim();
}

function popularity(product) {
  return Math.max(Number(product.added || 0), Number(product.ratings_count || 0));
}

function stripHtml(value) {
  return cheerio.load(String(value || "")).text().replace(/\s+/g, " ").trim();
}

function parseFeed(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("item")
    .slice(0, ARTICLES_PER_GAME)
    .map((_, item) => {
      const node = $(item);
      return {
        title: node.find("title").first().text().trim(),
        link: node.find("link").first().text().trim(),
        pubDate: node.find("pubDate").first().text().trim(),
        description: stripHtml(node.find("description").first().text())
      };
    })
    .get()
    .filter((item) => item.title && item.link);
}

function feedUrl(gameName) {
  const query = `"${gameName}" videojogo OR game`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-PT&gl=PT&ceid=PT:pt-150`;
}

async function loadProducts() {
  const catalogs = await Promise.all(
    CATALOG_FILES.map(async (file) => JSON.parse(await fs.readFile(path.join(ROOT, "data", file), "utf8")))
  );
  return catalogs.flat();
}

async function loadExistingCache() {
  try {
    return JSON.parse(await fs.readFile(OUTPUT_FILE, "utf8"));
  } catch {
    return { generatedAt: null, games: {} };
  }
}

async function saveCache(cache) {
  cache.generatedAt = new Date().toISOString();
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const products = await loadProducts();
  const uniqueGames = new Map();

  products.forEach((product) => {
    const name = cleanGameName(product.nome);
    const key = normalizeKey(name);
    const current = uniqueGames.get(key);
    if (key && (!current || popularity(product) > popularity(current.product))) {
      uniqueGames.set(key, { name, product });
    }
  });

  const priorityGames = [...uniqueGames.entries()]
    .sort(([, first], [, second]) => popularity(second.product) - popularity(first.product))
    .slice(0, GAME_LIMIT);
  const cache = await loadExistingCache();
  cache.games ||= {};
  let completed = 0;
  let found = 0;

  for (const [key, game] of priorityGames) {
    completed += 1;
    if (Array.isArray(cache.games[key]?.items) && cache.games[key].items.length) {
      found += 1;
      console.log(`[${completed}/${priorityGames.length}] ${game.name}: cache existente`);
      continue;
    }

    try {
      const response = await axios.get(feedUrl(game.name), {
        timeout: 20000,
        responseType: "text",
        headers: { "User-Agent": "GalaxyGameCatalog/1.0" }
      });
      const items = parseFeed(response.data);
      cache.games[key] = { name: game.name, popularity: popularity(game.product), items };
      if (items.length) found += 1;
      console.log(`[${completed}/${priorityGames.length}] ${game.name}: ${items.length} noticia(s)`);
    } catch (error) {
      console.warn(`[${completed}/${priorityGames.length}] ${game.name}: ${error.message}`);
    }

    if (completed % 5 === 0) await saveCache(cache);
    await wait(REQUEST_DELAY_MS);
  }

  await saveCache(cache);
  console.log(`Concluido: ${completed} jogos processados, ${found} com noticias em cache.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
