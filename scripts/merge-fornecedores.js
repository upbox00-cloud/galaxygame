const {
  PLATFORMS,
  gameNameMatch,
  loadJson,
  saveJson
} = require("./common");

function supplierNameKey(value) {
  const roman = new Map([
    ["i", "1"], ["ii", "2"], ["iii", "3"], ["iv", "4"], ["v", "5"],
    ["vi", "6"], ["vii", "7"], ["viii", "8"], ["ix", "9"], ["x", "10"],
    ["xi", "11"], ["xii", "12"], ["xiii", "13"], ["xiv", "14"], ["xv", "15"]
  ]);
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bxbox\s+one\s*&\s*(xbox\s+)?series\s+(s\/x|x\/s|x\|s)\b/g, " ")
    .replace(/\bxbox\s+series\s+(s\/x|x\/s|x\|s)\b/g, " ")
    .replace(/\bseries\s+(s\/x|x\/s|x\|s)\b/g, " ")
    .replace(/\b(ps4|ps5|playstation 4|playstation 5|xbox one|xbox series|midia digital|media digital|codigo digital|conteudo digital|low cost)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^ea sports\s+/, "")
    .replace(/^tom clancy s\s+/, "")
    .replace(/^gta\s+/, "grand theft auto ")
    .replace(/directo s/g, "director s")
    .replace(/nitro fuled/g, "nitro fueled")
    .replace(/survival envolved/g, "survival evolved")
    .replace(/fighter z/g, "fighterz")
    .replace(/resident evil 8 village/g, "resident evil village")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized.split(" ").map((token) => roman.get(token) || token);
  return tokens.filter((token, index) => token !== tokens[index - 1]).join(" ");
}

function numericTokens(value) {
  return supplierNameKey(value).match(/\b\d+\b/g) || [];
}

function sameNumbers(first, second) {
  return numericTokens(first).join(",") === numericTokens(second).join(",");
}

function editionMarkers(value) {
  const protectedEditions = new Set([
    "deluxe", "ultimate", "premium", "gold", "complete", "collector", "anniversary",
    "remake", "remaster", "remastered", "goty", "definitive"
  ]);
  return supplierNameKey(value)
    .split(" ")
    .filter((token) => protectedEditions.has(token))
    .sort()
    .join(",");
}

function supplierMatchScore(first, second) {
  const firstKey = supplierNameKey(first);
  const secondKey = supplierNameKey(second);
  if (!firstKey || !secondKey || !sameNumbers(first, second)) return 0;
  if (editionMarkers(first) !== editionMarkers(second)) return 0;
  if (firstKey === secondKey) return 1;
  const forward = gameNameMatch(firstKey, secondKey);
  const reverse = gameNameMatch(secondKey, firstKey);
  const score = Math.min(forward.score, reverse.score);
  if (forward.accepted && reverse.accepted && score >= 0.82) return score;
  return 0;
}

function supplierRecord(product, fallbackId, fallbackName) {
  return {
    id: product.fornecedorId || fallbackId,
    nome: product.fornecedorNome || fallbackName,
    custoPixBRL: Number(product.precoPixBRL || product.precoAtualBRL || 0),
    custoSemPixBRL: Number(product.precoSemPixBRL || product.precoAtualBRL || 0),
    url: product.linkFornecedor || ""
  };
}

function attachSupplier(product, supplier) {
  const fornecedores = Array.isArray(product.fornecedores) ? [...product.fornecedores] : [];
  const index = fornecedores.findIndex((item) => item.id === supplier.id);
  if (index >= 0) fornecedores[index] = supplier;
  else fornecedores.push(supplier);
  return { ...product, fornecedores };
}

function findMatch(products, candidate) {
  let best = null;
  for (const product of products) {
    const score = supplierMatchScore(product.nome, candidate.nome);
    if (score > 0 && (!best || score > best.score)) best = { product, score };
  }
  return best?.product || null;
}

function mergePlatform(alphaProducts = [], tcaProducts = []) {
  const merged = alphaProducts.map((product) => attachSupplier(
    product,
    supplierRecord(product, "alpha", "Alpha Games")
  ));

  for (const tcaProduct of tcaProducts) {
    const supplier = supplierRecord(tcaProduct, "tca", "TCA Games");
    const match = findMatch(merged, tcaProduct);
    if (match) {
      const index = merged.indexOf(match);
      merged[index] = attachSupplier(match, supplier);
    } else {
      merged.push(attachSupplier(tcaProduct, supplier));
    }
  }
  return merged;
}

function isCompatibleWithPlatform(product, platformKey) {
  const text = String(product?.nome || "").toLowerCase();
  const hasPs4 = /\bps4\b|playstation\s*4/.test(text);
  const hasPs5 = /\bps5\b|playstation\s*5/.test(text);
  const hasXboxOne = /xbox\s*one/.test(text);
  const hasXboxSeries = /xbox\s*series|series\s*[xs]|\bx\/?s\b|\bs\/?x\b/.test(text);
  if (platformKey === "ps4") return !hasPs5 || hasPs4;
  if (platformKey === "ps5") return !hasPs4 || hasPs5;
  if (platformKey === "xbox-one") return !hasXboxSeries || hasXboxOne;
  if (platformKey === "xbox-series") return !hasXboxOne || hasXboxSeries;
  return true;
}

function mergeCatalogs(alpha, tca) {
  return Object.fromEntries(Object.keys(PLATFORMS).map((key) => [
    key,
    mergePlatform(
      (alpha?.[key] || []).filter((product) => isCompatibleWithPlatform(product, key)),
      (tca?.[key] || []).filter((product) => isCompatibleWithPlatform(product, key))
    )
  ]));
}

function main() {
  const alpha = loadJson("raw-alpha.json", null);
  const tca = loadJson("raw-tca.json", null);
  if (!alpha || !tca) throw new Error("Catalogos raw-alpha.json e raw-tca.json sao obrigatorios");
  const merged = mergeCatalogs(alpha, tca);
  const total = Object.values(merged).reduce((sum, items) => sum + items.length, 0);
  if (total < 100) throw new Error(`Merge recusado por conter apenas ${total} produtos`);
  saveJson("raw-fornecedor.json", merged);
  Object.entries(merged).forEach(([key, items]) => {
    const dual = items.filter((item) => item.fornecedores?.length > 1).length;
    console.log(`[Fornecedores] ${key}: ${items.length} produto(s), ${dual} com dois fornecedores.`);
  });
  console.log(`[Fornecedores] Merge concluido: ${total} produto(s).`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[Fornecedores] Falha: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports._test = {
  supplierNameKey,
  supplierMatchScore,
  supplierRecord,
  isCompatibleWithPlatform,
  mergePlatform,
  mergeCatalogs
};
