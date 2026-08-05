const CATALOG_FILES = ["data/ps4.json", "data/ps5.json", "data/xbox-one.json", "data/xbox-series.json"];

const fallbackProducts = [
  {
    id: "gta-vi-ps5",
    nome: "Grand Theft Auto VI - PlayStation 5",
    plataforma: "PlayStation 5",
    precoVendaEUR: 57.99,
    precoOriginalEUR: 79.99,
    trailer: "https://www.youtube.com/embed/QdBZY2fkU-0",
    screenshots: [
      "assets/gta-vi-visual-beach-5k.webp",
      "assets/gta-vi-visual-city-sunset.jpg",
      "assets/gta-vi-visual-skyline.jpg",
      "assets/gta-vi-original.webp",
      "assets/gta-vi-visual-night-hdr.webp"
    ],
    descricao: "Grand Theft Auto VI leva-te ao estado de Leonida e às ruas luminosas de Vice City. Esta versão digital para PlayStation 5 é uma reserva de pré-lançamento com acesso disponível na conta GalaxyGame e envio por email quando estiver disponível.",
    imagemFallback: "assets/gta-vi-landscape-hq.webp",
    linkFornecedor: "",
    enriquecido: true,
    preorder: true,
    genres: ["Action", "Adventure"],
    tags: ["PlayStation 5", "Pré-lançamento", "Digital", "Mundo aberto", "Europa"]
  },
  {
    id: "gta-vi-xbox-series",
    nome: "Grand Theft Auto VI - Xbox Series X|S",
    plataforma: "Xbox Series X|S",
    precoVendaEUR: 69.99,
    precoOriginalEUR: 74.99,
    trailer: "https://www.youtube.com/embed/QdBZY2fkU-0",
    screenshots: [
      "assets/gta-vi-visual-beach-5k.webp",
      "assets/gta-vi-visual-city-sunset.jpg",
      "assets/gta-vi-visual-skyline.jpg",
      "assets/gta-vi-original.webp",
      "assets/gta-vi-visual-night-hdr.webp"
    ],
    descricao: "Grand Theft Auto VI em versão digital para Xbox Series X|S. Reserva antecipada com preço em euros, acesso disponível em Minha Conta > Meus Pedidos e envio por email com instruções claras para adicionares a conta na tua consola e descarregares pela biblioteca.",
    imagemFallback: "assets/gta-vi-landscape-hq.webp",
    linkFornecedor: "",
    enriquecido: true,
    preorder: true,
    genres: ["Action", "Adventure"],
    tags: ["Xbox Series X|S", "Pré-lançamento", "Digital", "Mundo aberto", "Europa"]
  }
];

const cartButton = document.querySelector(".cart-button");
const toast = document.createElement("div");
toast.className = "toast";
document.body.append(toast);
let productTrailerPlayer = null;

function formatEUR(value) {
  const number = Number(value || 0);
  return `${number.toFixed(2).replace(".", ",")} €`;
}

function discountPercent(product) {
  const original = Number(product?.precoOriginalEUR || 0);
  const sale = Number(product?.precoVendaEUR || 0);
  if (!original || !sale || sale >= original) return "Digital";
  return `-${Math.round((1 - sale / original) * 100)}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function repairDisplayText(value) {
  return String(value || "")
    .replace(/MÃDIA/g, "MÍDIA")
    .replace(/MÃ­DIA/g, "MÍDIA")
    .replace(/MÃÍDIA/g, "MÍDIA")
    .replace(/Ã/g, "Í")
    .replace(/Ã‰/g, "É")
    .replace(/Ã‡/g, "Ç")
    .replace(/Ãƒ/g, "Ã")
    .replace(/Ã/g, "Á")
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

function cleanProductTitle(value) {
  return repairDisplayText(value)
    .replace(/\s*-\s*(MIDIA|MÍDIA)\s+DIGITAL\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizedPlatformText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function productPlatformBadgeType(product) {
  const platform = normalizedPlatformText(`${product?.plataforma || ""} ${product?.catalogPlatform || ""}`);
  if (platform.includes("xbox")) return "xbox";
  if (platform.includes("playstation") || /\bps[45]\b/.test(platform)) return "playstation";
  return "console";
}

function productPlatformBadgeHtml(product) {
  const type = productPlatformBadgeType(product);
  const label = type === "xbox" ? "Xbox" : type === "playstation" ? "PlayStation" : "Consola";
  const icon = type === "xbox"
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5.4 5.3c-2.2.2-4 1.2-5.4 2.8-1.4-1.6-3.2-2.6-5.4-2.8A8 8 0 0 1 12 4c2.1 0 4 .8 5.4 3.3ZM4.5 12c0-1 .2-1.9.5-2.7 1.9.6 3.5 1.6 4.8 3L6.1 17A7.5 7.5 0 0 1 4.5 12Zm3.2 6.3 4.3-4.5 4.3 4.5a7.4 7.4 0 0 1-8.6 0Zm10.2-1.3-3.7-4.7c1.3-1.4 2.9-2.4 4.8-3 .3.8.5 1.7.5 2.7 0 1.9-.6 3.6-1.6 5Z"/></svg>`
    : `<span aria-hidden="true">PS</span>`;
  return `<span class="platform-logo-badge ${type}" aria-label="${escapeHtml(label)}">${icon}</span>`;
}

function productNewsTitle(value) {
  return cleanProductTitle(value)
    .replace(/\s*-?\s*(midia|mídia|media)\s+digital\s*$/i, "")
    .replace(/\s*-\s*(playstation\s*[45]|ps[45]|xbox\s+one.*|xbox\s+series.*)$/i, "")
    .replace(/\s+(playstation\s*[45]|ps[45]|xbox\s+one.*|xbox\s+series.*)$/i, "")
    .trim();
}

function safeCssUrl(value) {
  return String(value || "").replace(/["'\\\n\r]/g, "");
}

function productImage(product) {
  return productImageCandidates(product)[0];
}

function isSupplierImageSource(product, source) {
  const normalized = String(source || "").trim();
  if (!normalized) return false;
  const supplierImages = new Set([
    product?.imagemFallback,
    product?.imagemPrincipal
  ].filter(Boolean));
  return supplierImages.has(normalized)
    || /mitiendanube|alphagames|stores\/006\/141\/249\/products/i.test(normalized);
}

function productImageCandidates(product) {
  const screenshots = Array.isArray(product?.screenshots) ? product.screenshots : [];
  const cleanScreenshots = screenshots.filter((source) => !isSupplierImageSource(product, source));
  const supplierScreenshots = screenshots.filter((source) => isSupplierImageSource(product, source));
  const candidates = [
    product?.capaSteamGridDB,
    ...cleanScreenshots,
    product?.imagemPrincipal,
    product?.imagemFallback,
    ...supplierScreenshots,
    "assets/gta-vi-landscape-hq.webp"
  ];

  return [...new Set(candidates.filter((value) => typeof value === "string" && value.trim()))];
}

function productHeroImageCandidates(product) {
  const screenshots = Array.isArray(product?.screenshots) ? product.screenshots : [];
  const cleanScreenshots = screenshots.filter((source) => !isSupplierImageSource(product, source));
  const supplierScreenshots = screenshots.filter((source) => isSupplierImageSource(product, source));
  const candidates = [
    product?.capaSteamGridDB,
    ...cleanScreenshots,
    product?.imagemPrincipal,
    product?.imagemFallback,
    ...supplierScreenshots,
    "assets/gta-vi-landscape-hq.webp"
  ];

  return [...new Set(candidates.filter((value) => typeof value === "string" && value.trim()))];
}

function productBackgroundImageCandidates(product) {
  const visualImages = Array.isArray(product?.screenshots) ? product.screenshots : [];
  return [...new Set([
    ...visualImages,
    product?.imagemFallback,
    product?.imagemPrincipal,
    product?.capaSteamGridDB,
    "assets/gta-vi-landscape-hq.webp"
  ].filter((value) => typeof value === "string" && value.trim()))];
}

function resolveProductImage(product, callback, candidates = productImageCandidates(product)) {
  let index = 0;

  function tryNext() {
    const source = candidates[index];
    if (!source) return;
    const image = new Image();
    image.onload = () => callback(source, image);
    image.onerror = () => {
      index += 1;
      tryNext();
    };
    image.src = source;
  }

  tryNext();
}

function showToast(message, duration = 1900) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), duration);
}

function isPreorderProduct(product) {
  if (product.preorder === true) return true;
  if (/(^|\s)(ea sports\s*)?fc\s*27(\s|$)/i.test(String(product.nome || product.name || ""))) return true;
  if (Array.isArray(product.tags) && product.tags.some((tag) => /pre.?lan[cç]amento|pre.?venda/i.test(String(tag)))) return true;
  if (!product.released || String(product.released).toLowerCase() === "tbd") return false;

  const releaseDate = new Date(`${product.released}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Number.isFinite(releaseDate.getTime()) && releaseDate > today;
}

function addToCart(product) {
  const productName = cleanProductTitle(product.nome);
  const added = window.ConsoleCart?.add({
    id: product.id,
    name: productName,
    platform: repairDisplayText(product.plataforma || "Consola"),
    price: product.precoVendaEUR,
    originalPrice: product.precoOriginalEUR,
    image: productImage(product),
    preorder: isPreorderProduct(product)
  });
  if (added && cartButton) {
    cartButton.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }],
      { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
  }
  showToast(added ? `${productName} adicionado ao carrinho` : `${productName} já está no carrinho`);
}

let buyNowInFlight = false;

function buyNowButtons() {
  return document.querySelectorAll(".buy-button, .edition-buy-button, [data-mobile-buy-button]");
}

async function buyNow(product) {
  if (buyNowInFlight) return;
  buyNowInFlight = true;

  const buttons = buyNowButtons();
  const originalLabels = new Map();
  buttons.forEach((button) => {
    originalLabels.set(button, button.textContent);
    button.disabled = true;
    button.textContent = "A preparar pagamento...";
  });

  const restoreButtons = () => {
    buttons.forEach((button) => {
      button.disabled = false;
      button.textContent = originalLabels.get(button) || button.textContent;
    });
    buyNowInFlight = false;
  };

  const identity = window.netlifyIdentity;
  const user = identity?.currentUser?.();
  if (!identity || !user) {
    restoreButtons();
    showToast("Inicia sessão para continuar a compra", 3200);
    identity?.open("login");
    return;
  }

  try {
    const token = await user.jwt();
    const response = await fetch("/.netlify/functions/criar-checkout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        items: [{ id: product.id }],
        cancelUrl: `produto.html?id=${encodeURIComponent(product.id)}`
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      identity.open("login");
      throw new Error("login_required");
    }
    if (!response.ok || !data.checkoutUrl) throw new Error(data.error || "checkout_failed");
    window.location.href = data.checkoutUrl;
  } catch (error) {
    console.error("[buy-now]", error.message);
    restoreButtons();
    showToast("Não foi possível iniciar o pagamento. Tenta novamente ou contacta gamegalaxy26@gmail.com", 4200);
  }
}

function getProductId() {
  return new URLSearchParams(window.location.search).get("id") || "gta-vi-ps5";
}

async function loadCatalogs() {
  const loaded = await Promise.all(
    CATALOG_FILES.map(async (file) => {
      try {
        const response = await fetch(file, { cache: "no-store" });
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    })
  );

  const products = loaded.flat();
  if (!products.length) return fallbackProducts;

  const catalogIds = new Set(products.map((product) => product.id));
  const manualProducts = fallbackProducts.filter((product) => !catalogIds.has(product.id));
  return [...manualProducts, ...products];
}

function productTags(product) {
  return product.tags?.length
    ? product.tags
    : [product.plataforma, "Digital", product.enriquecido ? "Com visuais" : "Imagem do fornecedor"].filter(Boolean);
}

function productSpecs(product) {
  const platform = repairDisplayText(product.plataforma);
  return [
    ["Compatibilidade", platform],
    ["Formato", "Conteúdo digital"],
    ["Entrega", "Conta GalaxyGame + email"],
    ["Pagamento", "Preço final em euros"],
    ["Apoio", "Antes e depois da compra"]
  ];
}

function productFeatures(product) {
  return product.features?.length
    ? product.features
    : [
        ["▣", "Entrega digital"],
        ["♙", "Um jogador"],
        ["▤", product.enriquecido ? "Visuais oficiais" : "Imagem do fornecedor"],
        ["↔", repairDisplayText(product.plataforma)]
      ];
}

function renderBackground(product) {
  const hero = document.querySelector(".product-hero-bg");
  const cover = document.querySelector(".cover-art");

  resolveProductImage(product, (image, loadedImage) => {
    const background = `url("${safeCssUrl(image)}")`;
    const imageRatio = loadedImage.naturalWidth / loadedImage.naturalHeight;
    const coverWidth = Math.min(620, Math.round(520 * imageRatio));
    cover.classList.toggle("supplier-cover-clean", isSupplierImageSource(product, image));
    cover.style.aspectRatio = `${loadedImage.naturalWidth} / ${loadedImage.naturalHeight}`;
    cover.style.setProperty("--cover-ideal-width", `${coverWidth}px`);
    cover.parentElement.style.setProperty("--product-cover-width", `${coverWidth}px`);
    cover.style.backgroundImage = background;
    cover.dataset.zoomSrc = image;
  }, productHeroImageCandidates(product));

  resolveProductImage(product, (image) => {
    const background = `url("${safeCssUrl(image)}")`;
    hero.style.backgroundImage =
      `linear-gradient(180deg, rgba(0,0,0,.1), rgba(39,39,39,.4) 64%, #272727 100%), linear-gradient(90deg, rgba(0,0,0,.62), rgba(0,0,0,.04) 48%, rgba(0,0,0,.42)), ${background}`;
  }, productBackgroundImageCandidates(product));
}

function renderHero(product) {
  const productName = cleanProductTitle(product.nome);
  const newsContext = {
    name: productNewsTitle(product.nome),
    images: [...new Set([
      ...(Array.isArray(product.screenshots) ? product.screenshots : []),
      product.capaSteamGridDB,
      product.imagemFallback,
      product.imagemPrincipal
    ].filter(Boolean))]
  };
  window.productNewsContext = newsContext;
  document.body.dataset.productNewsQuery = newsContext.name;
  window.dispatchEvent(new CustomEvent("product-news-ready", { detail: newsContext }));
  document.title = `${productName} | GalaxyGame`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", repairDisplayText(product.descricao || productName));
  document.querySelector(".cover-art").setAttribute("aria-label", `Ampliar capa de ${productName}`);
  document.querySelector(".release-note").textContent = "Jogo digital para consola";
  document.querySelector(".buy-panel h1").textContent = productName;
  document.querySelector(".edition-pill").textContent = "Edição digital - Conta GalaxyGame + email";
  document.querySelector(".stock-line").textContent = "Preço final em euros · Compra com informação clara";
  document.querySelector("[data-product-platform]").textContent = repairDisplayText(product.plataforma || "Consola");
  document.querySelector("[data-product-edition]").textContent = "Edição digital";
  document.querySelector(".old-price").textContent = product.precoOriginalEUR ? formatEUR(product.precoOriginalEUR) : "";
  document.querySelector(".discount").textContent = product.precoOriginalEUR
    ? `-${Math.max(0, Math.round((1 - product.precoVendaEUR / product.precoOriginalEUR) * 100))}%`
    : "Digital";
  document.querySelector(".price-line strong").textContent = formatEUR(product.precoVendaEUR);
  document.querySelector(".buy-button").textContent = isPreorderProduct(product) ? "Pré-venda" : "Comprar agora";
  renderMobileBuyBar(product);
  renderBackground(product);
}

function renderMobileBuyBar(product) {
  let bar = document.querySelector(".mobile-buy-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "mobile-buy-bar";
    bar.innerHTML = `
      <div>
        <span data-mobile-buy-platform></span>
        <strong data-mobile-buy-price></strong>
      </div>
      <button type="button" data-mobile-buy-button></button>
    `;
    document.body.append(bar);
  }

  bar.querySelector("[data-mobile-buy-platform]").textContent = repairDisplayText(product.plataforma || "Consola");
  bar.querySelector("[data-mobile-buy-price]").textContent = formatEUR(product.precoVendaEUR);
  bar.querySelector("[data-mobile-buy-button]").textContent = isPreorderProduct(product) ? "Pré-venda" : "Comprar agora";
}

function renderAbout(product) {
  const about = document.querySelector("[data-product-about]");
  about.innerHTML = `
    <p>${escapeHtml(repairDisplayText(product.descricaoPT || product.descricao || "Jogo digital para consola, com acesso guardado na tua conta GalaxyGame e instruções enviadas por email."))}</p>
    <p>Confirma a plataforma antes do pagamento. Depois da confirmação do pagamento, o jogo fica disponível em até 10 minutos em Minha Conta &gt; Meus Pedidos e também é enviado por email, com as instruções de ativação para adicionares a conta à consola e descarregares pela biblioteca.</p>
  `;

  document.querySelector("[data-product-tags]").innerHTML = productTags(product)
    .map((tag) => `<span>${escapeHtml(repairDisplayText(tag))}</span>`)
    .join("");

  document.querySelector("[data-product-specs]").innerHTML = productSpecs(product)
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`)
    .join("");
}

function renderEditions(product) {
  const original = product.precoOriginalEUR ? `<span>${formatEUR(product.precoOriginalEUR)}</span>` : "";
  const platform = repairDisplayText(product.plataforma || "");
  const editionImage = productImage(product);
  document.querySelector("[data-product-editions]").innerHTML = `
    <article class="edition-card active">
      <div class="edition-img standard ${isSupplierImageSource(product, editionImage) ? "supplier-cover-clean" : ""}" style="background-image: url('${safeCssUrl(editionImage)}')"></div>
      <h3>Edição Digital ${escapeHtml(platform)}</h3>
      <ul>
        <li>Disponível em até 10 minutos em Minha Conta &gt; Meus Pedidos</li><li>Envio por email com instruções</li>
        <li>Instruções de ativação incluídas</li>
        <li>Compatibilidade: ${escapeHtml(platform || "consola")}</li>
      </ul>
      <div class="edition-price">${original}<strong>${formatEUR(product.precoVendaEUR)}</strong></div>
      <button type="button" class="edition-buy-button">${isPreorderProduct(product) ? "Pré-venda" : "Comprar agora"}</button>
      <button type="button" class="cart-add-button">Adicionar ao carrinho</button>
    </article>
  `;
}

function youtubeVideoId(value) {
  const match = String(value || "").match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
  return match?.[1] || "";
}

function validProductTrailer(value) {
  return typeof value === "string" && /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{6,}/.test(value.trim());
}

function loadYouTubePlayerApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (window.ConsoleYouTubeApiReady) return window.ConsoleYouTubeApiReady;

  window.ConsoleYouTubeApiReady = new Promise((resolve) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousCallback === "function") previousCallback();
      resolve(window.YT);
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.append(script);
    }
  });

  return window.ConsoleYouTubeApiReady;
}

function destroyProductTrailer() {
  if (productTrailerPlayer?.destroy) {
    try {
      productTrailerPlayer.destroy();
    } catch {
      // The YouTube player can already be gone after a fast page rerender.
    }
  }
  productTrailerPlayer = null;
}

function renderTrailer(product, productName) {
  const trailerSection = document.querySelector("[data-product-trailer-section]");
  const video = document.querySelector("[data-product-video]");
  const videoId = youtubeVideoId(product.trailer);

  destroyProductTrailer();
  trailerSection.hidden = true;
  video.innerHTML = "";
  if (!videoId) return;

  const playerTarget = document.createElement("div");
  const playerId = `product-trailer-${videoId}-${Date.now()}`;
  playerTarget.id = playerId;
  video.append(playerTarget);

  const hideBrokenTrailer = (errorCode) => {
    console.warn("Trailer indisponível, ocultado no produto.", {
      productId: product.id,
      videoId,
      errorCode
    });
    destroyProductTrailer();
    trailerSection.hidden = true;
    video.innerHTML = "";
  };

  loadYouTubePlayerApi()
    .then((YT) => {
      if (!document.getElementById(playerId)) return;
      productTrailerPlayer = new YT.Player(playerId, {
        videoId,
        playerVars: {
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
          origin: window.location.origin
        },
        events: {
          onReady: () => {
            trailerSection.hidden = false;
          },
          onError: (event) => hideBrokenTrailer(event?.data)
        }
      });
      const trailerIframe = productTrailerPlayer.getIframe?.();
      trailerIframe?.setAttribute("title", `${productName} - Trailer`);
    })
    .catch(() => hideBrokenTrailer("api_load_failed"));
}

function renderVisuals(product) {
  const productName = cleanProductTitle(product.nome);
  const screenshots = (product.screenshots?.length ? product.screenshots : [productImage(product)]).filter(Boolean).slice(0, 5);
  document.querySelector("[data-product-screenshots]").innerHTML = screenshots
    .map((src, index) => {
      const classes = ["screen", index === 0 ? "large" : "", index === 4 ? "wide" : ""].filter(Boolean).join(" ");
      return `<button class="${classes}" type="button" style="background-image: url('${safeCssUrl(src)}')" data-zoom-src="${escapeHtml(src)}" aria-label="Abrir imagem em zoom"></button>`;
    })
    .join("");

  if (!product.trailer) {
    document.querySelector("[data-product-trailer-section]").hidden = true;
    return;
  }
  renderTrailer(product, productName);
}

function renderDetails(product) {
  document.querySelector("[data-product-features]").innerHTML = productFeatures(product)
    .map(([icon, label]) => `<div><span>${escapeHtml(icon)}</span><strong>${escapeHtml(label)}</strong></div>`)
    .join("");

  document.querySelector("[data-product-description-title]").textContent = cleanProductTitle(product.nome);
  document.querySelector("[data-product-description]").textContent =
    repairDisplayText(product.descricaoPT || product.descricao || "Jogo digital para consola, com acesso na conta GalaxyGame, envio por email e apoio antes e depois da compra.");

  const platform = repairDisplayText(product.plataforma || "Consola compativel");
  document.querySelector("[data-product-config]").innerHTML = `
    <article>
      <h3>minimo*</h3>
      <p><span>Plataforma:</span> ${escapeHtml(platform)}</p>
      <p><span>Formato:</span> Conteúdo digital</p>
      <p><span>Entrega:</span> Até 10 minutos em Minha Conta &gt; Meus Pedidos + email</p>
      <p><span>Internet:</span> Necessária para ativação e transferência</p>
      <p><span>Conta:</span> Conta compatível com a consola</p>
    </article>
    <article>
      <h3>recomendado*</h3>
      <p><span>Plataforma:</span> ${escapeHtml(platform)}</p>
      <p><span>Armazenamento:</span> Espaço livre para a transferência completa</p>
      <p><span>Ligação:</span> Banda larga estável</p>
      <p><span>Imagem:</span> TV 4K/HDR quando disponível</p>
      <p><span>Nota:</span> Confirma sempre a plataforma antes de comprar</p>
    </article>
  `;
}

function normalizedGenres(product) {
  if (!Array.isArray(product?.genres)) return [];
  return product.genres
    .map((genre) => repairDisplayText(typeof genre === "string" ? genre : genre?.name).toLowerCase())
    .filter(Boolean);
}

function sameProductPlatform(first, second) {
  return repairDisplayText(first?.plataforma).toLowerCase() === repairDisplayText(second?.plataforma).toLowerCase();
}

function releaseTimestamp(product) {
  const timestamp = Date.parse(product?.released || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeRelatedText(value) {
  return repairDisplayText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function relatedGameKey(product) {
  const normalized = normalizeRelatedText(cleanProductTitle(product?.nome));
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

function relatedImageKey(product) {
  const source = productImage(product) || "";
  const cleanSource = normalizeRelatedText(source)
    .replace(/^https?:\/\//, "")
    .replace(/[?#].*$/, "")
    .replace(/-\d+x\d+(?=\.[a-z0-9]+$)/g, "")
    .trim();

  if (!cleanSource || cleanSource.includes("gta-vi-landscape-hq")) return "";
  return cleanSource;
}

function discountValue(product) {
  const original = Number(product?.precoOriginalEUR || 0);
  const sale = Number(product?.precoVendaEUR || 0);
  if (!original || !sale || sale >= original) return 0;
  return Math.round((1 - sale / original) * 100);
}

const searchedGameBoosts = [
  ["grand theft auto", 9000],
  ["gta", 9000],
  ["minecraft", 8500],
  ["ea sports fc", 8000],
  ["fifa", 7600],
  ["call of duty", 7400],
  ["god of war", 7000],
  ["the last of us", 6800],
  ["spider man", 6600],
  ["red dead", 6400],
  ["hogwarts legacy", 6200],
  ["elden ring", 6000],
  ["assassin", 5600],
  ["resident evil", 5400],
  ["battlefield", 5200],
  ["mortal kombat", 5000],
  ["cyberpunk", 4800],
  ["the witcher", 4600],
  ["forza", 4400],
  ["nba", 4200],
  ["wwe", 4000],
  ["sonic", 3800],
  ["lego", 3600],
  ["tomb raider", 3400]
];

function searchedGameBoost(product) {
  const name = normalizeRelatedText(cleanProductTitle(product?.nome));
  const match = searchedGameBoosts.find(([keyword]) => name.includes(keyword));
  return match ? match[1] : 0;
}

function popularityScore(product) {
  const rawgPopularity = Math.max(Number(product?.added || 0), Number(product?.ratings_count || 0));
  const rating = Number(product?.rating || 0);
  return rawgPopularity + rating * 350 + discountValue(product) * 25 + searchedGameBoost(product);
}

function chooseBestVariant(products) {
  return [...products].sort((first, second) => {
    const popularityDifference = popularityScore(second) - popularityScore(first);
    if (popularityDifference) return popularityDifference;

    const discountDifference = discountValue(second) - discountValue(first);
    if (discountDifference) return discountDifference;

    return Number(first.precoVendaEUR || 9999) - Number(second.precoVendaEUR || 9999);
  })[0];
}

function uniqueRelatedGames(products) {
  const groups = new Map();

  products.forEach((product) => {
    const key = relatedGameKey(product) || product.id;
    const group = groups.get(key) || [];
    group.push(product);
    groups.set(key, group);
  });

  const selected = [];
  const usedImages = new Set();

  [...groups.values()]
    .map(chooseBestVariant)
    .filter(Boolean)
    .forEach((product) => {
      const imageKey = relatedImageKey(product);
      if (imageKey && usedImages.has(imageKey)) return;
      if (imageKey) usedImages.add(imageKey);
      selected.push(product);
    });

  return selected;
}

function similarityScore(product, current) {
  const currentGenres = new Set(normalizedGenres(current));
  const sharedGenres = normalizedGenres(product).filter((genre) => currentGenres.has(genre)).length;
  return sharedGenres * 100 + (sameProductPlatform(product, current) ? 25 : 0);
}

function renderProductGrid(container, products) {
  if (!container) return;
  container.innerHTML = products.map((item) => `
    <article>
      <a class="related-card-link" href="produto.html?id=${encodeURIComponent(item.id)}" ${validProductTrailer(item.trailer) ? `data-trailer="${escapeHtml(item.trailer)}"` : ""}>
        <div class="mini-cover">
          <img alt="" loading="lazy">
          <span class="tag">${escapeHtml(discountPercent(item))}</span>
          ${productPlatformBadgeHtml(item)}
        </div>
        <h3>${escapeHtml(cleanProductTitle(item.nome))}</h3>
        <strong>${formatEUR(item.precoVendaEUR)}</strong>
      </a>
    </article>
  `).join("");

  container.querySelectorAll(".mini-cover img").forEach((image, index) => {
    const product = products[index];
    const cover = image.closest(".mini-cover");
    const candidates = productImageCandidates(product);
    let candidateIndex = 0;
    const setImageSource = (source) => {
      cover?.classList.toggle("supplier-cover-clean", isSupplierImageSource(product, source));
      image.src = source;
    };
    image.addEventListener("error", () => {
      candidateIndex += 1;
      if (candidates[candidateIndex]) setImageSource(candidates[candidateIndex]);
    });
    setImageSource(candidates[0]);
  });
}

function renderRelated(products, current) {
  const currentKey = relatedGameKey(current);
  const available = products.filter((item) => item.id !== current.id && relatedGameKey(item) !== currentKey);
  const moreDigital = uniqueRelatedGames(available)
    .sort((first, second) => popularityScore(second) - popularityScore(first) || releaseTimestamp(second) - releaseTimestamp(first))
    .slice(0, 6);
  const moreKeys = new Set(moreDigital.map((item) => relatedGameKey(item)));

  const similar = uniqueRelatedGames(available
    .filter((item) => similarityScore(item, current) > 0)
    .filter((item) => !moreKeys.has(relatedGameKey(item))))
    .sort((first, second) => similarityScore(second, current) - similarityScore(first, current) || popularityScore(second) - popularityScore(first))
    .slice(0, 6);

  renderProductGrid(document.querySelector("[data-product-related]"), moreDigital);
  const similarContainer = document.querySelector("[data-product-similar]");
  if (similar.length) renderProductGrid(similarContainer, similar);
  else similarContainer.innerHTML = "<p>Sem produtos semelhantes carregados.</p>";
}

function bindProductActions(product) {
  buyNowButtons().forEach((button) => {
    button.addEventListener("click", () => buyNow(product));
  });

  document.querySelectorAll(".cart-add-button").forEach((button) => {
    button.addEventListener("click", () => addToCart(product));
  });

  document.querySelector(".wish-button")?.addEventListener("click", () => {
    showToast("Adicionado aos favoritos");
  });
}

function bindLightbox() {
  const lightbox = document.createElement("div");
  lightbox.className = "image-lightbox";
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-label", "Imagem ampliada");
  lightbox.innerHTML = `
    <button class="lightbox-close" type="button" aria-label="Fechar imagem">×</button>
    <img alt="Imagem ampliada do produto">
  `;
  document.body.append(lightbox);

  const lightboxImage = lightbox.querySelector("img");
  const closeButton = lightbox.querySelector(".lightbox-close");

  function closeLightbox() {
    lightbox.classList.remove("open");
    document.body.style.overflow = "";
  }

  document.body.addEventListener("click", (event) => {
    const item = event.target.closest("[data-zoom-src]");
    if (!item) return;
    lightboxImage.src = item.dataset.zoomSrc;
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
    closeButton.focus();
  });

  closeButton.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox.classList.contains("open")) closeLightbox();
  });
}

async function initProductPage() {
  const products = await loadCatalogs();
  const productId = getProductId();
  const product = products.find((item) => item.id === productId) || products[0] || fallbackProducts[0];

  renderHero(product);
  renderAbout(product);
  renderEditions(product);
  renderVisuals(product);
  renderDetails(product);
  renderRelated(products, product);
  bindProductActions(product);
  bindLightbox();
}

initProductPage();

