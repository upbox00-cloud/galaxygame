const { PLATFORMS, loadJson, saveJson, gameNameMatch, normalizeGameTitle } = require("./common");

const CATALOG_FILES = Object.values(PLATFORMS).map((platform) => platform.output);

const CURADORIA = [
  { prioridade: 1, nome: "Grand Theft Auto V / Grand Theft Auto VI", aliases: ["grand theft auto v", "grand theft auto 5", "gta v", "gta 5", "grand theft auto vi", "grand theft auto 6", "gta vi", "gta 6"] },
  { prioridade: 2, nome: "EA Sports FC 26 / EA Sports FC 27", aliases: ["ea sports fc 26", "fc 26", "ea sports fc 27", "fc 27"] },
  { prioridade: 3, nome: "Call of Duty: Modern Warfare III / Modern Warfare 4", aliases: ["call of duty modern warfare iii", "call of duty modern warfare 3", "modern warfare iii", "modern warfare 3", "modern warfare 4", "call of duty modern warfare 4"] },
  { prioridade: 4, nome: "Fortnite", aliases: ["fortnite"] },
  { prioridade: 5, nome: "Minecraft", aliases: ["minecraft"] },
  { prioridade: 6, nome: "FIFA", aliases: ["fifa"] },
  { prioridade: 7, nome: "God of War Ragnarök", aliases: ["god of war ragnarok", "god of war ragnarok"] },
  { prioridade: 8, nome: "Spider-Man 2", aliases: ["spider man 2", "marvel spider man 2", "marvels spider man 2"] },
  { prioridade: 9, nome: "The Witcher 3: Wild Hunt", aliases: ["the witcher 3 wild hunt", "witcher 3 wild hunt", "the witcher 3"] },
  { prioridade: 10, nome: "Elden Ring", aliases: ["elden ring"] },
  { prioridade: 11, nome: "Red Dead Redemption 2", aliases: ["red dead redemption 2", "red dead redemption ii"] },
  { prioridade: 12, nome: "Resident Evil 4 / Resident Evil Requiem", aliases: ["resident evil 4", "resident evil iv", "resident evil requiem"] },
  { prioridade: 13, nome: "Cyberpunk 2077", aliases: ["cyberpunk 2077"] },
  { prioridade: 14, nome: "Assassin's Creed Valhalla / Assassin's Creed Shadows", aliases: ["assassin s creed valhalla", "assassins creed valhalla", "assassin s creed shadows", "assassins creed shadows"] },
  { prioridade: 15, nome: "Horizon Forbidden West", aliases: ["horizon forbidden west"] },
  { prioridade: 16, nome: "Hogwarts Legacy", aliases: ["hogwarts legacy"] },
  { prioridade: 17, nome: "Baldur's Gate 3", aliases: ["baldur s gate 3", "baldurs gate 3", "baldur gate 3"] },
  { prioridade: 18, nome: "Diablo IV", aliases: ["diablo iv", "diablo 4"] },
  { prioridade: 19, nome: "Forza Horizon 5", aliases: ["forza horizon 5"] },
  { prioridade: 20, nome: "Halo Infinite / Halo Campaign Evolved", aliases: ["halo infinite", "halo campaign evolved", "halo campaign evolved"] },
  { prioridade: 21, nome: "Gears 5", aliases: ["gears 5", "gears of war 5"] },
  { prioridade: 22, nome: "Star Wars Jedi: Fallen Order / Star Wars Jedi Survivor", aliases: ["star wars jedi fallen order", "jedi fallen order", "star wars jedi survivor", "jedi survivor"] },
  { prioridade: 23, nome: "Batman: Arkham Knight", aliases: ["batman arkham knight"] },
  { prioridade: 24, nome: "Mortal Kombat 1", aliases: ["mortal kombat 1"] },
  { prioridade: 25, nome: "Street Fighter 6", aliases: ["street fighter 6"] },
  { prioridade: 26, nome: "Tekken 8", aliases: ["tekken 8"] },
  { prioridade: 27, nome: "NBA 2K26", aliases: ["nba 2k26", "nba 2k 26"] },
  { prioridade: 28, nome: "Madden NFL", aliases: ["madden nfl", "madden"] },
  { prioridade: 29, nome: "Terraria", aliases: ["terraria"] },
  { prioridade: 30, nome: "Stardew Valley", aliases: ["stardew valley"] },
  { prioridade: 31, nome: "It Takes Two", aliases: ["it takes two"] },
  { prioridade: 32, nome: "A Way Out", aliases: ["a way out"] },
  { prioridade: 33, nome: "Sea of Thieves", aliases: ["sea of thieves"] },
  { prioridade: 34, nome: "Rocket League", aliases: ["rocket league"] },
  { prioridade: 35, nome: "Fall Guys", aliases: ["fall guys"] },
  { prioridade: 36, nome: "Overwatch 2", aliases: ["overwatch 2"] },
  { prioridade: 37, nome: "Apex Legends", aliases: ["apex legends"] },
  { prioridade: 38, nome: "eFootball / PES", aliases: ["efootball", "pes", "pro evolution soccer"] },
  { prioridade: 39, nome: "Death Stranding", aliases: ["death stranding"] },
  { prioridade: 40, nome: "Ghost of Tsushima", aliases: ["ghost of tsushima"] },
  { prioridade: 41, nome: "Days Gone", aliases: ["days gone"] },
  { prioridade: 42, nome: "Marvel's Wolverine", aliases: ["marvel s wolverine", "marvels wolverine", "wolverine"] },
  { prioridade: 43, nome: "Silent Hill 2 (Remake)", aliases: ["silent hill 2", "silent hill 2 remake"] },
  { prioridade: 44, nome: "Dying Light 2", aliases: ["dying light 2"] },
  { prioridade: 45, nome: "Far Cry 6", aliases: ["far cry 6"] },
  { prioridade: 46, nome: "Grand Theft Auto: The Trilogy", aliases: ["grand theft auto the trilogy", "gta the trilogy", "grand theft auto trilogy"] },
  { prioridade: 47, nome: "Persona 5 Royal", aliases: ["persona 5 royal"] },
  { prioridade: 48, nome: "Monster Hunter Wilds", aliases: ["monster hunter wilds"] },
  { prioridade: 49, nome: "Split Fiction", aliases: ["split fiction"] }
];

function repairText(value) {
  return String(value || "")
    .replace(/MÃƒÂDIA/g, "MÍDIA")
    .replace(/MÃDIA/g, "MÍDIA")
    .replace(/ÃƒÂ©/g, "é")
    .replace(/Ã©/g, "é")
    .replace(/ÃƒÂ¶/g, "ö")
    .replace(/Ã¶/g, "ö")
    .replace(/ÃƒÂ¶/g, "ö")
    .replace(/Ã‚/g, "");
}

function normalized(value) {
  return normalizeGameTitle(repairText(value))
    .replace(/\b(game of the year|goty|complete|collection|bundle|pack|pacote)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenCoverage(alias, candidate) {
  const aliasTokens = normalized(alias).split(" ").filter(Boolean);
  const candidateTokens = new Set(normalized(candidate).split(" ").filter(Boolean));
  if (!aliasTokens.length || !candidateTokens.size) return 0;
  return aliasTokens.filter((token) => candidateTokens.has(token)).length / aliasTokens.length;
}

function aliasMatchesProduct(alias, productName) {
  const aliasKey = normalized(alias);
  const productKey = normalized(productName);
  if (!aliasKey || !productKey) return false;

  const aliasTokens = aliasKey.split(" ").filter(Boolean);
  if (aliasTokens.length === 1) {
    if (["fifa", "madden", "pes", "efootball"].includes(aliasKey)) {
      return productKey === aliasKey || productKey.startsWith(`${aliasKey} `);
    }
    return productKey === aliasKey;
  }

  if (aliasKey === "elden ring" && productKey.includes("nightreign")) return false;

  if (productKey === aliasKey) return true;
  if (productKey.includes(aliasKey) && aliasKey.length >= 5) return true;
  if (tokenCoverage(alias, productName) >= 0.98) return true;

  const match = gameNameMatch(alias, productName);
  return match.accepted && match.score >= 0.72;
}

function bestCuratedMatch(product) {
  let best = null;
  for (const item of CURADORIA) {
    for (const alias of item.aliases) {
      if (!aliasMatchesProduct(alias, product.nome)) continue;
      const match = gameNameMatch(alias, product.nome);
      const score = match.score || tokenCoverage(alias, product.nome);
      if (!best || item.prioridade < best.item.prioridade || (item.prioridade === best.item.prioridade && score > best.score)) {
        best = { item, alias, score };
      }
    }
  }
  return best;
}

function main() {
  const foundPriorities = new Map();
  let markedProducts = 0;
  let touchedFiles = 0;

  for (const file of CATALOG_FILES) {
    const products = loadJson(file, []);
    let changed = false;

    for (const product of products) {
      if (product.destaqueHome !== undefined || product.prioridadeCuradoria !== undefined) {
        delete product.destaqueHome;
        delete product.prioridadeCuradoria;
        changed = true;
      }

      const match = bestCuratedMatch(product);
      if (!match) continue;

      product.destaqueHome = true;
      product.prioridadeCuradoria = match.item.prioridade;
      markedProducts += 1;
      changed = true;

      const current = foundPriorities.get(match.item.prioridade) || {
        item: match.item,
        variants: 0,
        examples: new Set()
      };
      current.variants += 1;
      current.examples.add(`${file}: ${product.nome}`);
      foundPriorities.set(match.item.prioridade, current);
    }

    if (changed) {
      saveJson(file, products);
      touchedFiles += 1;
    }
  }

  const missing = CURADORIA.filter((item) => !foundPriorities.has(item.prioridade));
  const foundCount = foundPriorities.size;

  console.log(`Curadoria aplicada: ${foundCount}/${CURADORIA.length} itens encontrados.`);
  console.log(`Produtos marcados: ${markedProducts}. Arquivos atualizados: ${touchedFiles}.`);
  if (missing.length) {
    console.log("Nao encontrados no catalogo:");
    missing.forEach((item) => console.log(`- ${item.prioridade}. ${item.nome}`));
  } else {
    console.log("Todos os itens da lista foram encontrados no catalogo.");
  }
}

main();
