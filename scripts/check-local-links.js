const fs = require("fs");
const path = require("path");

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith(".html"));
const attrPattern = /(?:src|href)=["']([^"']+)["']/g;
const externalPattern = /^(https?:|mailto:|tel:|#|javascript:|data:|about:)/i;
const missing = [];

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  let match;

  while ((match = attrPattern.exec(html))) {
    const original = match[1];
    const clean = original.split("#")[0].split("?")[0];
    if (!clean || externalPattern.test(clean)) continue;

    const localPath = path.join(root, decodeURIComponent(clean));
    if (!fs.existsSync(localPath)) missing.push(`${file}: ${original}`);
  }
}

if (missing.length) {
  console.error("Referencias locais em falta:");
  console.error(missing.join("\n"));
  process.exit(1);
}

console.log(`Referencias locais OK em ${htmlFiles.length} paginas HTML.`);
