const fs = require("fs");
const path = require("path");

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith(".html"));
const errors = [];
const metaPixelId = "2151605615698965";

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const isRedirect = /http-equiv=["']refresh["']/i.test(html);

  if (!/<meta\s+name=["']viewport["']/i.test(html)) errors.push(`${file}: falta meta viewport`);
  if (!/<title>[^<]+<\/title>/i.test(html)) errors.push(`${file}: falta um título`);
  if (!isRedirect && !/<main\b/i.test(html)) errors.push(`${file}: falta o elemento main`);
  if (!isRedirect && !/<h1\b/i.test(html)) errors.push(`${file}: falta um título h1`);
  if (/[ÃÂ][\u0080-\u00bf]|Ã[A-Za-z]/.test(html)) errors.push(`${file}: contém texto com codificação corrompida`);

  const pixelInitializations = [...html.matchAll(/fbq\(['"]init['"],\s*['"]([^'"]+)['"]\)/g)];
  const pixelPageViews = [...html.matchAll(/fbq\(['"]track['"],\s*['"]PageView['"]\)/g)];
  if (pixelInitializations.length !== 1) errors.push(`${file}: Meta Pixel deve ser inicializado exatamente uma vez`);
  if (pixelInitializations[0]?.[1] !== metaPixelId) errors.push(`${file}: Meta Pixel usa um ID inesperado`);
  if (pixelPageViews.length !== 1) errors.push(`${file}: PageView do Meta Pixel deve ser enviado exatamente uma vez`);

  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) errors.push(`${file}: IDs duplicados (${duplicates.join(", ")})`);

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    if (/facebook\.com\/tr\?/i.test(match[0])) continue;
    if (!/\balt\s*=/i.test(match[0])) errors.push(`${file}: imagem sem texto alternativo`);
  }

  for (const match of html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)) {
    if (!/\brel=["'][^"']*noopener/i.test(match[0])) errors.push(`${file}: link externo sem rel=noopener`);
  }
}

if (errors.length) {
  console.error("Problemas de prontidão encontrados:\n" + errors.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Prontidão estrutural OK em ${htmlFiles.length} páginas HTML.`);
