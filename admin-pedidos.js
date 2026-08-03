(function initializeAdminOrders() {
  if (window.__GalaxyGameAdminOrdersReady) return;
  window.__GalaxyGameAdminOrdersReady = true;

  const identity = window.netlifyIdentity;
  const shell = document.querySelector("[data-admin-shell]");
  const pendingList = document.querySelector("[data-admin-pending-list]");
  const sentList = document.querySelector("[data-admin-sent-list]");
  const tabs = document.querySelectorAll("[data-admin-tab]");
  const panels = document.querySelectorAll("[data-admin-panel]");

  function isAdmin(user) {
    const roles = [
      ...(user?.app_metadata?.roles || []),
      ...(user?.app_metadata?.authorization?.roles || [])
    ].map((role) => String(role).toLowerCase());
    return roles.includes("admin");
  }

  async function authHeaders() {
    const user = identity?.currentUser();
    if (!user) return {};
    const token = await user.jwt();
    return { Authorization: `Bearer ${token}` };
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Data indisponível";
    return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function renderEmpty(target, message) {
    target.innerHTML = `<div class="admin-empty">${message}</div>`;
  }

  function orderCard(order, mode) {
    const article = document.createElement("article");
    article.className = "admin-order-card";
    article.innerHTML = `
      <div class="admin-order-info">
        <strong>${escapeHtml(order.produto)}</strong>
        <span>${escapeHtml(order.plataforma || "Plataforma não indicada")}</span>
        <span>${escapeHtml(order.clienteNome || "Cliente")} - ${escapeHtml(order.clienteEmail)}</span>
        <span>${formatPrice(order.valorPagoEUR)} - ${formatDate(order.dataCompra)}</span>
        <small>Stripe: ${escapeHtml(order.stripeSessionId || "sem sessão")}</small>
      </div>
      ${mode === "pending" ? `
        <form class="admin-send-form">
          <label>
            Código / dados de acesso
            <textarea name="codigo" rows="3" placeholder="Cola aqui o código ou instruções de acesso" required></textarea>
          </label>
          <button type="submit">Marcar como enviado</button>
        </form>
      ` : `
        <div class="admin-code-box">
          <span>Código enviado</span>
          <code>${escapeHtml(order.codigo || "Sem código guardado")}</code>
        </div>
      `}
    `;

    const form = article.querySelector("form");
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector("button");
        const codigo = form.codigo.value.trim();
        if (!codigo) return;
        button.disabled = true;
        button.textContent = "A enviar...";
        try {
          const response = await fetch("/.netlify/functions/marcar-pedido-enviado", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(await authHeaders())
            },
            body: JSON.stringify({ recordId: order.id, codigo })
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Falha ao enviar pedido");
          article.remove();
          loadOrders("sent");
          if (!pendingList.children.length) renderEmpty(pendingList, "Sem pedidos aguardando código.");
        } catch (error) {
          console.error(error);
          button.disabled = false;
          button.textContent = "Marcar como enviado";
          alert("Não foi possível enviar este pedido. Confirma as variáveis do Airtable/Resend no Netlify.");
        }
      });
    }
    return article;
  }

  async function loadOrders(mode) {
    const target = mode === "sent" ? sentList : pendingList;
    const status = mode === "sent" ? "Enviado" : "Aguardando codigo";
    target.innerHTML = `<div class="admin-loading">A carregar...</div>`;
    try {
      const response = await fetch(`/.netlify/functions/admin-pedidos?status=${encodeURIComponent(status)}`, {
        headers: await authHeaders()
      });
      if (response.status === 401 || response.status === 403) {
        window.location.replace("index.html");
        return;
      }
      if (!response.ok) throw new Error("Acesso negado ou erro ao carregar pedidos");
      const data = await response.json();
      const pedidos = data.pedidos || [];
      target.innerHTML = "";
      if (!pedidos.length) {
        renderEmpty(target, mode === "sent" ? "Ainda não há pedidos enviados." : "Sem pedidos aguardando código.");
        return;
      }
      pedidos.forEach((order) => target.appendChild(orderCard(order, mode)));
    } catch (error) {
      console.error(error);
      renderEmpty(target, "Não foi possível carregar os pedidos.");
    }
  }

  function setTab(active) {
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.adminTab === active));
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== active;
    });
    loadOrders(active === "sent" ? "sent" : "pending");
  }

  let initialized = false;
  let loadedForUser = "";

  function boot(user) {
    initialized = true;
    if (!user || !isAdmin(user)) {
      window.location.replace("index.html");
      return;
    }
    shell.hidden = false;
    if (loadedForUser === user.id) return;
    loadedForUser = user.id;
    loadOrders("pending");
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => setTab(tab.dataset.adminTab)));

  if (!identity) {
    window.location.replace("index.html");
    return;
  }
  identity.on("init", boot);
  identity.on("login", boot);
  const currentUser = identity.currentUser();
  if (currentUser) boot(currentUser);
  setTimeout(() => {
    if (!initialized) boot(identity.currentUser());
  }, 1200);
})();

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
