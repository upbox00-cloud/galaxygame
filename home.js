const CATALOG_PAGE_SIZE = 30;
const HOME_POPULARITY_MINIMUM = 500;
const CHEAP_GAMES_MAX_PRICE_EUR = 15;
const CATALOG_FILES = {
  ps4: { label: "PlayStation 4", file: "data/ps4.json" },
  ps5: { label: "PlayStation 5", file: "data/ps5.json" },
  "xbox-one": { label: "Xbox One", file: "data/xbox-one.json" },
  "xbox-series": { label: "Xbox Series X|S", file: "data/xbox-series.json" }
};

const catalogState = {
  productsByPlatform: {},
  activePlatform: "ps5",
  selectedPlatforms: new Set(["ps5"]),
  query: "",
  minPrice: null,
  maxPrice: null,
  minDiscount: 0,
  selectedGenres: new Set(),
  sort: "relevance",
  cheapMode: false,
  preorderOnly: false,
  visibleCount: CATALOG_PAGE_SIZE
};

let activeTrendPlatform = "ps5";
let revealObserver = null;

const MANUAL_CATALOG_PRODUCTS = [
  {
    id: "gta-vi-ps5",
    nome: "Grand Theft Auto VI - Mídia Digital PlayStation 5",
    plataforma: "PlayStation 5",
    precoVendaEUR: 57.99,
    precoOriginalEUR: 79.99,
    released: "2026-11-19",
    rating: 5,
    ratings_count: 0,
    added: 0,
    preorder: true,
    trailer: "https://www.youtube.com/embed/QdBZY2fkU-0",
    imagemFallback: "assets/gta-vi-landscape-hq.webp",
    capaSteamGridDB: "assets/gta-vi-original.webp",
    screenshots: [
      "assets/gta-vi-landscape-hq.webp",
      "assets/gta-vi-visual-beach-5k.webp",
      "assets/gta-vi-visual-city-sunset.jpg",
      "assets/gta-vi-visual-skyline.jpg",
      "assets/gta-vi-visual-night-hdr.webp"
    ],
    descricao: "Reserva antecipada de Grand Theft Auto VI em mídia digital para PlayStation 5. Pré-lançamento, com preço em euros e acesso em Minha Conta > Meus Pedidos e envio por email quando estiver disponível.",
    genres: ["Action", "Adventure"],
    tags: ["PlayStation 5", "Pré-lançamento", "Digital", "Mundo aberto", "Europa"],
    aliasesBusca: ["gta vi", "gta 6", "grand theft auto vi", "grand theft auto 6"],
    catalogPlatform: "ps5",
    destaqueHome: true,
    prioridadeCuradoria: 1
  },
  {
    id: "gta-vi-xbox-series",
    nome: "Grand Theft Auto VI - Mídia Digital Xbox Series X|S",
    plataforma: "Xbox Series X|S",
    precoVendaEUR: 69.99,
    precoOriginalEUR: 74.99,
    released: "2026-11-19",
    rating: 5,
    ratings_count: 0,
    added: 0,
    preorder: true,
    trailer: "https://www.youtube.com/embed/QdBZY2fkU-0",
    imagemFallback: "assets/gta-vi-landscape-hq.webp",
    capaSteamGridDB: "assets/gta-vi-original.webp",
    screenshots: [
      "assets/gta-vi-landscape-hq.webp",
      "assets/gta-vi-visual-beach-5k.webp",
      "assets/gta-vi-visual-city-sunset.jpg",
      "assets/gta-vi-visual-skyline.jpg",
      "assets/gta-vi-visual-night-hdr.webp"
    ],
    descricao: "Reserva antecipada de Grand Theft Auto VI em mídia digital para Xbox Series X|S. Pré-lançamento, com preço em euros e acesso em Minha Conta > Meus Pedidos e envio por email quando estiver disponível.",
    genres: ["Action", "Adventure"],
    tags: ["Xbox Series X|S", "Pré-lançamento", "Digital", "Mundo aberto", "Europa"],
    aliasesBusca: ["gta vi", "gta 6", "grand theft auto vi", "grand theft auto 6"],
    catalogPlatform: "xbox-series",
    destaqueHome: true,
    prioridadeCuradoria: 1
  }
];

const MANUAL_PREORDER_PRODUCTS = MANUAL_CATALOG_PRODUCTS.filter((product) => product.preorder === true);

const catalogGrid = document.querySelector("#catalogo-produtos");
const catalogStatus = document.querySelector("#catalogo-status");
const catalogCounter = document.querySelector("#catalogo-contador");
const catalogSearch = document.querySelector("#catalogo-busca");
const catalogLoadMore = document.querySelector("#catalogo-carregar-mais");
const catalogTabs = document.querySelector("#catalogo-filtros");
const catalogSidebar = document.querySelector("#catalogo-sidebar");
const catalogFilterOpen = document.querySelector("#catalogo-abrir-filtros");
const catalogFilterBackdrop = document.querySelector("#catalogo-fechar-filtros");
const catalogFilterClose = document.querySelector(".catalog-sidebar-close");
const catalogClearFilters = document.querySelector("#catalogo-limpar-filtros");
const catalogMinPrice = document.querySelector("#catalogo-preco-min");
const catalogMaxPrice = document.querySelector("#catalogo-preco-max");
const catalogSort = document.querySelector("#catalogo-ordenacao");
const catalogGenres = document.querySelector("#catalogo-generos");
const catalogGenresGroup = document.querySelector("#catalogo-generos-grupo");

function escapeCatalogHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeCatalogText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function compactCatalogText(value) {
  return normalizeCatalogText(value).replace(/[^a-z0-9]+/g, "");
}

function baseGameKey(value) {
  const normalized = normalizeCatalogText(repairCatalogText(value));
  if (/\b(grand\s+theft\s+auto\s+vi|gta\s*(vi|6))\b/.test(normalized)) return "grand theft auto vi";
  if (/\b(grand\s+theft\s+auto\s+v|gta\s*(v|5))\b/.test(normalized)) return "grand theft auto v";
  if (/\b(grand\s+theft\s+auto\s+the\s+trilogy|gta\s+the\s+trilogy)\b/.test(normalized)) return "grand theft auto trilogy";

  return normalized
    .replace(/\bxbox\s*one\s*&\s*(xbox\s*)?series\s*(s\/x|x\/s|x\|s)\b/g, " ")
    .replace(/\b(playstation\s*4|playstation\s*5|ps4|ps5)\b/g, " ")
    .replace(/\b(xbox\s*one|xbox\s*series\s*(x\|s|s\/x|x\/s)?|series\s*(x\|s|s\/x|x\/s))\b/g, " ")
    .replace(/\b(midia|media|digital|digita|codigo|conteudo|conteudo digital)\b/g, " ")
    .replace(/\b(edicao|edition|standard|deluxe|ultimate|premium|exclusiva|exclusivo)\b/g, " ")
    .replace(/\b(remastered|remaster|definitive|director'?s|version'?s|versao)\b/g, " ")
    .replace(/&/g, " e ")
    .replace(/\b(e|xbox|series)\b/g, " ")
    .replace(/\bpay\s+day\b/g, "payday")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productImageKey(product) {
  const source = catalogImageCandidates(product)[0] || "";
  const cleanSource = normalizeCatalogText(source)
    .replace(/^https?:\/\//, "")
    .replace(/[?#].*$/, "")
    .replace(/-\d+x\d+(?=\.[a-z0-9]+$)/g, "")
    .trim();

  if (!cleanSource || cleanSource.includes("gta-vi-landscape-hq")) return "";
  return cleanSource;
}

function repairCatalogText(value) {
  return String(value || "")
    .replace(/MÃDIA/g, "MÍDIA")
    .replace(/MÃ­DIA/g, "MÍDIA")
    .replace(/MÃÍDIA/g, "MÍDIA")
    .replace(/MÃ­dia/g, "Mídia")
    .replace(/MÃ­dIA/g, "MÍDIA")
    .replace(/MÃ­/g, "mí")
    .replace(/Ã/g, "Í")
    .replace(/Ã‰/g, "É")
    .replace(/Ã‡/g, "Ç")
    .replace(/Ãƒ/g, "Ã")
    .replace(/Ã/g, "Á")
    .replace(/Ã‰/g, "É")
    .replace(/Ã“/g, "Ó")
    .replace(/Ãš/g, "Ú")
    .replace(/Â´/g, "´")
    .replace(/Â®/g, "®")
    .replace(/Â·/g, "·")
    .replace(/â€™/g, "’")
    .replace(/â€œ|â€/g, "\"")
    .replace(/â€“|â€”/g, "-")
    .replace(/Â/g, "");
}

function displayProductName(product) {
  return repairCatalogText(product.nome)
    .replace(/\s*-\s*(PS4|PS5|PLAYSTATION 4|PLAYSTATION 5|XBOX ONE|XBOX SERIES S\/X|XBOX SERIES X\/S|XBOX ONE & SERIES S\/X)\s*/gi, " - ")
    .replace(/\s*-\s*(MIDIA|MÍDIA)\s+DIGITAL\s*/gi, "")
    .replace(/\s+-\s+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatCatalogEUR(value) {
  const number = Number(value || 0);
  return `${number.toFixed(2).replace(".", ",")} €`;
}

function discountPercent(product) {
  const original = Number(product.precoOriginalEUR || 0);
  const sale = Number(product.precoVendaEUR || 0);
  if (!original || !sale || sale >= original) return "Digital";
  return `-${Math.round((1 - sale / original) * 100)}%`;
}

function discountValue(product) {
  const original = Number(product.precoOriginalEUR || 0);
  const sale = Number(product.precoVendaEUR || 0);
  if (!original || !sale || sale >= original) return 0;
  return Math.round((1 - sale / original) * 100);
}

function platformBadgeType(product) {
  const platform = normalizeCatalogText(`${product?.plataforma || ""} ${product?.catalogPlatform || ""}`);
  if (platform.includes("xbox")) return "xbox";
  if (platform.includes("playstation") || /\bps[45]\b/.test(platform)) return "playstation";
  return "console";
}

function platformBadgeHtml(product) {
  const type = platformBadgeType(product);
  const label = type === "xbox" ? "Xbox" : type === "playstation" ? "PlayStation" : "Consola";
  const icon = type === "xbox"
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5.4 5.3c-2.2.2-4 1.2-5.4 2.8-1.4-1.6-3.2-2.6-5.4-2.8A8 8 0 0 1 12 4c2.1 0 4 .8 5.4 3.3ZM4.5 12c0-1 .2-1.9.5-2.7 1.9.6 3.5 1.6 4.8 3L6.1 17A7.5 7.5 0 0 1 4.5 12Zm3.2 6.3 4.3-4.5 4.3 4.5a7.4 7.4 0 0 1-8.6 0Zm10.2-1.3-3.7-4.7c1.3-1.4 2.9-2.4 4.8-3 .3.8.5 1.7.5 2.7 0 1.9-.6 3.6-1.6 5Z"/></svg>`
    : `<span aria-hidden="true">PS</span>`;
  return `<span class="platform-logo-badge ${type}" aria-label="${escapeCatalogHtml(label)}">${icon}</span>`;
}

function productImage(product) {
  return catalogImageCandidates(product)[0];
}

function isSupplierCatalogImage(product, source) {
  const normalized = String(source || "").trim();
  if (!normalized) return false;
  const supplierImages = new Set([
    product?.imagemFallback,
    product?.imagemPrincipal
  ].filter(Boolean));
  return supplierImages.has(normalized)
    || /mitiendanube|alphagames|stores\/006\/141\/249\/products/i.test(normalized);
}

function catalogImageCandidates(product) {
  const screenshots = Array.isArray(product?.screenshots) ? product.screenshots : [];
  const cleanScreenshots = screenshots.filter((source) => !isSupplierCatalogImage(product, source));
  const supplierScreenshots = screenshots.filter((source) => isSupplierCatalogImage(product, source));
  return [...new Set([
    product?.capaSteamGridDB,
    ...cleanScreenshots,
    product?.imagemPrincipal,
    product?.imagemFallback,
    ...supplierScreenshots,
    "assets/gta-vi-landscape-hq.webp"
  ].filter((value) => typeof value === "string" && value.trim()))];
}

function resolveCatalogImage(product, callback) {
  const candidates = catalogImageCandidates(product);
  let index = 0;

  function tryNext() {
    const source = candidates[index];
    if (!source) return;
    const image = new Image();
    image.onload = () => callback(source);
    image.onerror = () => {
      index += 1;
      tryNext();
    };
    image.src = source;
  }

  tryNext();
}

function resolveCategoryImage(product, callback) {
  const candidates = [...new Set([
    product?.capaSteamGridDB,
    product?.imagemFallback,
    product?.imagemPrincipal,
    ...(Array.isArray(product?.screenshots) ? product.screenshots : [])
  ].filter((value) => typeof value === "string" && value.trim()))];
  let index = 0;

  function tryNext() {
    const source = candidates[index];
    if (!source) return;
    const image = new Image();
    image.onload = () => callback(source);
    image.onerror = () => {
      index += 1;
      tryNext();
    };
    image.src = source;
  }

  tryNext();
}

function resolveGridCardImages(grid, products) {
  if (!grid) return;
  grid.querySelectorAll(".catalog-card").forEach((card, index) => {
    const cover = card.querySelector(".catalog-cover");
    const product = products[index];
    if (!cover || !product) return;
    resolveCatalogImage(product, (source) => {
      cover.classList.toggle("supplier-cover-clean", isSupplierCatalogImage(product, source));
      cover.style.setProperty("--art", `url('${safeCatalogCssUrl(source)}')`);
    });
  });
}

function safeCatalogCssUrl(value) {
  return String(value || "").replace(/["'\\\n\r]/g, "");
}

function createCatalogCard(product) {
  const name = displayProductName(product);
  const platform = product.availablePlatforms?.length
    ? `Disponivel em: ${product.availablePlatforms.join(", ")}`
    : repairCatalogText(product.plataforma || CATALOG_FILES[product.catalogPlatform]?.label || "Consola");
  const image = productImage(product);
  const oldPrice = Number(product.precoOriginalEUR || 0);
  const salePrice = Number(product.precoVendaEUR || 0);
  const trailer = validCatalogTrailer(product.trailer) ? product.trailer : "";

  return `
    <a class="game-card catalog-card" href="produto.html?id=${encodeURIComponent(product.id)}" data-platforms="${escapeCatalogHtml(platform)}" ${trailer ? `data-trailer="${escapeCatalogHtml(trailer)}"` : ""}>
      <div class="cover catalog-cover ${isSupplierCatalogImage(product, image) ? "supplier-cover-clean" : ""}" style="--art: url('${escapeCatalogHtml(image)}')">
        <span class="tag">${escapeCatalogHtml(discountPercent(product))}</span>
        ${platformBadgeHtml(product)}
        ${preorderCountdownHtml(product)}
      </div>
      <div class="game-info">
        <h3 title="${escapeCatalogHtml(name)}">${escapeCatalogHtml(name)}</h3>
        <span class="game-price">
          ${oldPrice && oldPrice > salePrice ? `<s>${formatCatalogEUR(oldPrice)}</s>` : ""}
          <strong>${formatCatalogEUR(salePrice)}</strong>
        </span>
        <div class="platforms"><span>${escapeCatalogHtml(platform)}</span></div>
      </div>
    </a>
  `;
}

function preorderCountdownHtml(product) {
  if (!isPreorderProduct(product)) return "";
  const released = /^\d{4}-\d{2}-\d{2}$/.test(String(product.released || "")) ? product.released : "";
  return `
    <div class="release-countdown release-countdown-card" data-release-countdown="${escapeCatalogHtml(released)}" aria-label="Contagem decrescente para o lancamento">
      <span class="release-countdown-label">Lan&ccedil;amento em</span>
      <strong data-countdown-value>Data a confirmar</strong>
      <time data-countdown-date${released ? ` datetime="${released}"` : ""}></time>
    </div>
  `;
}

function validCatalogTrailer(value) {
  return typeof value === "string" && /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{6,}/.test(value.trim());
}

async function loadCatalogFile(platformKey, config) {
  const response = await fetch(config.file, { cache: "no-store" });
  if (!response.ok) throw new Error(`Falha ao carregar ${config.file}`);
  const products = await response.json();
  return Array.isArray(products)
    ? products.map((product) => ({ ...product, catalogPlatform: platformKey }))
    : [];
}

async function loadCatalogs() {
  const shouldLoadFullCatalog = Boolean(catalogGrid);
  const entries = shouldLoadFullCatalog
    ? await Promise.all(
      Object.entries(CATALOG_FILES).map(async ([platformKey, config]) => {
        try {
          const products = await loadCatalogFile(platformKey, config);
          return [platformKey, products];
        } catch (error) {
          console.warn(error);
          return [platformKey, []];
        }
      })
    )
    : await fetch("data/catalog-lite.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("catalog-lite indisponivel");
        return response.json();
      })
      .then((products) => {
        const groups = Object.keys(CATALOG_FILES).map((platformKey) => [platformKey, []]);
        const grouped = Object.fromEntries(groups);
        (Array.isArray(products) ? products : []).forEach((product) => {
          const platformKey = product.catalogPlatform;
          if (grouped[platformKey]) grouped[platformKey].push(product);
        });
        return Object.entries(grouped);
      })
      .catch(() => Promise.all(
        Object.entries(CATALOG_FILES).map(async ([platformKey, config]) => {
          try {
            const products = await loadCatalogFile(platformKey, config);
            return [platformKey, products];
          } catch (error) {
            console.warn(error);
            return [platformKey, []];
          }
        })
      ));

  catalogState.productsByPlatform = Object.fromEntries(entries);

  MANUAL_CATALOG_PRODUCTS.forEach((manualProduct) => {
    const platformKey = manualProduct.catalogPlatform;
    if (!platformKey || !catalogState.productsByPlatform[platformKey]) return;
    const exists = catalogState.productsByPlatform[platformKey].some((product) => product.id === manualProduct.id);
    if (!exists) {
      catalogState.productsByPlatform[platformKey].unshift({ ...manualProduct });
    }
  });
}

function productGenres(product) {
  if (!Array.isArray(product.genres)) return [];
  return product.genres
    .map((genre) => repairCatalogText(typeof genre === "string" ? genre : genre?.name))
    .filter(Boolean);
}

function compareCatalogProducts(first, second) {
  if (catalogState.sort === "price-asc") {
    return Number(first.precoVendaEUR || 0) - Number(second.precoVendaEUR || 0);
  }
  if (catalogState.sort === "price-desc") {
    return Number(second.precoVendaEUR || 0) - Number(first.precoVendaEUR || 0);
  }
  if (catalogState.sort === "discount-desc") {
    return discountValue(second) - discountValue(first);
  }
  if (catalogState.sort === "name-asc") {
    return displayProductName(first).localeCompare(displayProductName(second), "pt-PT");
  }
  if (catalogState.sort === "released-desc") {
    const firstTime = productReleaseTime(first);
    const secondTime = productReleaseTime(second);
    if (firstTime === Number.POSITIVE_INFINITY && secondTime === Number.POSITIVE_INFINITY) return 0;
    if (firstTime === Number.POSITIVE_INFINITY) return 1;
    if (secondTime === Number.POSITIVE_INFINITY) return -1;
    return secondTime - firstTime;
  }
  return 0;
}

function filteredCatalogProducts() {
  const products = [...catalogState.selectedPlatforms]
    .flatMap((platformKey) => catalogState.productsByPlatform[platformKey] || []);
  const query = normalizeCatalogText(catalogState.query.trim());
  const compactQuery = compactCatalogText(catalogState.query.trim());
  const queryTokens = query.split(/\s+/).filter(Boolean);
  const filtered = products.filter((product) => {
    const searchText = normalizeCatalogText([
      product.nome,
      displayProductName(product),
      product.plataforma,
      ...(Array.isArray(product.tags) ? product.tags : []),
      ...(Array.isArray(product.aliasesBusca) ? product.aliasesBusca : [])
    ].filter(Boolean).join(" "));
    const compactSearchText = compactCatalogText(searchText);
    const price = Number(product.precoVendaEUR || 0);
    const genres = productGenres(product).map(normalizeCatalogText);
    const matchesQuery = !query
      || searchText.includes(query)
      || (compactQuery && compactSearchText.includes(compactQuery))
      || queryTokens.every((token) => searchText.includes(token));
    const matchesMinPrice = catalogState.minPrice === null || price >= catalogState.minPrice;
    const matchesMaxPrice = catalogState.maxPrice === null || price <= catalogState.maxPrice;
    const matchesDiscount = discountValue(product) >= catalogState.minDiscount;
    const matchesGenre = !catalogState.selectedGenres.size
      || [...catalogState.selectedGenres].some((genre) => genres.includes(genre));
    const matchesPreorder = !catalogState.preorderOnly || isPreorderProduct(product);

    return matchesQuery && matchesMinPrice && matchesMaxPrice && matchesDiscount && matchesGenre && matchesPreorder;
  });

  return catalogState.sort === "relevance" ? filtered : [...filtered].sort(compareCatalogProducts);
}

function updateCatalogTabs() {
  catalogTabs?.querySelectorAll("[data-catalog-platform]").forEach((button) => {
    button.classList.toggle(
      "active",
      catalogState.selectedPlatforms.size === 1 && catalogState.selectedPlatforms.has(button.dataset.catalogPlatform)
    );
  });

  document.querySelectorAll("[data-filter-platform]").forEach((checkbox) => {
    checkbox.checked = catalogState.selectedPlatforms.has(checkbox.value);
  });
}

function platformParamToKey(value) {
  const platform = normalizeCatalogText(value || "");
  const aliases = {
    "playstation 4": "ps4",
    "ps4": "ps4",
    "playstation 5": "ps5",
    "ps5": "ps5",
    "xbox one": "xbox-one",
    "xbox series": "xbox-series",
    "xbox series x s": "xbox-series",
    "xbox series s x": "xbox-series",
    "xbox series x|s": "xbox-series"
  };
  return aliases[platform] || (CATALOG_FILES[platform] ? platform : "");
}

function renderCatalogSkeletons(count = 12) {
  if (!catalogGrid) return;
  catalogGrid.innerHTML = Array.from({ length: count }, () => `
    <article class="game-card catalog-card skeleton-card" aria-hidden="true">
      <div class="cover catalog-cover"></div>
      <div class="game-info">
        <h3></h3>
        <span class="game-price"></span>
        <div class="platforms"><span></span></div>
      </div>
    </article>
  `).join("");
}

function renderCatalog() {
  if (!catalogGrid || !catalogStatus || !catalogCounter || !catalogLoadMore) return;

  const filtered = filteredCatalogProducts();
  const visible = filtered.slice(0, catalogState.visibleCount);
  const selectedLabels = [...catalogState.selectedPlatforms].map((key) => CATALOG_FILES[key]?.label).filter(Boolean);

  catalogGrid.innerHTML = visible.map(createCatalogCard).join("");
  resolveGridCardImages(catalogGrid, visible);
  window.GalaxyCountdown?.refresh(catalogGrid);
  catalogCounter.textContent = `${filtered.length} produto(s)`;

  if (!filtered.length) {
    catalogStatus.textContent = catalogState.preorderOnly
      ? "Nenhuma pre-venda encontrada nos filtros selecionados."
      : catalogState.cheapMode
      ? `Nenhum jogo barato ate ${formatCatalogEUR(catalogState.maxPrice)} encontrado.`
      : "Nenhum produto corresponde aos filtros selecionados.";
    catalogStatus.hidden = false;
  } else if (catalogState.preorderOnly) {
    catalogStatus.textContent = `Pre-vendas: a mostrar ${visible.length} de ${filtered.length}`;
    catalogStatus.hidden = false;
  } else if (catalogState.cheapMode) {
    catalogStatus.textContent = `Jogos baratos ate ${formatCatalogEUR(catalogState.maxPrice)}: a mostrar ${visible.length} de ${filtered.length}`;
    catalogStatus.hidden = false;
  } else {
    catalogStatus.textContent = `A mostrar ${visible.length} de ${filtered.length} em ${selectedLabels.join(", ")}`;
    catalogStatus.hidden = false;
  }

  catalogLoadMore.hidden = visible.length >= filtered.length;
  catalogLoadMore.textContent = `Carregar mais (${visible.length}/${filtered.length})`;

  catalogGrid.querySelectorAll(".game-card").forEach((card, index) => {
    card.style.transitionDelay = `${Math.min(index * 20, 180)}ms`;
    requestAnimationFrame(() => card.classList.add("revealed"));
  });

  updateCatalogTabs();
}

function allCatalogProducts() {
  return Object.values(catalogState.productsByPlatform).flat();
}

function productReleaseTime(product) {
  if (!product.released || String(product.released).toLowerCase() === "tbd") return Number.POSITIVE_INFINITY;
  const time = new Date(`${product.released}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function isPreorderProduct(product) {
  if (product.preorder === true) return true;
  const supplierText = normalizeCatalogText(`${product.nome || ""} ${product.linkFornecedor || ""} ${(Array.isArray(product.tags) ? product.tags : []).join(" ")}`);
  if (/(^|\s)(ea sports\s*)?fc\s*27(\s|$)/.test(supplierText)) return true;
  if (/\b(pre venda|pre order|preorder|reserva antecipada)\b/.test(supplierText)) return true;

  const releaseTime = productReleaseTime(product);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Number.isFinite(releaseTime) && releaseTime > today.getTime();
}

function trendScore(product) {
  return discountValue(product) + Number(product.rating || 0) * 10;
}

function popularityScore(product) {
  const popularity = Math.max(Number(product.added || 0), Number(product.ratings_count || 0));
  const playStationBoost = ["ps4", "ps5"].includes(product.catalogPlatform) ? 1000 : 0;
  return popularity + playStationBoost;
}

function rawgPopularity(product) {
  return Math.max(Number(product.added || 0), Number(product.ratings_count || 0));
}

function isPopularHomeProduct(product) {
  return rawgPopularity(product) >= HOME_POPULARITY_MINIMUM;
}

function variantScore(product) {
  return discountValue(product) * 1000 - Number(product.precoVendaEUR || 0);
}

function isCuratedProduct(product) {
  return product?.destaqueHome === true && Number.isFinite(Number(product.prioridadeCuradoria));
}

function curatedPriority(product) {
  return Number(product?.prioridadeCuradoria || Number.MAX_SAFE_INTEGER);
}

function platformLabel(product) {
  return repairCatalogText(product.plataforma || CATALOG_FILES[product.catalogPlatform]?.label || "Consola");
}

function uniqueGames(products, sectionSort, limit) {
  const groups = new Map();

  products.forEach((product) => {
    const key = baseGameKey(product.nome) || product.id;
    const group = groups.get(key) || [];
    group.push(product);
    groups.set(key, group);
  });

  const sorted = [...groups.values()]
    .map((group) => {
      const availablePlatforms = [...new Set(group.map(platformLabel).filter(Boolean))];
      const selected = [...group].sort((first, second) => variantScore(second) - variantScore(first))[0];
      return { ...selected, availablePlatforms };
    })
    .sort(sectionSort);

  const selected = [];
  const usedImages = new Set();

  sorted.forEach((product) => {
    if (selected.length >= limit) return;
    const imageKey = productImageKey(product);
    if (imageKey && usedImages.has(imageKey)) return;
    if (imageKey) usedImages.add(imageKey);
    selected.push(product);
  });

  return selected;
}

function curatedThenAutomatic(curatedPool, automaticPool, automaticSort, limit) {
  const curated = uniqueGames(
    curatedPool.filter(isCuratedProduct),
    (first, second) => curatedPriority(first) - curatedPriority(second) || automaticSort(first, second),
    limit
  );
  const usedKeys = new Set(curated.map((product) => baseGameKey(product.nome) || product.id));
  const automatic = uniqueGames(
    automaticPool.filter((product) => !usedKeys.has(baseGameKey(product.nome) || product.id)),
    automaticSort,
    Math.max(0, limit - curated.length)
  );

  return [...curated, ...automatic];
}

function renderHighlightGrid(grid, products) {
  if (!grid) return;
  toggleSectionForGrid(grid, products.length > 0);
  if (!products.length) {
    grid.innerHTML = "";
    return;
  }
  grid.innerHTML = products.map(createCatalogCard).join("");
  resolveGridCardImages(grid, products);
  window.GalaxyCountdown?.refresh(grid);
  grid.querySelectorAll(".game-card").forEach((card, index) => {
    card.style.transitionDelay = `${Math.min(index * 25, 200)}ms`;
    requestAnimationFrame(() => card.classList.add("revealed"));
  });
}

function toggleSectionForGrid(grid, visible) {
  const section = grid?.closest("section");
  if (section) section.hidden = !visible;
}

function observeRevealTargets() {
  const targets = document.querySelectorAll(
    ".trust-band article, .review-grid article, .news-section article, .cat, .feature-strip, .testimonial-band > *, .wide-promo > *, .app-band > *, .faq-section details, .indie-art"
  );

  if (!targets.length) return;

  if (!("IntersectionObserver" in window)) {
    targets.forEach((target) => target.classList.add("is-visible"));
    return;
  }

  document.documentElement.classList.add("reveal-enabled");

  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -4% 0px" }
    );
  }

  targets.forEach((target, index) => {
    if (target.dataset.revealReady) return;
    target.dataset.revealReady = "true";
    target.style.transitionDelay = `${Math.min(index * 30, 220)}ms`;
    revealObserver.observe(target);
  });
}

window.observeRevealTargets = observeRevealTargets;

function renderHomeHighlights() {
  const products = allCatalogProducts();
  if (!products.length) return;
  const popularProducts = products.filter(isPopularHomeProduct);

  const preordersGrid = document.querySelector('[data-game-grid="preorders"]');
  const manualKeys = new Set(MANUAL_PREORDER_PRODUCTS.map((product) => baseGameKey(product.nome)));
  const preorderProducts = [
    ...MANUAL_PREORDER_PRODUCTS,
    ...uniqueGames(
      products.filter((product) => isPreorderProduct(product) && !manualKeys.has(baseGameKey(product.nome))),
      (first, second) => productReleaseTime(first) - productReleaseTime(second),
      12
    )
  ];
  toggleSectionForGrid(preordersGrid, preorderProducts.length > 0);
  renderHighlightGrid(preordersGrid, preorderProducts);

  const trendSort = (first, second) =>
    (trendScore(second) + rawgPopularity(second) / 100) - (trendScore(first) + rawgPopularity(first) / 100);
  const trendingCuratedPool = products.filter((product) =>
    activeTrendPlatform === "all" || product.catalogPlatform === activeTrendPlatform
  );
  const trendingAutomaticPool = popularProducts.filter((product) => {
    if (trendScore(product) <= 0) return false;
    return activeTrendPlatform === "all" || product.catalogPlatform === activeTrendPlatform;
  });
  renderHighlightGrid(
    document.querySelector('[data-game-grid="trending"]'),
    curatedThenAutomatic(trendingCuratedPool, trendingAutomaticPool, trendSort, 8)
  );

  const popularitySort = (first, second) => popularityScore(second) - popularityScore(first);
  renderHighlightGrid(
    document.querySelector('[data-game-grid="bestSellers"]'),
    curatedThenAutomatic(products, popularProducts, popularitySort, 8)
  );

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const recentAutomaticPool = popularProducts.filter((product) => {
    const releaseTime = productReleaseTime(product);
    return Number.isFinite(releaseTime) && releaseTime <= today.getTime();
  });
  renderHighlightGrid(
    document.querySelector('[data-game-grid="recentReleases"]'),
    curatedThenAutomatic(
      products.filter((product) => {
        const releaseTime = productReleaseTime(product);
        return isCuratedProduct(product) && Number.isFinite(releaseTime) && releaseTime <= today.getTime();
      }),
      recentAutomaticPool,
      (first, second) => productReleaseTime(second) - productReleaseTime(first),
      8
    )
  );

  renderHighlightGrid(
    document.querySelector('[data-game-grid="catalogPreview"]'),
    curatedThenAutomatic(products, popularProducts, popularitySort, 12)
  );

  renderHomeRecommendation(products);
  renderHomeCategories(products);
}

function renderHomeCategories(products) {
  const tiles = [...document.querySelectorAll("[data-category-genre]")];
  if (!tiles.length) return;

  const usedGames = new Set();
  tiles.forEach((tile) => {
    const targetGenre = normalizeCatalogText(tile.dataset.categoryGenre);
    const candidates = products
      .filter((product) => productGenres(product).map(normalizeCatalogText).includes(targetGenre))
      .sort((first, second) => {
        const firstGenres = productGenres(first).map(normalizeCatalogText);
        const secondGenres = productGenres(second).map(normalizeCatalogText);
        const primaryGenreDifference = Number(secondGenres[0] === targetGenre) - Number(firstGenres[0] === targetGenre);
        if (primaryGenreDifference) return primaryGenreDifference;
        const popularityDifference = rawgPopularity(second) - rawgPopularity(first);
        if (popularityDifference) return popularityDifference;
        return trendScore(second) - trendScore(first);
      });
    const selected = candidates.find((product) => !usedGames.has(baseGameKey(product.nome))) || candidates[0];
    if (!selected) return;

    usedGames.add(baseGameKey(selected.nome));
    tile.href = `catalogo.html?genero=${encodeURIComponent(tile.dataset.categoryGenre)}`;
    tile.querySelector("[data-category-game]").textContent = displayProductName(selected);
    resolveCategoryImage(selected, (image) => {
      const artwork = document.createElement("img");
      artwork.className = "category-art";
      artwork.src = image;
      artwork.alt = `Capa de ${displayProductName(selected)}`;
      artwork.loading = "lazy";
      tile.querySelector(".category-art")?.remove();
      tile.prepend(artwork);
      tile.classList.add("category-ready");
    });
  });
}

function renderHomeRecommendation(products) {
  const section = document.querySelector("#escolha-recomendada");
  const recommendation = document.querySelector("[data-home-recommendation]");
  if (!section || !recommendation || !products.length) return;

  const featured = products
    .filter(isCuratedProduct)
    .sort((first, second) => curatedPriority(first) - curatedPriority(second) || variantScore(second) - variantScore(first))[0];
  const automaticPool = products.filter(isPopularHomeProduct);
  const selected = featured || [...(automaticPool.length ? automaticPool : products)].sort((first, second) => {
    const discountDifference = discountValue(second) - discountValue(first);
    if (discountDifference) return discountDifference;
    return Number(first.precoVendaEUR || 0) - Number(second.precoVendaEUR || 0);
  })[0];
  if (!selected) return;

  const name = displayProductName(selected);
  const originalPrice = Number(selected.precoOriginalEUR || 0);
  const salePrice = Number(selected.precoVendaEUR || 0);

  recommendation.href = `produto.html?id=${encodeURIComponent(selected.id)}`;
  resolveCatalogImage(selected, (image) => {
    recommendation.style.backgroundImage = `linear-gradient(90deg, rgba(18,18,18,.94), rgba(18,18,18,.45) 55%, rgba(18,18,18,.08)), url("${safeCatalogCssUrl(image)}")`;
  });
  recommendation.querySelector("[data-recommendation-platform]").textContent = repairCatalogText(selected.plataforma || "Consola");
  recommendation.querySelector("[data-recommendation-title]").textContent = name;
  recommendation.querySelector("[data-recommendation-copy]").textContent = `Poupa ${discountValue(selected)}% neste jogo digital. O acesso fica em Minha Conta > Meus Pedidos e também segue por email com instruções.`;
  recommendation.querySelector("[data-recommendation-old-price]").textContent = originalPrice > salePrice ? formatCatalogEUR(originalPrice) : "";
  recommendation.querySelector("[data-recommendation-price]").textContent = formatCatalogEUR(salePrice);
  section.hidden = false;
  window.observeRevealTargets?.();
}

function renderGenreFilters() {
  if (!catalogGenres || !catalogGenresGroup) return;

  const genres = [...new Set(allCatalogProducts().flatMap(productGenres))]
    .sort((first, second) => first.localeCompare(second, "pt-PT"));

  catalogGenres.innerHTML = genres.map((genre) => `
    <label>
      <input type="checkbox" value="${escapeCatalogHtml(normalizeCatalogText(genre))}" data-filter-genre ${catalogState.selectedGenres.has(normalizeCatalogText(genre)) ? "checked" : ""}>
      ${escapeCatalogHtml(genre)}
    </label>
  `).join("");
  catalogGenresGroup.hidden = genres.length === 0;
}

function resetCatalogPage() {
  catalogState.visibleCount = CATALOG_PAGE_SIZE;
  renderCatalog();
}

function openCatalogFilters() {
  catalogSidebar?.classList.add("open");
  document.body.classList.add("catalog-filters-open");
  catalogFilterOpen?.setAttribute("aria-expanded", "true");
}

function closeCatalogFilters() {
  catalogSidebar?.classList.remove("open");
  document.body.classList.remove("catalog-filters-open");
  catalogFilterOpen?.setAttribute("aria-expanded", "false");
}

function clearCatalogFilters() {
  catalogState.selectedPlatforms = new Set(Object.keys(CATALOG_FILES));
  catalogState.query = "";
  catalogState.minPrice = null;
  catalogState.maxPrice = null;
  catalogState.minDiscount = 0;
  catalogState.selectedGenres.clear();
  catalogState.sort = "relevance";
  catalogState.cheapMode = false;
  catalogState.preorderOnly = false;

  if (catalogSearch) catalogSearch.value = "";
  if (catalogMinPrice) catalogMinPrice.value = "";
  if (catalogMaxPrice) catalogMaxPrice.value = "";
  if (catalogSort) catalogSort.value = "relevance";
  document.querySelectorAll("[data-filter-discount], [data-filter-genre]").forEach((checkbox) => {
    checkbox.checked = false;
  });
  resetCatalogPage();
}

function applyCheapGamesFilter(maxPrice = CHEAP_GAMES_MAX_PRICE_EUR) {
  catalogState.selectedPlatforms = new Set(Object.keys(CATALOG_FILES));
  catalogState.minPrice = null;
  catalogState.maxPrice = Math.max(1, Number(maxPrice) || CHEAP_GAMES_MAX_PRICE_EUR);
  catalogState.minDiscount = 0;
  catalogState.selectedGenres.clear();
  catalogState.sort = "price-asc";
  catalogState.cheapMode = true;
  catalogState.preorderOnly = false;

  if (catalogMinPrice) catalogMinPrice.value = "";
  if (catalogMaxPrice) catalogMaxPrice.value = String(catalogState.maxPrice);
  if (catalogSort) catalogSort.value = "price-asc";
  document.querySelectorAll("[data-filter-discount], [data-filter-genre]").forEach((checkbox) => {
    checkbox.checked = false;
  });
}

function applyPreorderCatalogFilter() {
  catalogState.selectedPlatforms = new Set(Object.keys(CATALOG_FILES));
  catalogState.minPrice = null;
  catalogState.maxPrice = null;
  catalogState.minDiscount = 0;
  catalogState.selectedGenres.clear();
  catalogState.sort = "released-desc";
  catalogState.cheapMode = false;
  catalogState.preorderOnly = true;

  if (catalogMinPrice) catalogMinPrice.value = "";
  if (catalogMaxPrice) catalogMaxPrice.value = "";
  if (catalogSort) catalogSort.value = "released-desc";
  document.querySelectorAll("[data-filter-discount], [data-filter-genre]").forEach((checkbox) => {
    checkbox.checked = false;
  });
}

function bindCatalogControls() {
  catalogTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-catalog-platform]");
    if (!button) return;
    catalogState.activePlatform = button.dataset.catalogPlatform;
    catalogState.selectedPlatforms = new Set([button.dataset.catalogPlatform]);
    resetCatalogPage();
  });

  catalogSearch?.addEventListener("input", () => {
    catalogState.query = catalogSearch.value;
    resetCatalogPage();
  });

  catalogSidebar?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.matches("[data-filter-platform]")) {
      if (target.checked) catalogState.selectedPlatforms.add(target.value);
      else catalogState.selectedPlatforms.delete(target.value);
      catalogState.activePlatform = [...catalogState.selectedPlatforms][0] || "ps5";
    }

    if (target.matches("[data-filter-discount]")) {
      const checkedDiscounts = [...document.querySelectorAll("[data-filter-discount]:checked")]
        .map((checkbox) => Number(checkbox.value));
      catalogState.minDiscount = checkedDiscounts.length ? Math.max(...checkedDiscounts) : 0;
    }

    if (target.matches("[data-filter-genre]")) {
      if (target.checked) catalogState.selectedGenres.add(target.value);
      else catalogState.selectedGenres.delete(target.value);
    }

    resetCatalogPage();
  });

  [catalogMinPrice, catalogMaxPrice].forEach((input) => {
    input?.addEventListener("input", () => {
      const minValue = Number(catalogMinPrice?.value);
      const maxValue = Number(catalogMaxPrice?.value);
      catalogState.minPrice = catalogMinPrice?.value === "" ? null : Math.max(0, minValue);
      catalogState.maxPrice = catalogMaxPrice?.value === "" ? null : Math.max(0, maxValue);
      resetCatalogPage();
    });
  });

  catalogSort?.addEventListener("change", () => {
    catalogState.sort = catalogSort.value;
    resetCatalogPage();
  });

  catalogClearFilters?.addEventListener("click", clearCatalogFilters);
  catalogFilterOpen?.addEventListener("click", openCatalogFilters);
  catalogFilterClose?.addEventListener("click", closeCatalogFilters);
  catalogFilterBackdrop?.addEventListener("click", closeCatalogFilters);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCatalogFilters();
  });

  catalogLoadMore?.addEventListener("click", () => {
    catalogState.visibleCount += CATALOG_PAGE_SIZE;
    renderCatalog();
  });

}

function bindTrendPlatformFilters() {
  const buttons = [...document.querySelectorAll("[data-trend-platform]")];
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      activeTrendPlatform = button.dataset.trendPlatform || "all";
      buttons.forEach((item) => item.classList.toggle("active", item === button));
      renderHomeHighlights();
    });
  });
}

function bindHeroPlatformBar() {
  document.querySelectorAll(".hero-platform-bar [data-platform]").forEach((button) => {
    button.addEventListener("click", () => {
      const platform = button.dataset.platform || "";
      if (!platform) return;
      document.querySelectorAll(".hero-platform-bar [data-platform]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      window.location.href = `catalogo.html?plataforma=${encodeURIComponent(platform)}`;
    });
  });
}

async function initCatalogHome() {
  const hasHomeContent = Boolean(document.querySelector('[data-game-grid="trending"], [data-game-grid="catalogPreview"]'));
  if (!catalogGrid && !hasHomeContent) return;

  if (catalogGrid) bindCatalogControls();
  if (catalogGrid) renderCatalogSkeletons();
  try {
    await loadCatalogs();
    bindHeroPlatformBar();
    bindTrendPlatformFilters();
    renderHomeHighlights();
    observeRevealTargets();
    if (catalogGrid) {
      const initialParams = new URLSearchParams(window.location.search);
      const initialQuery = initialParams.get("busca")?.trim() || "";
      const initialGenre = initialParams.get("genero")?.trim() || "";
      const initialPlatform = platformParamToKey(initialParams.get("plataforma")?.trim() || "");
      const cheapMode = normalizeCatalogText(initialParams.get("ofertas") || "") === "baratas"
        || normalizeCatalogText(initialParams.get("preco") || "") === "barato";
      const preorderMode = ["1", "true", "sim", "pre-venda", "pre_venda"].includes(
        normalizeCatalogText(initialParams.get("pre_venda") || initialParams.get("prevenda") || initialParams.get("preorder") || "")
      );
      const initialMaxPrice = Number(initialParams.get("preco_max") || initialParams.get("max") || "");
      if (initialQuery) {
        catalogState.query = initialQuery;
        catalogState.selectedPlatforms = new Set(Object.keys(CATALOG_FILES));
        if (catalogSearch) catalogSearch.value = initialQuery;
      }
      if (initialGenre) {
        catalogState.selectedGenres = new Set([normalizeCatalogText(initialGenre)]);
        catalogState.selectedPlatforms = new Set(Object.keys(CATALOG_FILES));
      }
      if (initialPlatform) {
        catalogState.activePlatform = initialPlatform;
        catalogState.selectedPlatforms = new Set([initialPlatform]);
      }
      if (cheapMode) {
        applyCheapGamesFilter(Number.isFinite(initialMaxPrice) && initialMaxPrice > 0
          ? initialMaxPrice
          : CHEAP_GAMES_MAX_PRICE_EUR);
      } else if (preorderMode) {
        applyPreorderCatalogFilter();
      } else if (Number.isFinite(initialMaxPrice) && initialMaxPrice > 0) {
        catalogState.maxPrice = initialMaxPrice;
        if (catalogMaxPrice) catalogMaxPrice.value = String(catalogState.maxPrice);
      }
      renderGenreFilters();
      renderCatalog();
      observeRevealTargets();
    }
  } catch (error) {
    console.error(error);
    if (catalogStatus) catalogStatus.textContent = "Não foi possível carregar os produtos. Confirma se a página está a correr num servidor local.";
  }
}

initCatalogHome();
