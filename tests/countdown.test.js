const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const countdown = require("../release-countdown.js");
const root = path.resolve(__dirname, "..");

test("parses a valid catalog release date without changing its day", () => {
  const date = countdown.parseReleaseDate("2026-11-19");
  assert.ok(date instanceof Date);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 10);
  assert.equal(date.getDate(), 19);
});

test("rejects missing, malformed and impossible release dates", () => {
  assert.equal(countdown.parseReleaseDate(null), null);
  assert.equal(countdown.parseReleaseDate("tbd"), null);
  assert.equal(countdown.parseReleaseDate("2026-02-30"), null);
});

test("formats a stable days, hours, minutes and seconds countdown", () => {
  const result = countdown.formatRemaining(
    (3 * 24 * 60 * 60 * 1000) + (4 * 60 * 60 * 1000) + (5 * 60 * 1000) + (6 * 1000)
  );
  assert.equal(result.text, "3d 04h 05m 06s");
});

test("loads the shared countdown before dynamic product renderers", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const catalog = fs.readFileSync(path.join(root, "catalogo.html"), "utf8");
  const product = fs.readFileSync(path.join(root, "produto.html"), "utf8");

  assert.ok(index.indexOf("release-countdown.js") < index.indexOf("home.js"));
  assert.ok(catalog.indexOf("release-countdown.js") < catalog.indexOf("home.js"));
  assert.ok(product.indexOf("release-countdown.js") < product.indexOf("produto.js"));
});

test("preorder cards and product panel contain countdown hooks", () => {
  const home = fs.readFileSync(path.join(root, "home.js"), "utf8");
  const productJs = fs.readFileSync(path.join(root, "produto.js"), "utf8");
  const productHtml = fs.readFileSync(path.join(root, "produto.html"), "utf8");

  assert.match(home, /preorderCountdownHtml\(product\)/);
  assert.match(productJs, /renderProductCountdown\(product\)/);
  assert.match(productHtml, /data-product-countdown/);
  assert.match(home, /released: "2026-11-19"/);
  assert.match(productJs, /released: "2026-11-19"/);
});

test("product countdown waits for the shared module when scripts load out of order", () => {
  const productJs = fs.readFileSync(path.join(root, "produto.js"), "utf8");
  const shared = fs.readFileSync(path.join(root, "release-countdown.js"), "utf8");

  assert.match(productJs, /addEventListener\("galaxy-countdown-ready", refresh, \{ once: true \}\)/);
  assert.match(shared, /CustomEvent\("galaxy-countdown-ready"\)/);
});
