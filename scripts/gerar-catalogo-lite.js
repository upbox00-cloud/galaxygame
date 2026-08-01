const fs = require("node:fs");
const path = require("node:path");

const FILES = {
  ps4: "ps4.json",
  ps5: "ps5.json",
  "xbox-one": "xbox-one.json",
  "xbox-series": "xbox-series.json"
};

const KEEP_FIELDS = [
  "id",
  "nome",
  "plataforma",
  "precoVendaEUR",
  "precoOriginalEUR",
  "released",
  "rating",
  "ratings_count",
  "added",
  "preorder",
  "trailer",
  "imagemFallback",
  "imagemPrincipal",
  "capaSteamGridDB",
  "screenshots",
  "genres",
  "tags",
  "aliasesBusca",
  "destaqueHome",
  "prioridadeCuradoria"
];

function isKnownPreorder(product) {
  return /(^|\s)(ea sports\s*)?fc\s*27(\s|$)/i.test(String(product.nome || product.name || ""));
}

function pickProduct(product, catalogPlatform) {
  const lite = { catalogPlatform };
  KEEP_FIELDS.forEach((field) => {
    if (product[field] !== undefined && product[field] !== null) {
      lite[field] = product[field];
    }
  });
  if (Array.isArray(lite.screenshots)) lite.screenshots = lite.screenshots.slice(0, 1);
  if (Array.isArray(lite.genres)) lite.genres = lite.genres.slice(0, 6);
  if (Array.isArray(lite.tags)) lite.tags = lite.tags.slice(0, 8);
  if (isKnownPreorder(product)) lite.preorder = true;
  return lite;
}

const dataDir = path.resolve(__dirname, "..", "data");
const output = [];

for (const [platformKey, file] of Object.entries(FILES)) {
  const products = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
  if (!Array.isArray(products)) continue;
  products.forEach((product) => output.push(pickProduct(product, platformKey)));
}

fs.writeFileSync(path.join(dataDir, "catalog-lite.json"), `${JSON.stringify(output)}\n`);
console.log(`catalog-lite.json criado com ${output.length} produtos.`);
