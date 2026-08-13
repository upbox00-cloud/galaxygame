(function initializeAccountOrders() {
  if (window.__GalaxyGameAccountOrdersReady) return;
  window.__GalaxyGameAccountOrdersReady = true;

  const identity = window.netlifyIdentity;
  const list = document.querySelector("[data-account-orders]");
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

  function renderOrder(order) {
    const sent = normalizeStatus(order.status) === "enviado";
    const isPlayStation = /playstation|\bps\s*[45]\b/i.test(`${order.plataforma || ""} ${order.produto || ""}`);
    const deliveryLabel = isPlayStation ? "Dados da conta partilhada" : "Código de ativação Xbox";
    const copyLabel = isPlayStation ? "Copiar dados" : "Copiar código";
    const article = document.createElement("article");
    article.className = `account-order-card ${sent ? "sent" : "pending"}`;
    article.innerHTML = `
      <div class="account-order-top">
        <div class="account-order-product">
          ${order.imagem ? `<img src="${escapeHtml(order.imagem)}" alt="Capa de ${escapeHtml(order.produto)}" loading="lazy" />` : ""}
          <div>
          <strong>${escapeHtml(order.produto)}</strong>
          <span>${escapeHtml(order.plataforma || "Plataforma não indicada")}</span>
          </div>
        </div>
        <mark>${sent ? "Entregue" : "Em preparação"}</mark>
      </div>
      <p>Compra: ${formatDate(order.dataCompra)}</p>
      ${sent ? `
        <div class="account-code">
          <span>${deliveryLabel}</span>
          <code>${escapeHtml(order.codigo)}</code>
          <button type="button" data-copy-code>${copyLabel}</button>
        </div>
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

  async function loadOrders() {
    list.innerHTML = `<div class="empty-orders"><strong>A carregar pedidos</strong><p>Estamos a consultar a tua área de cliente.</p></div>`;
    try {
      const response = await fetch("/.netlify/functions/meus-pedidos", {
        headers: await authHeaders()
      });
      if (response.status === 401) return;
      if (!response.ok) throw new Error("Falha ao carregar pedidos");
      const data = await response.json();
      const pedidos = data.pedidos || [];
      if (!pedidos.length) {
        renderEmpty("Nenhum pedido ainda", "Quando fizeres uma compra, os teus pedidos aparecem aqui e também seguem por email.");
        return;
      }
      list.innerHTML = "";
      pedidos.forEach((order) => list.appendChild(renderOrder(order)));
    } catch (error) {
      console.error(error);
      renderEmpty("Não foi possível carregar os pedidos", "Tenta novamente dentro de instantes ou contacta o apoio.");
    }
  }

  if (!identity) return;
  let loadedForUser = "";
  function loadForUser(user) {
    if (!user || loadedForUser === user.id) return;
    loadedForUser = user.id;
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
