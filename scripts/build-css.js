const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const { PurgeCSS } = require("purgecss");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "styles.css");
const homeContent = [
  "index.html",
  "home.js",
  "noticias.js",
  "cart.js",
  "header-search.js",
  "footer.js",
  "chat.js",
  "cookie-consent.js",
  "release-countdown.js",
  "scripts/auth-loader.js",
  "scripts/auth.js"
].map((file) => path.join(root, file));

const dynamicStatePattern = /^(active|hidden|visible|loaded|open|ready|is-|has-|mobile-|auth-|chat-|cart-|catalog-|category-|recommendation-|news-|release-|platform-|search-|skeleton-|reveal|footer)/;
const dynamicMediaPattern = /^(cover-video|card-preview-video)$/;

async function minify(css) {
  const result = await esbuild.transform(css, {
    loader: "css",
    minify: true,
    legalComments: "none"
  });
  return result.code;
}

async function build() {
  const source = fs.readFileSync(sourcePath, "utf8");
  fs.writeFileSync(path.join(root, "styles.min.css"), await minify(source));

  const [home] = await new PurgeCSS().purge({
    content: homeContent.map((file) => ({
      raw: fs.readFileSync(file, "utf8"),
      extension: path.extname(file).slice(1)
    })),
    css: [{ raw: source }],
    safelist: {
      standard: [dynamicStatePattern, dynamicMediaPattern],
      deep: [dynamicStatePattern, dynamicMediaPattern],
      greedy: [dynamicStatePattern, dynamicMediaPattern]
    }
  });
  fs.writeFileSync(path.join(root, "styles.home.min.css"), await minify(home.css));

  const fullSize = fs.statSync(path.join(root, "styles.min.css")).size;
  const homeSize = fs.statSync(path.join(root, "styles.home.min.css")).size;
  console.log(`CSS gerado: completo ${fullSize} bytes; home ${homeSize} bytes.`);
}

build().catch((error) => {
  console.error("Falha ao gerar o CSS.", error);
  process.exitCode = 1;
});
