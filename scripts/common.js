const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const DATA_DIR = path.join(__dirname, "..", "data");

const PLATFORMS = {
  ps4: {
    key: "ps4",
    label: "PlayStation 4",
    short: "PS4",
    fornecedorUrl: "https://www.alphagames.com.br/playstation-4/",
    output: "ps4.json"
  },
  ps5: {
    key: "ps5",
    label: "PlayStation 5",
    short: "PS5",
    fornecedorUrl: "https://www.alphagames.com.br/playstation-5/",
    output: "ps5.json"
  },
  "xbox-one": {
    key: "xbox-one",
    label: "Xbox One",
    short: "Xbox One",
    fornecedorUrl: "https://www.alphagames.com.br/xbox-one/",
    output: "xbox-one.json"
  },
  "xbox-series": {
    key: "xbox-series",
    label: "Xbox Series X|S",
    short: "Xbox Series X|S",
    fornecedorUrl: "https://www.alphagames.com.br/xbox-series-s-x/",
    output: "xbox-series.json"
  }
};

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min = 1000, max = 2000) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

async function getHtml(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await axios.get(url, {
        timeout: 25000,
        proxy: false,
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
      return response.data;
    } catch (error) {
      lastError = error;
      const status = Number(error.response?.status || 0);
      const retryable = !status || status === 429 || status >= 500;
      if (!retryable || attempt === attempts) break;
      await sleep(600 * attempt);
    }
  }
  throw lastError;
}

function loadJson(file, fallback = null) {
  const fullPath = path.join(DATA_DIR, file);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function saveJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(path.join(DATA_DIR, file), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  const raw = String(value)
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(,|$))/g, "")
    .replace(",", ".");
  const number = Number.parseFloat(raw);
  return Number.isFinite(number) ? number : 0;
}

function extractPrices($, root) {
  const priceText = root.find(".price").first().text() || root.text();
  const oldText = root.find("del .amount, del bdi, del").first().text();
  const currentText =
    root.find("ins .amount, ins bdi, ins").first().text() ||
    root.find(".woocommerce-Price-amount, .amount, bdi").last().text() ||
    priceText;

  return {
    precoAtualBRL: parseMoney(currentText),
    precoOriginalBRL: parseMoney(oldText) || parseMoney(currentText)
  };
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function normalizeName(value) {
  return String(value || "")
    .replace(/\bxbox\s+one\s*&\s*(xbox\s+)?series\s+(s\/x|x\/s|x\|s)\b/gi, "")
    .replace(/\bxbox\s+series\s+(s\/x|x\/s|x\|s)\b/gi, "")
    .replace(/\bseries\s+(s\/x|x\/s|x\|s)\b/gi, "")
    .replace(/\b(s\/x|x\/s|x\|s)\b/gi, "")
    .replace(/\b(ps4|ps5|playstation 4|playstation 5|xbox one|xbox series x\|s|xbox series|midia digital|mídia digital|codigo digital|código digital|premium|low cost)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGameTitle(value) {
  return normalizeName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(edicao|edition|standard|deluxe|ultimate|premium|midia|media|digital|codigo|conteudo)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(first, second) {
  const a = String(first || "");
  const b = String(second || "");
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function gameNameMatch(requestedName, candidateName) {
  const requested = normalizeGameTitle(requestedName);
  const candidate = normalizeGameTitle(candidateName);
  if (!requested || !candidate) return { accepted: false, score: 0, requested, candidate };
  if (requested === candidate) return { accepted: true, score: 1, requested, candidate };

  const requestedTokens = new Set(requested.split(" "));
  const candidateTokens = new Set(candidate.split(" "));
  const intersection = [...requestedTokens].filter((token) => candidateTokens.has(token)).length;
  const union = new Set([...requestedTokens, ...candidateTokens]).size || 1;
  const jaccard = intersection / union;
  const coverage = intersection / (requestedTokens.size || 1);
  const editSimilarity = 1 - levenshteinDistance(requested, candidate) / Math.max(requested.length, candidate.length, 1);
  const score = Number((editSimilarity * 0.6 + jaccard * 0.4).toFixed(3));
  const protectedWords = ["remastered", "remaster", "remake"];
  const missingProtectedWord = protectedWords.some((word) => requestedTokens.has(word) && !candidateTokens.has(word));
  const accepted = !missingProtectedWord && score >= 0.68 && coverage >= 0.9 && jaccard >= 0.55;

  return { accepted, score, requested, candidate, coverage, jaccard, editSimilarity };
}

function toProductId(nome, platformKey) {
  return `${slugify(normalizeName(nome))}-${platformKey}`;
}

function platformMatches(text, platform) {
  const haystack = String(text || "").toLowerCase();
  if (platform.key === "ps4") return /ps4|playstation 4/.test(haystack);
  if (platform.key === "ps5") return /ps5|playstation 5/.test(haystack);
  if (platform.key === "xbox-one") return /xbox one/.test(haystack);
  if (platform.key === "xbox-series") return /xbox series|series s|series x|x\/s/.test(haystack);
  return false;
}

function flattenRawFornecedor(raw) {
  return Object.values(raw || {}).flatMap((items) => (Array.isArray(items) ? items : []));
}

function roundUpTo99(value) {
  if (!Number.isFinite(value) || value <= 0) return 0.99;
  const cents = Math.ceil(value * 100);
  const euros = Math.floor(cents / 100);
  const candidate = euros + 0.99;
  return Number((candidate < value ? euros + 1.99 : candidate).toFixed(2));
}

function firstText($, root, selectors) {
  for (const selector of selectors) {
    const text = root.find(selector).first().text().trim();
    if (text) return text;
  }
  return "";
}

function firstAttr($, root, selectors, attr) {
  for (const selector of selectors) {
    const value = root.find(selector).first().attr(attr);
    if (value) return value;
  }
  return "";
}

module.exports = {
  DATA_DIR,
  PLATFORMS,
  cheerio,
  ensureDataDir,
  sleep,
  randomDelay,
  getHtml,
  loadJson,
  saveJson,
  parseMoney,
  extractPrices,
  slugify,
  normalizeName,
  normalizeGameTitle,
  gameNameMatch,
  toProductId,
  platformMatches,
  flattenRawFornecedor,
  roundUpTo99,
  firstText,
  firstAttr
};
