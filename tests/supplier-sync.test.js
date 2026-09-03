const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const tca = require("../scripts/scrape-tca")._test;
const merge = require("../scripts/merge-fornecedores")._test;
const { validateCatalogUpdate } = require("../scripts/validate-catalog-update");

function tcaProduct(overrides = {}) {
  return {
    id: 123,
    title: "FC 26 - PS5 Mídia Digital",
    handle: "fc-26-ps5",
    tags: ["PRIMÁRIA PS5"],
    variants: [
      { id: 1, title: "Secundária", price: "39.90", available: true },
      { id: 2, title: "Primária", price: "49.90", available: true }
    ],
    images: [{ src: "https://cdn.shopify.com/fc26.jpg" }],
    ...overrides
  };
}

test("TCA escolhe a variante primaria e aplica o desconto Pix anunciado", () => {
  const product = tca.mapProduct(tcaProduct(), "ps5");
  assert.equal(product.precoSemPixBRL, 49.9);
  assert.equal(product.precoPixBRL, 47.4);
  assert.equal(product.tipoMidia, "Primaria");
  assert.equal(product.linkFornecedor, "https://www.lojatcagames.com.br/products/fc-26-ps5");
});

test("TCA não confunde um jogo PS4 compatível com PS5 com uma edição PS5", () => {
  assert.deepEqual(tca.detectPlatformKeys(tcaProduct({
    title: "eFootball PES 21 PS4 p/ PS5",
    tags: []
  })), ["ps4"]);
});

test("merge rejeita produtos colocados na categoria errada pelo fornecedor", () => {
  assert.equal(merge.isCompatibleWithPlatform({ nome: "Sniper Contracts 2 - PS5" }, "ps4"), false);
  assert.equal(merge.isCompatibleWithPlatform({ nome: "Jogo PS4 e PS5" }, "ps4"), true);
});

test("merge une nomes equivalentes e mantém os dois fornecedores", () => {
  const alpha = [{
    id: "ea-sports-fc-26-ps5",
    nome: "EA SPORTS FC 26 - PS5 - MÍDIA DIGITAL",
    plataformaKey: "ps5",
    precoPixBRL: 89.9,
    precoSemPixBRL: 99.9,
    linkFornecedor: "https://www.alphagames.com.br/fc-26"
  }];
  const merged = merge.mergePlatform(alpha, [tca.mapProduct(tcaProduct(), "ps5")]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].fornecedores.map((supplier) => supplier.id), ["alpha", "tca"]);
  assert.equal(merged[0].fornecedores[1].custoPixBRL, 47.4);
});

test("merge não associa sequências diferentes do mesmo jogo", () => {
  assert.equal(merge.supplierMatchScore("Resident Evil 4", "Resident Evil 5"), 0);
  assert.equal(merge.supplierMatchScore("EA Sports FC 24", "EA Sports FC 25"), 0);
  assert.equal(merge.supplierMatchScore("Resident Evil 7", "Resident Evil 7 Gold Edition"), 0);
  assert.equal(merge.supplierMatchScore("Street Fighter 6", "Street Fighter 6 Deluxe Edition"), 0);
  assert.equal(merge.supplierMatchScore("Battlefield 4", "Battlefield 4 Premium Edition"), 0);
});

test("merge reconhece algarismos romanos e grafias conhecidas sem perder a edição", () => {
  assert.ok(merge.supplierMatchScore("FINAL FANTASY (7) VII REBIRTH", "Final Fantasy VII Rebirth") >= 0.82);
  assert.ok(merge.supplierMatchScore("RESIDENT EVIL VILLAGE", "Resident Evil 8 Village") >= 0.82);
  assert.ok(merge.supplierMatchScore("ARK SURVIVAL EVOLVED", "Ark Survival Envolved") >= 0.82);
});

test("merge une as diferentes grafias de Xbox Series sem criar IDs duplicados", () => {
  assert.equal(
    merge.supplierMatchScore(
      "ALAN WAKE 2 - XBOX SERIES S/X - MIDIA DIGITAL",
      "Alan Wake 2 - Xbox Series Mídia Digital"
    ),
    1
  );
  assert.equal(
    merge.supplierMatchScore(
      "BATTLEFIELD 6 - XBOX SERIES S/X - MÍDIA DIGITAL",
      "Battlefield 6 - Xbox Series X|S Mídia Digital"
    ),
    1
  );
});

test("validação bloqueia queda perigosa e produtos duplicados", () => {
  const product = (id) => ({ id, nome: id, plataforma: "PlayStation 5", precoVendaEUR: 9.99 });
  assert.throws(() => validateCatalogUpdate(Array.from({ length: 100 }, (_, i) => product(`old-${i}`)), [product("new")]), /demasiados/);
  assert.throws(() => validateCatalogUpdate([], [product("same"), product("same")]), /duplicado/);
});

test("automação diária usa a chave do YouTube sem exceder o orçamento de pesquisas", () => {
  const workflow = fs.readFileSync(".github/workflows/youtube-trailers.yml", "utf8");
  assert.match(workflow, /cron:\s*"20 5 \* \* \*"/);
  assert.match(workflow, /YOUTUBE_API_KEY:\s*\$\{\{ secrets\.YOUTUBE_API_KEY \}\}/);
  assert.match(workflow, /YOUTUBE_REVALIDATE_SEARCH_LIMIT:\s*20/);
  assert.match(workflow, /YOUTUBE_REQUEST_LIMIT:\s*70/);
  assert.match(workflow, /Revalidar trailers existentes[\s\S]*continue-on-error:\s*true/);
  assert.match(workflow, /Procurar trailers ausentes[\s\S]*continue-on-error:\s*true/);
});
