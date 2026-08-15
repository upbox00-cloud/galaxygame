(function initializeAccountOrders() {
  if (window.__GalaxyGameAccountOrdersReady) return;
  window.__GalaxyGameAccountOrdersReady = true;

  const identity = window.netlifyIdentity;
  const list = document.querySelector("[data-account-orders]");
  const filters = document.querySelector("[data-account-order-filters]");
  const recommendations = document.querySelector("[data-account-recommendations]");
  const recommendationGrid = document.querySelector("[data-account-recommendation-grid]");
  let currentOrders = [];
  let currentFilter = "all";
  if (!list) return;

  async function authHeaders() {
    const user = identity?.currentUser();
    if (!user) return {};
    const token = await user.jwt();
    return { Authorization: `Bearer ${token}` };
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Data indisponível";
    return new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function renderEmpty(title, copy) {
    list.innerHTML = `<div class="empty-orders"><strong>${title}</strong><p>${copy}</p><a href="catalogo.html">Explorar catálogo</a></div>`;
  }

  function orderVisualState(order) {
    const status = normalizeStatus(order?.status);
    if (status === "enviado") return "sent";
    if (["cancelado", "cancelada", "canceled", "cancelled"].includes(status)) return "cancelled";
    return "pending";
  }

  function renderOrder(order) {
    const visualState = orderVisualState(order);
    const sent = visualState === "sent";
    const cancelled = visualState === "cancelled";
    const statusLabel = sent ? "Entregue" : cancelled ? "Pedido cancelado" : "Em preparação";
    const isPlayStation = /playstation|\bps\s*[45]\b/i.test(`${order.plataforma || ""} ${order.produto || ""}`);
    const deliveryLabel = isPlayStation ? "Dados da conta partilhada" : "Código de ativação Xbox";
    const copyLabel = isPlayStation ? "Copiar dados" : "Copiar código";
    const article = document.createElement("article");
    article.className = `account-order-card ${visualState}`;
    article.innerHTML = `
      <div class="account-order-top">
        <div class="account-order-product">
          ${order.imagem ? `<img src="${escapeHtml(order.imagem)}" alt="Capa de ${escapeHtml(order.produto)}" loading="lazy" />` : ""}
          <div>
          <strong>${escapeHtml(order.produto)}</strong>
          <span>${escapeHtml(order.plataforma || "Plataforma não indicada")}</span>
          </div>
        </div>
        <mark>${statusLabel}</mark>
      </div>
      <p>Compra: ${formatDate(order.dataCompra)}</p>
      ${sent ? `
        <div class="account-code">
          <span>${deliveryLabel}</span>
          <code>${escapeHtml(order.codigo)}</code>
          <button type="button" data-copy-code>${copyLabel}</button>
        </div>
      ` : cancelled ? `
        <p class="account-order-note account-order-cancelled-note">Este pedido foi cancelado. Se precisares de ajuda, contacta-nos através de gamegalaxy26@gmail.com.</p>
      ` : `
        <p class="account-order-note">Estamos a preparar a tua entrega. Vais recebê-la por email e também ficará disponível aqui na tua conta.</p>
      `}
    `;

    const copyButton = article.querySelector("[data-copy-code]");
    if (copyButton) {
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(order.codigo || "");
          copyButton.textContent = "Copiado";
        } catch {
          copyButton.textContent = "Seleciona e copia o código";
        }
        setTimeout(() => { copyButton.textContent = copyLabel; }, 1600);
      });
    }
    return article;
  }

  function setText(selector, value) {
    const target = document.querySelector(selector);
    if (target) target.textContent = String(value);
  }

  function updateOrderSummary() {
    const counts = currentOrders.reduce((total, order) => {
      total[orderVisualState(order)] += 1;
      return total;
    }, { sent: 0, pending: 0, cancelled: 0 });
    const libraryTotal = counts.sent + counts.pending;
    setText("[data-account-total]", libraryTotal);
    setText("[data-account-delivered]", counts.sent);
    setText("[data-account-preparing]", counts.pending);
    setText("[data-account-cancelled]", counts.cancelled);
    setText('[data-filter-count="all"]', currentOrders.length);
    setText('[data-filter-count="sent"]', counts.sent);
    setText('[data-filter-count="pending"]', counts.pending);
    setText('[data-filter-count="cancelled"]', counts.cancelled);
  }

  function renderOrders() {
    const visible = currentFilter === "all"
      ? currentOrders
      : currentOrders.filter((order) => orderVisualState(order) === currentFilter);
    list.innerHTML = "";
    if (!visible.length) {
      renderEmpty(
        currentOrders.length ? "Não existem pedidos neste estado" : "Nenhum pedido ainda",
        currentOrders.length
          ? "Escolhe outro filtro para consultares as tuas compras."
          : "Quando fizeres uma compra, os teus pedidos aparecem aqui e também seguem por email."
      );
      return;
    }
    visible.forEach((order) => list.appendChild(renderOrder(order)));
  }

  function bindOrderFilters() {
    filters?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-order-filter]");
      if (!button) return;
      currentFilter = button.dataset.orderFilter || "all";
      filters.querySelectorAll("[data-order-filter]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      renderOrders();
    });
  }

  function normalizeGameName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\b(playstation\s*[45]|ps\s*[45]|xbox\s+one|xbox\s+series(?:\s+x\s*\|?\s*s)?)\b/g, " ")
      .replace(/\b(midia|digital|conta|compartilhada|partilhada|edicao|edition|standard)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function recommendationImageCandidates(product) {
    return [...new Set([
      product?.capaSteamGridDB,
      ...(Array.isArray(product?.screenshots) ? product.screenshots : []),
      product?.imagemFallback
    ].filter((source) => typeof source === "string" && /^(https?:\/\/|assets\/)/i.test(source.trim())))];
  }

  function productDiscount(product) {
    const oldPrice = Number(product?.precoOriginalEUR || 0);
    const price = Number(product?.precoVendaEUR || 0);
    return oldPrice > price && price > 0 ? Math.round((1 - price / oldPrice) * 100) : 0;
  }

  function formatEUR(value) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function displayRecommendationName(value) {
    return String(value || "Jogo digital")
      .replace(/\s+-\s+(PS4|PS5|PLAYSTATION\s*[45]|XBOX(?:\s+ONE|\s+SERIES(?:\s+X\|S)?)?).*$/i, "")
      .replace(/\s+-\s+M[IÍ]DIA DIGITAL.*$/i, "")
      .trim();
  }

  function chooseRecommendations(catalog, orders) {
    const activeOrders = orders.filter((order) => orderVisualState(order) !== "cancelled");
    const purchasedNames = new Set(activeOrders.map((order) => normalizeGameName(order.produto)).filter(Boolean));
    const preferredPlatforms = new Set(activeOrders.map((order) => normalizeStatus(order.plataforma)).filter(Boolean));
    const catalogByName = new Map();
    catalog.forEach((product) => {
      const base = normalizeGameName(product.nome);
      if (base && !catalogByName.has(base)) catalogByName.set(base, product);
    });
    const preferredGenres = new Set();
    purchasedNames.forEach((name) => {
      const match = catalogByName.get(name);
      (match?.genres || []).forEach((genre) => preferredGenres.add(normalizeStatus(genre)));
    });

    const unique = new Map();
    catalog.forEach((product) => {
      const base = normalizeGameName(product.nome);
      const images = recommendationImageCandidates(product);
      if (!base || purchasedNames.has(base) || !images.length || !(Number(product.precoVendaEUR) > 0)) return;
      const platform = normalizeStatus(product.plataforma);
      const genres = (product.genres || []).map(normalizeStatus);
      const sharedGenres = genres.filter((genre) => preferredGenres.has(genre)).length;
      const score = (preferredPlatforms.has(platform) ? 80 : 0)
        + sharedGenres * 45
        + Number(product.rating || 0) * 5
        + Math.log10(Number(product.added || product.ratings_count || 0) + 1) * 8
        + productDiscount(product) * .25
        + Number(product.prioridadeCuradoria || 0) * .2;
      const candidate = { product, score, images };
      if (!unique.has(base) || unique.get(base).score < score) unique.set(base, candidate);
    });
    return [...unique.values()].sort((a, b) => b.score - a.score).slice(0, 4);
  }

  function renderRecommendations(items) {
    if (!recommendations || !recommendationGrid || !items.length) return;
    recommendationGrid.innerHTML = "";
    items.forEach(({ product, images }) => {
      const card = document.createElement("a");
      card.className = "account-recommendation-card";
      card.href = `produto.html?id=${encodeURIComponent(product.id)}`;
      const discount = productDiscount(product);
      const oldPrice = Number(product.precoOriginalEUR || 0);
      const price = Number(product.precoVendaEUR || 0);
      card.innerHTML = `
        <div class="account-recommendation-cover">
          <img src="${escapeHtml(images[0])}" alt="Capa de ${escapeHtml(displayRecommendationName(product.nome))}" loading="lazy" />
          ${discount ? `<mark>-${discount}%</mark>` : ""}
        </div>
        <div class="account-recommendation-info">
          <span>${escapeHtml(product.plataforma || "Consola")}</span>
          <strong title="${escapeHtml(product.nome)}">${escapeHtml(displayRecommendationName(product.nome))}</strong>
          <div>${oldPrice > price ? `<s>${formatEUR(oldPrice)}</s>` : ""}<b>${formatEUR(price)}</b></div>
        </div>`;
      const image = card.querySelector("img");
      let imageIndex = 0;
      image.addEventListener("error", () => {
        imageIndex += 1;
        if (images[imageIndex]) image.src = images[imageIndex];
        else card.classList.add("image-unavailable");
      });
      recommendationGrid.appendChild(card);
    });
    recommendations.hidden = false;
  }

  async function loadRecommendations(orders) {
    try {
      const response = await fetch("data/catalog-lite.json", { cache: "no-store" });
      if (!response.ok) return;
      const catalog = await response.json();
      if (!Array.isArray(catalog)) return;
      renderRecommendations(chooseRecommendations(catalog, orders));
    } catch (error) {
      console.warn("[minha-conta] recomendações indisponíveis", error);
    }
  }

  async function loadOrders() {
    list.innerHTML = `<div class="empty-orders"><strong>A carregar pedidos</strong><p>Estamos a consultar a tua área de cliente.</p></div>`;
    try {
      const response = await fetch("/.netlify/functions/meus-pedidos", {
        headers: await authHeaders()
      });
      if (response.status === 401) return;
      if (!response.ok) throw new Error("Falha ao carregar pedidos");
      const data = await response.json();
      currentOrders = Array.isArray(data.pedidos) ? data.pedidos : [];
      updateOrderSummary();
      renderOrders();
      loadRecommendations(currentOrders);
    } catch (error) {
      console.error(error);
      renderEmpty("Não foi possível carregar os pedidos", "Tenta novamente dentro de instantes ou contacta o apoio.");
    }
  }

  if (!identity) return;
  bindOrderFilters();
  let loadedForUser = "";
  function loadForUser(user) {
    if (!user || loadedForUser === user.id) return;
    loadedForUser = user.id;
    const label = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "jogador";
    const firstName = String(label).trim().split(/\s+/)[0];
    setText("[data-account-greeting]", firstName);
    loadOrders();
  }
  identity.on("init", loadForUser);
  identity.on("login", loadForUser);
  loadForUser(identity.currentUser());
})();

function normalizeStatus(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
