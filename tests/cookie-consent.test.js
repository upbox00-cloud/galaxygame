const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const consentSource = fs.readFileSync(path.join(root, "cookie-consent.js"), "utf8");
const publicPages = fs.readdirSync(root).filter((file) => file.endsWith(".html"));

test("all public pages load consent before any Meta Pixel code", () => {
  for (const file of publicPages) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.equal((html.match(/cookie-consent\.js/g) || []).length, 1, file);
    assert.equal((html.match(/cookie-consent\.css/g) || []).length, 1, file);
    assert.doesNotMatch(html, /connect\.facebook\.net|facebook\.com\/tr\?|fbq\(['"]init['"]/, file);
  }
});

test("Meta Pixel loads only after explicit accepted consent", () => {
  assert.match(consentSource, /if \(consent === "accepted"\) loadMetaPixel\(\)/);
  assert.match(consentSource, /if \(choice === "accepted"\) loadMetaPixel\(\)/);
  assert.match(consentSource, /data-cookie-accept/);
  assert.match(consentSource, /data-cookie-reject/);
  assert.match(consentSource, /connect\.facebook\.net\/en_US\/fbevents\.js/);
  assert.match(consentSource, /window\.fbq\("init", META_PIXEL_ID\)/);
  assert.match(consentSource, /window\.fbq\("track", "PageView"\)/);
});

test("rejection is remembered and revokes marketing cookies", () => {
  assert.match(consentSource, /CONSENT_MAX_AGE = 180 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(consentSource, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(consentSource, /window\.fbq\("consent", "revoke"\)/);
  assert.match(consentSource, /\["_fbp", "_fbc"\]/);
});
