const fs = require("fs");
const path = require("path");
const icons = require("simple-icons");

const OUTPUT_DIR = path.join(__dirname, "..", "assets", "payments");

const PAYMENT_ICONS = [
  ["visa", icons.siVisa],
  ["mastercard", icons.siMastercard],
  ["american-express", icons.siAmericanexpress],
  ["apple-pay", icons.siApplepay],
  ["google-pay", icons.siGooglepay],
  ["klarna", icons.siKlarna]
];

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (const [filename, icon] of PAYMENT_ICONS) {
  if (!icon) {
    console.warn(`Icone nao encontrado no simple-icons: ${filename}`);
    continue;
  }

  const svg = [
    `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">`,
    `<title>${icon.title}</title>`,
    `<path fill="#${icon.hex}" d="${icon.path}"/>`,
    `</svg>`
  ].join("");

  fs.writeFileSync(path.join(OUTPUT_DIR, `${filename}.svg`), `${svg}\n`, "utf8");
  console.log(`Gerado: assets/payments/${filename}.svg`);
}
