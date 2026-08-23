const HEADER_CATALOG_FILES = [
  { file: "data/ps4.json", platform: "PlayStation 4" },
  { file: "data/ps5.json", platform: "PlayStation 5" },
  { file: "data/xbox-one.json", platform: "Xbox One" },
  { file: "data/xbox-series.json", platform: "Xbox Series X|S" }
];

const HEADER_MANUAL_PRODUCTS = [
  {
    id: "gta-vi-ps5",
    nome: "Grand Theft Auto VI - Midia Digital PlayStation 5",
    plataforma: "PlayStation 5",
    precoVendaEUR: 57.99,
    precoOriginalEUR: 79.99,
    capaSteamGridDB: "assets/gta-vi-original.webp",
    imagemFallback: "assets/gta-vi-landscape-hq.webp",
    aliasesBusca: ["gta vi", "gta 6", "grand theft auto vi", "grand theft auto 6"]
  },
  {
    id: "gta-vi-xbox-series",
    nome: "Grand Theft Auto VI - Midia Digital Xbox Series X|S",
    plataforma: "Xbox Series X|S",
    precoVendaEUR: 69.99,
    precoOriginalEUR: 74.99,
    capaSteamGridDB: "assets/gta-vi-original.webp",
    imagemFallback: "assets/gta-vi-landscape-hq.webp",
    aliasesBusca: ["gta vi", "gta 6", "grand theft auto vi", "grand theft auto 6"]
  }
];

let headerCatalogPromise = null;

function escapeHeaderHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeHeaderText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function compactHeaderText(value) {
  return normalizeHeaderText(value).replace(/[^a-z0-9]+/g, "");
}

function repairHeaderText(value) {
  return String(value || "")
    .replace(/MÃ­dia/g, "Midia")
    .replace(/CÃ³digo/g, "Codigo")
    .replace(/PrÃ©/g, "Pre")
    .replace(/LanÃ§amento/g, "Lancamento")
    .replace(/EdiÃ§Ã£o/g, "Edicao");
}

function displayHeaderProductName(product) {
  return repairHeaderText(product.nome || product.name || "Jogo digital");
}

function headerProductImage(product) {
  const candidates = [
    product.capaSteamGridDB,
    product.background_image,
    product.imagemRAWG,
    Array.isArray(product.screenshots) ? product.screenshots[0] : "",
    product.imagemFallback,
    product.image,
    "assets/gta-vi-landscape-hq.webp"
  ];
  return candidates.find(Boolean);
}

function headerProductPrice(product) {
  return Number(product.precoVendaEUR ?? product.price ?? product.preco ?? 0);
}

function formatHeaderEUR(value) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function headerSearchBlob(product) {
  return normalizeHeaderText([
    product.nome,
    product.name,
    product.plataforma,
    product.platform,
    ...(product.aliasesBusca || [])
  ].filter(Boolean).join(" "));
}

function headerCompactSearchBlob(product) {
  return compactHeaderText([
    product.nome,
    product.name,
    product.plataforma,
    product.platform,
    ...(product.aliasesBusca || [])
  ].filter(Boolean).join(" "));
}

function loadHeaderCatalog() {
  if (headerCatalogPromise) return headerCatalogPromise;
  headerCatalogPromise = (window.__galaxyCatalogLitePromise ||= fetch("data/catalog-lite.json", { cache: "default" })
    .then((response) => {
      if (!response.ok) throw new Error("catalog-lite indisponivel");
      return response.json();
    }))
    .then((items) => Array.isArray(items) ? items : [])
    .catch(() => Promise.all(HEADER_CATALOG_FILES.map(({ file, platform }) =>
      fetch(file, { cache: "default" })
        .then((response) => (response.ok ? response.json() : []))
        .then((items) => Array.isArray(items) ? items.map((product) => ({ ...product, plataforma: product.plataforma || platform })) : [])
        .catch(() => [])
    )).then((groups) => groups.flat()))
    .then((products) => {
    const ids = new Set(products.map((product) => product.id));
    HEADER_MANUAL_PRODUCTS.forEach((product) => {
      if (!ids.has(product.id)) products.unshift(product);
    });
    return products.map((product) => ({
      ...product,
      _searchBlob: headerSearchBlob(product),
      _compactSearchBlob: headerCompactSearchBlob(product)
    }));
  });
  return headerCatalogPromise;
}

function mountSearchPreview(form) {
  const input = form.querySelector('input[name="busca"]');
  if (!input || form.dataset.previewReady === "true") return;
  form.dataset.previewReady = "true";

  const closeButton = document.createElement("button");
  closeButton.className = "header-search-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Fechar pesquisa");
  closeButton.textContent = "×";
  form.insertBefore(closeButton, input);

  const panel = document.createElement("div");
  panel.className = "search-preview";
  panel.dataset.searchPreview = "";
  panel.hidden = true;
  form.append(panel);

  let debounceTimer = 0;

  function hidePreview() {
    panel.hidden = true;
    panel.innerHTML = "";
  }

  function closeMobileSearch() {
    form.classList.remove("expanded");
    hidePreview();
    input.blur();
  }

  function renderResults(query, products) {
    const normalized = normalizeHeaderText(query);
    const compactQuery = compactHeaderText(query);
    if (!normalized) {
      hidePreview();
      return;
    }

    const matches = products
      .filter((product) => product._searchBlob.includes(normalized)
        || (compactQuery && product._compactSearchBlob.includes(compactQuery)))
      .sort((a, b) => {
        const aName = normalizeHeaderText(displayHeaderProductName(a));
        const bName = normalizeHeaderText(displayHeaderProductName(b));
        const exactBias = Number(bName.startsWith(normalized)) - Number(aName.startsWith(normalized));
        if (exactBias) return exactBias;
        return headerProductPrice(b) - headerProductPrice(a);
      });

    if (!matches.length) {
      panel.innerHTML = `<div class="search-preview-empty">Nenhum jogo encontrado</div>`;
      panel.hidden = false;
      return;
    }

    const visible = matches.slice(0, 6);
    panel.innerHTML = `
      <div class="search-preview-list">
        ${visible.map((product) => `
          <a class="search-preview-item" href="produto.html?id=${encodeURIComponent(product.id)}">
            <img src="${escapeHeaderHtml(headerProductImage(product))}" alt="" width="80" height="120" loading="lazy" decoding="async">
            <span>
              <strong>${escapeHeaderHtml(displayHeaderProductName(product))}</strong>
              <small>${escapeHeaderHtml(product.plataforma || product.platform || "Jogo digital")}</small>
            </span>
            <b>${formatHeaderEUR(headerProductPrice(product))}</b>
          </a>
        `).join("")}
      </div>
      ${matches.length > visible.length ? `<a class="search-preview-all" href="catalogo.html?busca=${encodeURIComponent(query)}">Ver todos os resultados</a>` : ""}
    `;
    panel.hidden = false;
  }

  input.addEventListener("input", () => {
    window.clearTimeout(debounceTimer);
    const query = input.value.trim();
    debounceTimer = window.setTimeout(() => {
      if (!query) {
        hidePreview();
        return;
      }
      panel.innerHTML = `<div class="search-preview-empty">A procurar...</div>`;
      panel.hidden = false;
      loadHeaderCatalog().then((products) => renderResults(query, products));
    }, 200);
  });

  input.addEventListener("focus", () => {
    const query = input.value.trim();
    if (query) loadHeaderCatalog().then((products) => renderResults(query, products));
  });

  form.addEventListener("submit", hidePreview);
  closeButton.addEventListener("click", closeMobileSearch);
  document.addEventListener("click", (event) => {
    if (!form.contains(event.target)) {
      hidePreview();
      form.classList.remove("expanded");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hidePreview();
      form.classList.remove("expanded");
    }
  });
}

document.querySelectorAll(".header-search").forEach((form) => {
  const input = form.querySelector('input[name="busca"]');
  const currentQuery = new URLSearchParams(window.location.search).get("busca");
  if (currentQuery && input) input.value = currentQuery;
  mountSearchPreview(form);

  if (form.dataset.searchSubmitReady !== "true") {
    form.dataset.searchSubmitReady = "true";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (window.matchMedia("(max-width: 620px)").matches && !form.classList.contains("expanded")) {
        form.classList.add("expanded");
        window.setTimeout(() => input?.focus(), 30);
        loadHeaderCatalog();
        return;
      }
      const query = input?.value.trim() || "";
      window.location.href = query
        ? `catalogo.html?busca=${encodeURIComponent(query)}`
        : "catalogo.html";
    });
  }

});

document.querySelector(".hero-search")?.addEventListener("click", () => {
  const input = document.querySelector(".header-search input");
  input?.focus();
  input?.closest(".header-search")?.classList.add("expanded");
});

(() => {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const strip = document.querySelector(".mobile-platform-strip");
  const mobileQuery = window.matchMedia("(max-width: 640px)");
  let lastScrollY = window.scrollY;
  let updateQueued = false;

  const updateHeaderState = () => {
    updateQueued = false;
    const currentScrollY = window.scrollY;
    header.classList.toggle("is-scrolled", currentScrollY > 12);

    if (strip && mobileQuery.matches) {
      const scrollingDown = currentScrollY > lastScrollY && currentScrollY > 120;
      const scrollingUp = currentScrollY < lastScrollY || currentScrollY <= 20;
      if (scrollingDown) document.body.classList.add("mobile-platform-hidden");
      if (scrollingUp) document.body.classList.remove("mobile-platform-hidden");
    } else {
      document.body.classList.remove("mobile-platform-hidden");
    }

    lastScrollY = Math.max(currentScrollY, 0);
  };

  const queueHeaderUpdate = () => {
    if (updateQueued) return;
    updateQueued = true;
    window.requestAnimationFrame(updateHeaderState);
  };

  updateHeaderState();
  window.addEventListener("scroll", queueHeaderUpdate, { passive: true });
  window.addEventListener("resize", queueHeaderUpdate, { passive: true });
})();

document.querySelectorAll(".site-header").forEach((header) => {
  const nav = header.querySelector(".main-nav");
  if (!nav || header.querySelector(".mobile-menu-button")) return;

  const menuButton = document.createElement("button");
  menuButton.className = "mobile-menu-button";
  menuButton.type = "button";
  menuButton.setAttribute("aria-label", "Abrir menu");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.innerHTML = "<span></span><span></span><span></span>";
  header.insertBefore(menuButton, nav);

  const mobilePanel = document.createElement("div");
  mobilePanel.className = "mobile-menu-panel";
  mobilePanel.setAttribute("aria-hidden", "true");
  mobilePanel.innerHTML = `
    <div class="mobile-menu-head">
      <strong>Menu</strong>
      <button type="button" aria-label="Fechar menu">&times;</button>
    </div>
    <nav aria-label="Menu mobile">${nav.innerHTML}</nav>
  `;
  document.body.append(mobilePanel);

  const backdrop = document.createElement("button");
  backdrop.className = "mobile-menu-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Fechar menu");
  document.body.append(backdrop);

  function closeMenu() {
    document.body.classList.remove("mobile-menu-open");
    menuButton.setAttribute("aria-expanded", "false");
    mobilePanel.setAttribute("aria-hidden", "true");
  }

  function openMenu() {
    document.body.classList.add("mobile-menu-open");
    menuButton.setAttribute("aria-expanded", "true");
    mobilePanel.setAttribute("aria-hidden", "false");
  }

  menuButton.addEventListener("click", () => {
    if (document.body.classList.contains("mobile-menu-open")) closeMenu();
    else openMenu();
  });

  backdrop.addEventListener("click", closeMenu);
  mobilePanel.querySelector(".mobile-menu-head button")?.addEventListener("click", closeMenu);
  mobilePanel.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
});

(() => {
  const canHoverPreview = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!canHoverPreview) return;

  let hoverTimer = 0;
  let activeCard = null;

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

  function videoIdFromEmbed(value) {
    const match = String(value || "").match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
    return match?.[1] || "";
  }

  function previewTargetFromEvent(event) {
    return event.target.closest(".game-card[data-trailer], .related-card-link[data-trailer], .game-card.has-video");
  }

  function trailerFromCard(card) {
    const inlineFrame = card.querySelector(".cover-video[data-video-src]");
    return card.dataset.trailer || inlineFrame?.dataset.videoSrc || "";
  }

  function mediaBoxForCard(card) {
    return card.querySelector(".cover, .mini-cover");
  }

  function stopPreview(card = activeCard) {
    window.clearTimeout(hoverTimer);
    hoverTimer = 0;
    if (!card) return;

    if (card._youtubePreviewPlayer?.destroy) {
      try {
        card._youtubePreviewPlayer.destroy();
      } catch {
        // The preview node may already have been removed after a fast hover-out.
      }
    }
    card._youtubePreviewPlayer = null;
    card.classList.remove("video-playing");
    const dynamicFrame = card.querySelector(".card-preview-video[data-dynamic-preview]");
    if (dynamicFrame) dynamicFrame.remove();

    const inlineFrame = card.querySelector(".cover-video[data-video-src]");
    if (inlineFrame) inlineFrame.removeAttribute("src");

    if (activeCard === card) activeCard = null;
  }

  function hideBrokenPreview(card, videoId, errorCode) {
    console.warn("Prévia de trailer indisponível, capa mantida.", {
      productId: card?.dataset?.id || card?.getAttribute("href") || "",
      videoId,
      errorCode
    });
    stopPreview(card);
  }

  function startPreview(card) {
    const trailer = trailerFromCard(card);
    const videoId = videoIdFromEmbed(trailer);
    const mediaBox = mediaBoxForCard(card);
    if (!videoId || !mediaBox || !document.body.contains(card)) return;

    if (activeCard && activeCard !== card) stopPreview(activeCard);
    activeCard = card;

    const inlineFrame = card.querySelector(".cover-video[data-video-src]");
    if (inlineFrame) inlineFrame.remove();
    card.querySelector(".card-preview-video[data-dynamic-preview]")?.remove();

    const previewShell = document.createElement("div");
    const mount = document.createElement("div");
    previewShell.className = "cover-video card-preview-video";
    previewShell.dataset.dynamicPreview = "true";
    previewShell.append(mount);
    mediaBox.prepend(previewShell);

    loadYouTubePlayerApi()
      .then((YT) => {
        if (activeCard !== card || !document.body.contains(card) || !previewShell.isConnected) return;
        card._youtubePreviewPlayer = new YT.Player(mount, {
          videoId,
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            loop: 1,
            playlist: videoId,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin
          },
          events: {
            onReady: (event) => {
              if (activeCard !== card || !previewShell.isConnected) {
                event.target.destroy();
                return;
              }
              event.target.mute();
              event.target.playVideo();
              card.classList.add("video-playing");
            },
            onError: (event) => hideBrokenPreview(card, videoId, event?.data)
          }
        });
      })
      .catch(() => hideBrokenPreview(card, videoId, "api_load_failed"));
  }

  document.addEventListener("pointerover", (event) => {
    const card = previewTargetFromEvent(event);
    if (!card || card.contains(event.relatedTarget)) return;

    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => startPreview(card), 400);
  });

  document.addEventListener("pointerout", (event) => {
    const card = previewTargetFromEvent(event);
    if (!card || card.contains(event.relatedTarget)) return;
    stopPreview(card);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPreview();
  });
})();
