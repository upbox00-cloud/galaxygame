(function initializeAdminOrders() {
  if (window.__GalaxyGameAdminOrdersReady) return;
  window.__GalaxyGameAdminOrdersReady = true;

  const identity = window.netlifyIdentity;
  const shell = document.querySelector("[data-admin-shell]");
  const orderList = document.querySelector("[data-admin-order-list]");
  const notice = document.querySelector("[data-admin-notice]");
  const searchInput = document.querySelector("[data-admin-search]");
  const tabs = [...document.querySelectorAll("[data-admin-tab]")];
  const state = { orders: [], filter: "pending", query: "", loading: false };

  const FILTER_COPY = {
    pending: ["Pedidos pendentes", "Compras pagas que ainda precisam de código ou dados de acesso."],
    sent: ["Pedidos enviados", "Entregas concluídas e disponíveis na conta do cliente."],
    cancelled: ["Pedidos cancelados", "Pedidos retirados da fila de entrega."],
    all: ["Todos os pedidos", "Histórico completo, ordenado do mais recente para o mais antigo."]
  };

  function redirectToLogin() {
    const redirect = encodeURIComponent("painel-pedidos.html");
    window.location.replace(`login.html?redirect=${redirect}`);
  }

  async function authHeaders() {
    const user = identity?.currentUser?.();
    if (!user) return {};
    return { Authorization: `Bearer ${await user.jwt()}` };
  }

  function normalizeStatus(value) {
    const status = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (status.includes("enviado")) return "sent";
    if (status.includes("cancelado")) return "cancelled";
    return "pending";
  }

  function statusLabel(order) {
    return { pending: "Pendente", sent: "Enviado", cancelled: "Cancelado" }[normalizeStatus(order.status)];
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Data indisponível";
    return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function setNotice(message = "", tone = "info") {
    if (!notice) return;
    notice.hidden = !message;
    notice.textContent = message;
    notice.dataset.tone = tone;
  }

  function errorMessage(error, fallback) {
    if (error?.code === "airtable_delivery_fields_missing") {
      return "Cria os campos Status e Codigo na tabela Pedidos do Airtable antes de fazer a entrega.";
    }
    if (error?.code === "airtable_status_field_missing") {
      return "Cria o campo Status na tabela Pedidos do Airtable antes de alterar este pedido.";
    }
    if (error?.code === "send_failed") {
      return "O pedido não foi enviado. Confirma se o domínio está verificado no Resend e tenta novamente.";
    }
    return fallback;
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(await authHeaders()),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      redirectToLogin();
      throw Object.assign(new Error("Sessão terminada"), { code: "login_required" });
    }
    if (response.status === 403) {
      renderAccessDenied();
      throw Object.assign(new Error("Acesso recusado"), { code: "admin_required" });
    }
    if (!response.ok) throw Object.assign(new Error(data.error || "Pedido recusado"), { code: data.error, data });
    return data;
  }

  function renderAccessDenied() {
    shell.hidden = false;
    shell.innerHTML = `
      <section class="admin-access-denied">
        <span>Acesso protegido</span>
        <h1>Esta conta não tem permissão de administrador</h1>
        <p>Entra com o email autorizado em <code>ADMIN_EMAILS</code> ou termina a sessão.</p>
        <button class="account-logout" type="button" data-auth-logout>Sair desta conta</button>
      </section>`;
    shell.querySelector("[data-auth-logout]")?.addEventListener("click", () => identity?.logout());
  }

  function updateSummary() {
    const counts = { pending: 0, sent: 0, cancelled: 0, all: state.orders.length };
    state.orders.forEach((order) => { counts[normalizeStatus(order.status)] += 1; });
    Object.entries(counts).forEach(([key, value]) => {
      document.querySelectorAll(`[data-admin-count="${key}"], [data-admin-tab-count="${key}"]`)
        .forEach((element) => { element.textContent = String(value); });
    });
    const revenue = state.orders
      .filter((order) => normalizeStatus(order.status) !== "cancelled")
      .reduce((total, order) => total + Number(order.valorPagoEUR || 0), 0);
    const revenueElement = document.querySelector("[data-admin-revenue]");
    if (revenueElement) revenueElement.textContent = formatPrice(revenue);
  }

  function filteredOrders() {
    const query = state.query.trim().toLowerCase();
    return state.orders.filter((order) => {
      const matchesStatus = state.filter === "all" || normalizeStatus(order.status) === state.filter;
      const haystack = [order.clienteNome, order.clienteEmail, order.produto, order.plataforma, order.stripeSessionId]
        .join(" ").toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  }

  function orderDetails(order) {
    return `
      <dl class="admin-order-details">
        <div><dt>Cliente</dt><dd>${escapeHtml(order.clienteNome || "Nome não indicado")}</dd></div>
        <div><dt>Email</dt><dd><a href="mailto:${escapeHtml(order.clienteEmail)}">${escapeHtml(order.clienteEmail || "Email não indicado")}</a></dd></div>
        <div><dt>Plataforma</dt><dd>${escapeHtml(order.plataforma || "Não indicada")}</dd></div>
        <div><dt>Valor pago</dt><dd>${formatPrice(order.valorPagoEUR)}</dd></div>
        <div><dt>Data</dt><dd>${formatDate(order.dataCompra)}</dd></div>
        <div class="admin-order-session"><dt>Sessão Stripe</dt><dd title="${escapeHtml(order.stripeSessionId)}">${escapeHtml(order.stripeSessionId || "Sem sessão")}</dd></div>
      </dl>`;
  }

  function orderCard(order) {
    const mode = normalizeStatus(order.status);
    const article = document.createElement("article");
    article.className = `admin-order-card admin-order-${mode}`;
    article.innerHTML = `
      <div class="admin-order-primary">
        <div class="admin-order-title">
          <div><small>Pedido ${escapeHtml(order.id)}</small><strong>${escapeHtml(order.produto || "Produto sem nome")}</strong></div>
          <mark data-status="${mode}">${statusLabel(order)}</mark>
        </div>
        ${orderDetails(order)}
      </div>
      <div class="admin-order-action">
        ${mode === "pending" ? `
          <form class="admin-send-form" data-send-order>
            <label>Código ou dados da conta
              <textarea name="codigo" rows="4" maxlength="4000" placeholder="Cola aqui o código, email, palavra-passe e instruções necessárias" required></textarea>
            </label>
            <div class="admin-action-row">
              <button type="submit">Enviar ao cliente</button>
              <button class="admin-danger-button" type="button" data-order-status="Cancelado">Cancelar pedido</button>
            </div>
          </form>` : mode === "sent" ? `
          <div class="admin-code-box"><span>Dados entregues</span><code>${escapeHtml(order.codigo || "Sem dados guardados")}</code></div>` : `
          <div class="admin-cancelled-box"><p>Este pedido não está na fila de entrega.</p><button class="admin-secondary-button" type="button" data-order-status="Aguardando codigo">Reabrir pedido</button></div>`}
      </div>`;

    article.querySelector("[data-send-order]")?.addEventListener("submit", (event) => sendOrder(event, order, article));
    article.querySelector("[data-order-status]")?.addEventListener("click", (event) => {
      changeStatus(order, event.currentTarget.dataset.orderStatus, event.currentTarget);
    });
    return article;
  }

  function renderOrders() {
    const [title, copy] = FILTER_COPY[state.filter];
    document.querySelector("[data-admin-list-title]").textContent = title;
    document.querySelector("[data-admin-list-copy]").textContent = copy;
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.adminTab === state.filter));
    const orders = filteredOrders();
    orderList.innerHTML = "";
    if (!orders.length) {
      orderList.innerHTML = '<div class="admin-empty"><strong>Nenhum pedido encontrado</strong><p>Experimenta outro estado ou termo de pesquisa.</p></div>';
      return;
    }
    orders.forEach((order) => orderList.appendChild(orderCard(order)));
  }

  async function sendOrder(event, order, article) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const codigo = String(new FormData(form).get("codigo") || "").trim();
    if (!codigo || button.disabled) return;
    button.disabled = true;
    button.textContent = "A enviar...";
    setNotice("A guardar os dados e a enviar o email ao cliente...", "info");
    try {
      const data = await apiRequest("/.netlify/functions/marcar-pedido-enviado", {
        method: "POST",
        body: JSON.stringify({ recordId: order.id, codigo })
      });
      const index = state.orders.findIndex((item) => item.id === order.id);
      if (index >= 0) state.orders[index] = data.pedido;
      article.remove();
      updateSummary();
      renderOrders();
      setNotice("Pedido enviado. O cliente já pode consultar os dados em Minha Conta e recebeu o email.", "success");
    } catch (error) {
      if (["login_required", "admin_required"].includes(error.code)) return;
      button.disabled = false;
      button.textContent = "Enviar ao cliente";
      setNotice(errorMessage(error, "Não foi possível entregar este pedido. Tenta novamente."), "error");
    }
  }

  async function changeStatus(order, status, button) {
    if (button.disabled) return;
    if (status === "Cancelado" && !window.confirm("Cancelar este pedido e removê-lo da fila de entrega?")) return;
    button.disabled = true;
    setNotice("A atualizar o pedido...", "info");
    try {
      const data = await apiRequest("/.netlify/functions/atualizar-pedido-status", {
        method: "POST",
        body: JSON.stringify({ recordId: order.id, status })
      });
      const index = state.orders.findIndex((item) => item.id === order.id);
      if (index >= 0) state.orders[index] = data.pedido;
      updateSummary();
      renderOrders();
      setNotice(status === "Cancelado" ? "Pedido cancelado." : "Pedido reaberto e devolvido à fila.", "success");
    } catch (error) {
      if (["login_required", "admin_required"].includes(error.code)) return;
      button.disabled = false;
      setNotice(errorMessage(error, "Não foi possível atualizar o pedido."), "error");
    }
  }

  async function loadOrders() {
    if (state.loading) return;
    state.loading = true;
    orderList.innerHTML = '<div class="admin-loading">A carregar pedidos...</div>';
    setNotice("");
    try {
      const data = await apiRequest("/.netlify/functions/admin-pedidos?status=all");
      state.orders = (data.pedidos || []).sort((a, b) => new Date(b.dataCompra || 0) - new Date(a.dataCompra || 0));
      updateSummary();
      renderOrders();
      const updated = document.querySelector("[data-admin-updated]");
      if (updated) updated.textContent = `Atualizado às ${new Intl.DateTimeFormat("pt-PT", { timeStyle: "short" }).format(new Date())}`;
    } catch (error) {
      if (!["login_required", "admin_required"].includes(error.code)) {
        orderList.innerHTML = '<div class="admin-empty"><strong>Falha ao carregar</strong><p>Confirma a ligação ao Airtable e tenta novamente.</p></div>';
        setNotice("Não foi possível carregar os pedidos.", "error");
      }
    } finally {
      state.loading = false;
    }
  }

  function boot(user) {
    if (!user) {
      redirectToLogin();
      return;
    }
    shell.hidden = false;
    loadOrders();
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => {
    state.filter = tab.dataset.adminTab;
    renderOrders();
  }));
  searchInput?.addEventListener("input", () => {
    state.query = searchInput.value;
    renderOrders();
  });
  document.querySelector("[data-admin-refresh]")?.addEventListener("click", loadOrders);

  if (!identity) {
    redirectToLogin();
    return;
  }
  identity.on("init", boot);
  identity.on("login", boot);
  const currentUser = identity.currentUser?.();
  if (currentUser) boot(currentUser);
  window.setTimeout(() => {
    if (!identity.currentUser?.()) redirectToLogin();
  }, 1400);
})();

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
