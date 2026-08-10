const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const requiredFiles = [
  "index.html",
  "catalogo.html",
  "produto.html",
  "minha-conta.html",
  "painel-pedidos.html",
  "favicon.svg",
  "styles.css",
  "produto.css",
  "home.js",
  "produto.js",
  "minha-conta.js",
  "admin-pedidos.js",
  "cart.js",
  "header-search.js",
  "footer.js",
  "chat.js",
  "netlify/functions/chat-ia.js",
  "scripts/auth.js",
  "netlify/functions/stripe-webhook.js",
  "netlify/functions/criar-checkout.js",
  "netlify/functions/admin-pedidos.js",
  "netlify/functions/atualizar-pedido-status.js",
  "netlify/functions/marcar-pedido-enviado.js",
  "netlify/functions/meus-pedidos.js",
  "netlify/functions/enviar-email-codigo.js",
  "_redirects",
  "_headers",
  "data/catalog-lite.json",
  "data/ps4.json",
  "data/ps5.json",
  "data/xbox-one.json",
  "data/xbox-series.json",
  "assets/galaxygame-header-logo.webp",
  "assets/galaxygame-header-logo-cropped.webp",
  "assets/site-cosmic-gaming-bg.webp",
  "assets/gta-vi-landscape-hq.webp",
  "assets/gta-vi-original.webp",
  "assets/gta-vi-visual-beach-5k.webp",
  "assets/gta-vi-visual-city-sunset.jpg",
  "assets/gta-vi-visual-skyline.jpg",
  "assets/gta-vi-visual-night-hdr.webp",
  "assets/players-coop-review.webp",
  "assets/review-solo-gamer.webp",
  "assets/review-phone-confirmation.webp",
  "assets/player-testimonial.webp",
  "assets/payments.webp"
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

if (missing.length) {
  console.error("[Netlify] Ficheiros obrigatorios em falta:");
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

const publicCatalogs = [
  "data/catalog-lite.json",
  "data/ps4.json",
  "data/ps5.json",
  "data/xbox-one.json",
  "data/xbox-series.json"
];

for (const file of publicCatalogs) {
  const products = readJson(file);
  if (!Array.isArray(products) || products.length === 0) {
    console.error(`[Netlify] ${file} esta vazio ou nao e uma lista de produtos.`);
    process.exit(1);
  }
}

const redirects = fs.readFileSync(path.join(root, "_redirects"), "utf8");
if (!redirects.includes("/scripts/auth.js /scripts/auth.js 200")) {
  console.error("[Netlify] _redirects precisa permitir /scripts/auth.js antes de bloquear /scripts/*.");
  process.exit(1);
}

if (/^\/\.netlify\//m.test(redirects)) {
  console.error("[Netlify] _redirects nao pode bloquear /.netlify/* porque esse caminho e reservado para Functions.");
  process.exit(1);
}

const catalogLiteCount = readJson("data/catalog-lite.json").length;
console.log(`[Netlify] OK: site pronto para deploy com ${catalogLiteCount} produtos no catalog-lite.json.`);
