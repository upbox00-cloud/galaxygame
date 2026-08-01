(function initializeAccountOrders() {
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
    const article = document.createElement("article");
    article.className = `account-order-card ${sent ? "sent" : "pending"}`;
    article.innerHTML = `
      <div class="account-order-top">
        <div>
          <strong>${escapeHtml(order.produto)}</strong>
          <span>${escapeHtml(order.plataforma || "Plataforma não indicada")}</span>
        </div>
        <mark>${sent ? "Enviado" : "Aguardando código"}</mark>
      </div>
      <p>Compra: ${formatDate(order.dataCompra)}</p>
      ${sent ? `
        <div class="account-code">
          <span>Código / dados de acesso</span>
          <code>${escapeHtml(order.codigo)}</code>
          <button type="button" data-copy-code>Copiar código</button>
        </div>
      ` : `
        <p class="account-order-note">Estamos preparando o teu código. Vais recebê-lo em breve por email e aqui na tua conta.</p>
      `}
    `;

    const copyButton = article.querySelector("[data-copy-code]");
    if (copyButton) {
      copyButton.addEventListener("click", async () => {
        await navigator.clipboard.writeText(order.codigo || "");
        copyButton.textContent = "Copiado";
        setTimeout(() => { copyButton.textContent = "Copiar código"; }, 1600);
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
  identity.on("login", () => loadOrders());
  setTimeout(() => {
    if (identity.currentUser()) loadOrders();
  }, 250);
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
