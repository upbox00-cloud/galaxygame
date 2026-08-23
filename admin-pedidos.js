(function initializeAdminDashboard() {
  if (window.__GalaxyGameAdminOrdersReady) return;
  window.__GalaxyGameAdminOrdersReady = true;

  const identity = window.netlifyIdentity;
  const shell = document.querySelector("[data-admin-shell]");
  const orderList = document.querySelector("[data-admin-order-list]");
  const notice = document.querySelector("[data-admin-notice]");
  const searchInput = document.querySelector("[data-admin-search]");
  const catalogSearch = document.querySelector("[data-admin-catalog-search]");
  const customerSearch = document.querySelector("[data-admin-customer-search]");
  const recoveryForm = document.querySelector("[data-admin-recovery-form]");
  const tabs = [...document.querySelectorAll("[data-admin-tab]")];
  const customerTypeFilters = [...document.querySelectorAll("[data-admin-customer-type]")];
  const ADMIN_STATE_KEY = "galaxygame_admin_ui_v1";
  const savedUi = readSavedUi();
  const state = {
    orders: [],
    catalog: [],
    filter: savedUi.filter || "pending",
    query: savedUi.query || "",
    catalogQuery: savedUi.catalogQuery || "",
    customerQuery: savedUi.customerQuery || "",
    customerType: savedUi.customerType || "all",
    view: savedUi.view || "overview",
    period: savedUi.period || 30,
    visitsPeriod: 7,
    visitsHistory: [],
    presenceLoading: false,
    loading: false,
    booted: false
  };

  const FILTER_COPY = {
    pending: ["Pedidos pendentes", "Compras pagas que ainda precisam de código ou dados de acesso."],
    sent: ["Pedidos enviados", "Entregas concluídas e disponíveis na conta do cliente."],
    cancelled: ["Pedidos cancelados", "Pedidos retirados da fila de entrega."],
    all: ["Todos os pedidos", "Histórico completo, ordenado do mais recente para o mais antigo."]
  };

  const VIEW_COPY = {
    overview: ["Visão geral", "Acompanha o desempenho da loja e resolve o que precisa da tua atenção."],
    orders: ["Pedidos", "Processa compras, entrega jogos e acompanha cada encomenda."],
    catalog: ["Catálogo", "Consulta os produtos publicados, promoções e pré-vendas da loja."],
    customers: ["Clientes", "Conhece os clientes que compram na GalaxyGame e o respetivo histórico."]
  };

  function readSavedUi() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(ADMIN_STATE_KEY) || "{}");
      return {
        view: ["overview", "orders", "catalog", "customers"].includes(saved.view) ? saved.view : "",
        filter: ["pending", "sent", "cancelled", "all"].includes(saved.filter) ? saved.filter : "",
        period: [7, 30, 90].includes(Number(saved.period)) ? Number(saved.period) : 0,
        query: String(saved.query || "").slice(0, 200),
        catalogQuery: String(saved.catalogQuery || "").slice(0, 200),
        customerQuery: String(saved.customerQuery || "").slice(0, 200),
        customerType: ["all", "registered", "guest", "email_only"].includes(saved.customerType) ? saved.customerType : "all"
      };
    } catch {
      return {};
    }
  }

  function saveUi() {
    try {
      window.localStorage.setItem(ADMIN_STATE_KEY, JSON.stringify({
        view: state.view,
        filter: state.filter,
        period: state.period,
        query: state.query,
        catalogQuery: state.catalogQuery,
        customerQuery: state.customerQuery,
        customerType: state.customerType
      }));
    } catch {
      // O painel continua funcional quando o navegador bloqueia armazenamento local.
    }
  }

  function redirectToLogin() {
    window.location.replace(`login.html?redirect=${encodeURIComponent("painel-pedidos.html")}`);
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

  function formatDate(value, options = { dateStyle: "short", timeStyle: "short" }) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Data indisponível";
    return new Intl.DateTimeFormat("pt-PT", options).format(date);
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function formatBRL(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
  }

  function setNotice(message = "", tone = "info") {
    if (!notice) return;
    notice.hidden = !message;
    notice.textContent = message;
    notice.dataset.tone = tone;
  }

  function errorMessage(error, fallback) {
    if (error?.code === "order_email_missing") return "Este registo não tem um email de cliente válido. Só é possível entregar um pedido pago que tenha o email do destinatário.";
    if (error?.code === "order_delivery_not_saved") return "Não foi possível guardar os dados de entrega. Atualiza a página e tenta novamente.";
    if (error?.code === "order_status_not_saved") return "Não foi possível alterar este pedido. Atualiza a página e tenta novamente.";
    if (error?.code === "send_failed") return "O pedido não foi enviado. Confirma o domínio no Resend e tenta novamente.";
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
        <button class="admin-secondary-button" type="button" data-auth-logout>Sair desta conta</button>
      </section>`;
    shell.querySelector("[data-auth-logout]")?.addEventListener("click", () => identity?.logout());
  }

  function setView(view) {
    if (!VIEW_COPY[view]) return;
    state.view = view;
    document.querySelectorAll("[data-admin-view]").forEach((section) => {
      const active = section.dataset.adminView === view;
      section.hidden = !active;
      section.classList.toggle("active", active);
    });
    document.querySelectorAll("[data-admin-view-button]").forEach((button) => {
      button.classList.toggle("active", button.dataset.adminViewButton === view);
    });
    const [title, copy] = VIEW_COPY[view];
    document.querySelector("[data-admin-page-title]").textContent = title;
    document.querySelector("[data-admin-page-copy]").textContent = copy;
    document.body.classList.remove("admin-menu-open");
    if (view === "orders") renderOrders();
    if (view === "catalog") renderCatalog();
    if (view === "customers") renderCustomers();
    saveUi();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function periodOrders(days = state.period, previous = false) {
    const end = new Date();
    if (previous) end.setDate(end.getDate() - days);
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    return state.orders.filter((order) => {
      const date = new Date(order.dataCompra);
      return !Number.isNaN(date.getTime()) && date >= start && date <= end;
    });
  }

  function activeSales(orders) {
    return orders.filter((order) => normalizeStatus(order.status) !== "cancelled");
  }

  function sumRevenue(orders) {
    return activeSales(orders).reduce((total, order) => total + Number(order.valorPagoEUR || 0), 0);
  }

  function trendText(current, previous, noun) {
    if (!previous && !current) return [`Sem ${noun} neste período`, ""];
    if (!previous) return [`Primeiras ${noun} neste período`, "positive"];
    const variation = ((current - previous) / previous) * 100;
    const direction = variation >= 0 ? "acima" : "abaixo";
    return [`${Math.abs(variation).toFixed(0)}% ${direction} do período anterior`, variation >= 0 ? "positive" : "negative"];
  }

  function updateSummary() {
    const counts = { pending: 0, sent: 0, cancelled: 0, all: state.orders.length };
    state.orders.forEach((order) => { counts[normalizeStatus(order.status)] += 1; });
    Object.entries(counts).forEach(([key, value]) => {
      document.querySelectorAll(`[data-admin-count="${key}"], [data-admin-tab-count="${key}"]`)
        .forEach((element) => { element.textContent = String(value); });
    });
    document.querySelectorAll("[data-admin-side-pending]").forEach((element) => { element.textContent = String(counts.pending); });
    const revenue = sumRevenue(state.orders);
    const revenueElement = document.querySelector("[data-admin-revenue]");
    if (revenueElement) revenueElement.textContent = formatPrice(revenue);
  }

  function updateDashboard() {
    const current = activeSales(periodOrders());
    const previous = activeSales(periodOrders(state.period, true));
    const revenue = sumRevenue(current);
    const previousRevenue = sumRevenue(previous);
    const pending = state.orders.filter((order) => normalizeStatus(order.status) === "pending").length;
    const metrics = {
      revenue: formatPrice(revenue),
      orders: String(current.length),
      average: formatPrice(current.length ? revenue / current.length : 0),
      pending: String(pending)
    };
    Object.entries(metrics).forEach(([key, value]) => {
      const element = document.querySelector(`[data-admin-metric="${key}"]`);
      if (element) element.textContent = value;
    });

    const revenueTrend = trendText(revenue, previousRevenue, "vendas");
    const orderTrend = trendText(current.length, previous.length, "encomendas");
    [["revenue", revenueTrend], ["orders", orderTrend]].forEach(([key, trend]) => {
      const element = document.querySelector(`[data-admin-trend="${key}"]`);
      if (!element) return;
      element.textContent = trend[0];
      element.className = trend[1];
    });
    const pendingCopy = document.querySelector("[data-admin-pending-copy]");
    if (pendingCopy) pendingCopy.textContent = pending ? "Pedidos pagos aguardam entrega" : "Nenhum pedido aguarda entrega";

    renderRevenueChart(current);
    renderStatusChart();
    renderTasks();
    renderTopProducts(current);
    renderPlatforms(current);
    renderRecentOrders();
  }

  function pageLabel(path) {
    const labels = {
      "/": "Página inicial",
      "/index.html": "Página inicial",
      "/catalogo.html": "Catálogo",
      "/produto.html": "Página de produto",
      "/produto-xbox.html": "Produto Xbox",
      "/carrinho.html": "Carrinho",
      "/minha-conta.html": "Minha Conta",
      "/pedido-confirmado.html": "Pedido confirmado",
      "/como-funciona.html": "Como funciona"
    };
    return labels[path] || "Outra página";
  }

  function renderPresence(data) {
    const count = Number(data?.active || 0);
    const countElement = document.querySelector("[data-admin-live-count]");
    const copyElement = document.querySelector("[data-admin-live-copy]");
    if (countElement) countElement.textContent = String(count);
    if (copyElement) {
      const topPage = data?.pages?.[0];
      copyElement.dataset.state = "live";
      if (!count) copyElement.textContent = "Sem visitantes nos últimos 2 minutos";
      else if (topPage) copyElement.textContent = `${topPage.count} ${topPage.count === 1 ? "sessão" : "sessões"} em ${pageLabel(topPage.page)}`;
      else copyElement.textContent = `${count} ${count === 1 ? "sessão ativa" : "sessões ativas"}`;
    }
    if (Array.isArray(data?.history)) {
      state.visitsHistory = data.history;
      renderVisitsChart();
    }
  }

  function renderVisitsChart() {
    const container = document.querySelector("[data-admin-visits-chart]");
    const total = document.querySelector("[data-admin-visits-total]");
    if (!container || !total) return;
    const days = state.visitsPeriod;
    const values = state.visitsHistory.slice(-days).map((item) => ({
      date: new Date(`${item.date}T12:00:00`),
      value: Number(item.count || 0)
    }));
    const visits = values.reduce((sum, item) => sum + item.value, 0);
    total.textContent = `${visits} ${visits === 1 ? "visita" : "visitas"}`;
    if (!values.length || !visits) {
      container.innerHTML = '<div class="admin-chart-empty"><span>Ainda não existem visitas registadas neste período.<br>O gráfico será preenchido automaticamente.</span></div>';
      return;
    }

    const width = 760;
    const height = 230;
    const margin = { top: 18, right: 12, bottom: 30, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const max = Math.max(...values.map((item) => item.value), 1);
    const points = values.map((item, index) => ({
      ...item,
      x: margin.left + (values.length === 1 ? chartWidth / 2 : (index / (values.length - 1)) * chartWidth),
      y: margin.top + chartHeight - (item.value / max) * chartHeight
    }));
    const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const area = `${line} L${points.at(-1).x.toFixed(1)},${margin.top + chartHeight} L${points[0].x.toFixed(1)},${margin.top + chartHeight} Z`;
    const firstDate = formatDate(values[0].date, { day: "2-digit", month: "short" });
    const lastDate = formatDate(values.at(-1).date, { day: "2-digit", month: "short" });
    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Visitas dos últimos ${days === 1 ? "1 dia" : `${days} dias`}">
        <defs><linearGradient id="adminChartArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7653a7" stop-opacity=".28"/><stop offset="1" stop-color="#7653a7" stop-opacity="0"/></linearGradient></defs>
        <line class="admin-chart-grid" x1="${margin.left}" y1="${margin.top}" x2="${width - margin.right}" y2="${margin.top}"/>
        <line class="admin-chart-grid" x1="${margin.left}" y1="${margin.top + chartHeight / 2}" x2="${width - margin.right}" y2="${margin.top + chartHeight / 2}"/>
        <line class="admin-chart-grid" x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${width - margin.right}" y2="${margin.top + chartHeight}"/>
        <text class="admin-chart-label" x="${margin.left - 8}" y="${margin.top + 4}" text-anchor="end">${max}</text>
        <text class="admin-chart-label" x="${margin.left - 8}" y="${margin.top + chartHeight + 4}" text-anchor="end">0</text>
        <path class="admin-chart-area" d="${area}"/><path class="admin-chart-line" d="${line}"/>
        ${points.map((point) => `<circle class="admin-chart-point" cx="${point.x}" cy="${point.y}" r="3"><title>${escapeHtml(formatDate(point.date, { dateStyle: "medium" }))}: ${point.value} ${point.value === 1 ? "visita" : "visitas"}</title></circle>`).join("")}
        <text class="admin-chart-label" x="${margin.left}" y="${height - 5}">${escapeHtml(firstDate)}</text>
        <text class="admin-chart-label" x="${width - margin.right}" y="${height - 5}" text-anchor="end">${escapeHtml(lastDate)}</text>
      </svg>`;
  }

  async function loadPresence() {
    if (state.presenceLoading || document.hidden) return;
    state.presenceLoading = true;
    try {
      renderPresence(await apiRequest("/.netlify/functions/site-presence"));
    } catch (error) {
      if (!["login_required", "admin_required"].includes(error.code)) {
        const copy = document.querySelector("[data-admin-live-copy]");
        if (copy) {
          copy.dataset.state = "offline";
          copy.textContent = "Presença temporariamente indisponível";
        }
      }
    } finally {
      state.presenceLoading = false;
    }
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function renderRevenueChart(orders) {
    const container = document.querySelector("[data-admin-revenue-chart]");
    const total = document.querySelector("[data-admin-chart-total]");
    if (!container || !total) return;
    const valuesByDay = new Map();
    orders.forEach((order) => {
      const date = new Date(order.dataCompra);
      if (Number.isNaN(date.getTime())) return;
      const key = localDateKey(date);
      valuesByDay.set(key, (valuesByDay.get(key) || 0) + Number(order.valorPagoEUR || 0));
    });
    const values = [];
    for (let offset = state.period - 1; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      values.push({ date, value: valuesByDay.get(localDateKey(date)) || 0 });
    }
    const revenue = values.reduce((sum, item) => sum + item.value, 0);
    total.textContent = formatPrice(revenue);
    if (!revenue) {
      container.innerHTML = '<div class="admin-chart-empty"><span>Ainda não existem vendas neste período.<br>O gráfico será preenchido automaticamente.</span></div>';
      return;
    }

    const width = 760;
    const height = 230;
    const margin = { top: 18, right: 12, bottom: 30, left: 48 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const max = Math.max(...values.map((item) => item.value), 1);
    const points = values.map((item, index) => ({
      ...item,
      x: margin.left + (values.length === 1 ? chartWidth / 2 : (index / (values.length - 1)) * chartWidth),
      y: margin.top + chartHeight - (item.value / max) * chartHeight
    }));
    const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const area = `${line} L${points.at(-1).x.toFixed(1)},${margin.top + chartHeight} L${points[0].x.toFixed(1)},${margin.top + chartHeight} Z`;
    const firstDate = formatDate(values[0].date, { day: "2-digit", month: "short" });
    const lastDate = formatDate(values.at(-1).date, { day: "2-digit", month: "short" });
    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Receita dos últimos ${state.period} dias">
        <defs><linearGradient id="adminChartArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7653a7" stop-opacity=".28"/><stop offset="1" stop-color="#7653a7" stop-opacity="0"/></linearGradient></defs>
        <line class="admin-chart-grid" x1="${margin.left}" y1="${margin.top}" x2="${width - margin.right}" y2="${margin.top}"/>
        <line class="admin-chart-grid" x1="${margin.left}" y1="${margin.top + chartHeight / 2}" x2="${width - margin.right}" y2="${margin.top + chartHeight / 2}"/>
        <line class="admin-chart-grid" x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${width - margin.right}" y2="${margin.top + chartHeight}"/>
        <text class="admin-chart-label" x="${margin.left - 8}" y="${margin.top + 4}" text-anchor="end">${escapeHtml(formatPrice(max))}</text>
        <text class="admin-chart-label" x="${margin.left - 8}" y="${margin.top + chartHeight + 4}" text-anchor="end">0 €</text>
        <path class="admin-chart-area" d="${area}"/><path class="admin-chart-line" d="${line}"/>
        ${points.filter((point) => point.value > 0).map((point) => `<circle class="admin-chart-point" cx="${point.x}" cy="${point.y}" r="3"><title>${escapeHtml(formatDate(point.date, { dateStyle: "medium" }))}: ${escapeHtml(formatPrice(point.value))}</title></circle>`).join("")}
        <text class="admin-chart-label" x="${margin.left}" y="${height - 5}">${escapeHtml(firstDate)}</text>
        <text class="admin-chart-label" x="${width - margin.right}" y="${height - 5}" text-anchor="end">${escapeHtml(lastDate)}</text>
      </svg>`;
  }

  function renderStatusChart() {
    const counts = { pending: 0, sent: 0, cancelled: 0 };
    state.orders.forEach((order) => { counts[normalizeStatus(order.status)] += 1; });
    const total = state.orders.length || 1;
    const pendingEnd = (counts.pending / total) * 100;
    const sentEnd = pendingEnd + (counts.sent / total) * 100;
    const cancelledEnd = sentEnd + (counts.cancelled / total) * 100;
    const donut = document.querySelector("[data-admin-donut]");
    if (donut) donut.style.background = state.orders.length
      ? `conic-gradient(#ff7b28 0 ${pendingEnd}%, #319568 ${pendingEnd}% ${sentEnd}%, #d65a62 ${sentEnd}% ${cancelledEnd}%, #ececef ${cancelledEnd}% 100%)`
      : "#ececef";
    document.querySelector("[data-admin-donut-total]").textContent = String(state.orders.length);
    Object.entries(counts).forEach(([key, value]) => {
      document.querySelector(`[data-admin-status-value="${key}"]`).textContent = String(value);
    });
  }

  function renderTasks() {
    const pending = state.orders.filter((order) => normalizeStatus(order.status) === "pending").length;
    const cancelled = state.orders.filter((order) => normalizeStatus(order.status) === "cancelled").length;
    document.querySelector('[data-admin-task="pending"]').textContent = `${pending} ${pending === 1 ? "pedido por preparar" : "pedidos por preparar"}`;
    document.querySelector('[data-admin-task="cancelled"]').textContent = `${cancelled} ${cancelled === 1 ? "pedido cancelado" : "pedidos cancelados"}`;
  }

  function aggregateBy(orders, keyGetter) {
    const map = new Map();
    orders.forEach((order) => {
      const key = String(keyGetter(order) || "Não indicado").trim();
      if (!key) return;
      const current = map.get(key) || { name: key, count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += Number(order.valorPagoEUR || 0);
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue);
  }

  function renderTopProducts(orders) {
    const container = document.querySelector("[data-admin-top-products]");
    const products = aggregateBy(orders, (order) => order.produto).slice(0, 5);
    container.innerHTML = products.length ? products.map((item, index) => `
      <div class="admin-rank-row"><span>${index + 1}</span><div><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong><small>${item.count} ${item.count === 1 ? "venda" : "vendas"}</small></div><strong>${escapeHtml(formatPrice(item.revenue))}</strong></div>`).join("")
      : '<div class="admin-empty">Sem vendas neste período.</div>';
  }

  function renderPlatforms(orders) {
    const container = document.querySelector("[data-admin-platforms]");
    const platforms = aggregateBy(orders, (order) => order.plataforma).slice(0, 5);
    const max = Math.max(...platforms.map((item) => item.count), 1);
    container.innerHTML = platforms.length ? platforms.map((item) => `
      <div class="admin-platform-row"><div><span>${escapeHtml(item.name)}</span><strong>${item.count}</strong></div><div class="admin-platform-bar"><i style="width:${(item.count / max) * 100}%"></i></div></div>`).join("")
      : '<div class="admin-empty">Sem plataformas neste período.</div>';
  }

  function renderRecentOrders() {
    const container = document.querySelector("[data-admin-recent-orders]");
    const orders = state.orders.slice(0, 5);
    container.innerHTML = orders.length ? orders.map((order) => {
      const status = normalizeStatus(order.status);
      return `<div class="admin-recent-row"><div><strong title="${escapeHtml(order.produto)}">${escapeHtml(order.produto || "Produto")}</strong><small>${escapeHtml(order.clienteNome || order.clienteEmail || "Cliente")} · ${escapeHtml(formatDate(order.dataCompra))} · ${escapeHtml(formatPrice(order.valorPagoEUR))}</small></div><span class="admin-status-pill ${status}">${statusLabel(order)}</span></div>`;
    }).join("") : '<div class="admin-empty">Ainda não existem pedidos.</div>';
  }

  function filteredOrders() {
    const query = state.query.trim().toLowerCase();
    return state.orders.filter((order) => {
      const matchesStatus = state.filter === "all" || normalizeStatus(order.status) === state.filter;
      const customerType = customerTypeKey(order);
      const matchesCustomerType = state.customerType === "all" || customerType === state.customerType;
      const haystack = [order.id, order.clienteNome, order.clienteEmail, order.produto, order.plataforma, order.stripeSessionId, order.tipoCliente].join(" ").toLowerCase();
      return matchesStatus && matchesCustomerType && (!query || haystack.includes(query));
    });
  }

  function customerTypeKey(order) {
    const type = String(order?.tipoCliente || "").trim().toLowerCase();
    if (order?.isEmailOnly || ["email_only", "apenas email", "so email", "só email"].includes(type)) return "email_only";
    if (order?.isGuest || type === "guest" || type === "convidado") return "guest";
    return "registered";
  }

  function customerTypeLabel(order) {
    const type = customerTypeKey(order);
    if (type === "email_only") return "Apenas email";
    return type === "guest" ? "Convidado" : "Cadastrado";
  }

  function orderDetails(order) {
    const customerType = customerTypeLabel(order);
    const supplier = order.fornecedor ? `<aside class="admin-order-supplier"><span>Comprar no fornecedor</span><strong>${escapeHtml(order.fornecedor)}</strong><small>Custo Pix usado: ${escapeHtml(formatBRL(order.custoFornecedorBRL))}</small>${order.linkFornecedor ? `<a href="${escapeHtml(order.linkFornecedor)}" target="_blank" rel="noopener">Abrir produto no fornecedor</a>` : ""}</aside>` : "";
    const backup = ["blob", "blob-fallback"].includes(order.storageSource)
      ? '<aside class="admin-order-supplier"><span>Rede de segurança</span><strong>Guardado no Netlify Blobs</strong><small>Este pedido ainda não tem uma cópia confirmada no Airtable.</small></aside>'
      : "";
    return `<dl class="admin-order-details">
      <div><dt>Tipo de cliente</dt><dd>${customerType}</dd></div>
      <div><dt>Cliente</dt><dd>${escapeHtml(order.clienteNome || "Nome não indicado")}</dd></div>
      <div><dt>Email</dt><dd><a href="mailto:${escapeHtml(order.clienteEmail)}">${escapeHtml(order.clienteEmail || "Email não indicado")}</a></dd></div>
      <div><dt>Plataforma</dt><dd>${escapeHtml(order.plataforma || "Não indicada")}</dd></div>
      <div><dt>Valor pago</dt><dd>${formatPrice(order.valorPagoEUR)}</dd></div>
      <div><dt>Data</dt><dd>${formatDate(order.dataCompra)}</dd></div>
      <div class="admin-order-session"><dt>Sessão Stripe</dt><dd title="${escapeHtml(order.stripeSessionId)}">${escapeHtml(order.stripeSessionId || "Sem sessão")}</dd></div>
    </dl>${backup}${supplier}`;
  }

  function orderCard(order) {
    const mode = normalizeStatus(order.status);
    const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(order.clienteEmail || "").trim());
    const article = document.createElement("article");
    article.className = `admin-order-card admin-order-${mode}`;
    const cover = productImage(order);
    const customerType = customerTypeKey(order);
    const customerTypeBadge = `<span class="admin-customer-type-badge ${customerType === "registered" ? "registered" : "guest"}">${customerTypeLabel(order)}</span>`;
    article.innerHTML = `
      <div class="admin-order-primary"><div class="admin-order-title"><div class="admin-order-product">${cover ? `<img src="${escapeHtml(cover)}" alt="Capa de ${escapeHtml(order.produto || "jogo comprado")}" loading="lazy" />` : ""}<div><small>Pedido ${escapeHtml(order.id)}</small><span>Jogo comprado</span><strong>${escapeHtml(order.produto || "Produto sem nome")}</strong></div></div><div class="admin-order-badges">${customerTypeBadge}<mark data-status="${mode}">${statusLabel(order)}</mark></div></div>${orderDetails(order)}</div>
      <div class="admin-order-action">
        ${mode === "pending" && hasValidEmail ? `<form class="admin-send-form" data-send-order><label>Código ou dados da conta<textarea name="codigo" rows="4" maxlength="4000" placeholder="Cola aqui o código, email, palavra-passe e instruções necessárias" autocomplete="off" autocapitalize="off" spellcheck="false" required></textarea></label><div class="admin-action-row"><button type="submit">Enviar ao cliente</button><button class="admin-danger-button" type="button" data-order-status="Cancelado">Cancelar pedido</button></div></form>`
          : mode === "pending" ? `<div class="admin-cancelled-box"><p><strong>Pedido incompleto:</strong> falta um email de cliente válido. Este registo não pode receber uma entrega.</p><button class="admin-danger-button" type="button" data-order-status="Cancelado">Retirar da fila</button></div>`
          : mode === "sent" ? `<div class="admin-code-box"><span>Dados entregues</span><code>${escapeHtml(order.codigo || "Sem dados guardados")}</code></div>`
            : `<div class="admin-cancelled-box"><p>Este pedido não está na fila de entrega.</p><button class="admin-secondary-button" type="button" data-order-status="Aguardando codigo">Reabrir pedido</button></div>`}
      </div>`;
    article.querySelector("[data-send-order]")?.addEventListener("submit", (event) => sendOrder(event, order, article));
    const deliveryField = article.querySelector('textarea[name="codigo"]');
    deliveryField?.addEventListener("pointerdown", () => deliveryField.focus());
    article.querySelector("[data-order-status]")?.addEventListener("click", (event) => changeStatus(order, event.currentTarget.dataset.orderStatus, event.currentTarget));
    return article;
  }

  function renderOrders() {
    const [title, copy] = FILTER_COPY[state.filter];
    document.querySelector("[data-admin-list-title]").textContent = title;
    document.querySelector("[data-admin-list-copy]").textContent = copy;
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.adminTab === state.filter));
    customerTypeFilters.forEach((button) => button.classList.toggle("active", button.dataset.adminCustomerType === state.customerType));
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
      const data = await apiRequest("/.netlify/functions/marcar-pedido-enviado", { method: "POST", body: JSON.stringify({ recordId: order.id, codigo }) });
      const index = state.orders.findIndex((item) => item.id === order.id);
      if (index >= 0) state.orders[index] = data.pedido;
      article.remove();
      refreshAllViews();
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
      const data = await apiRequest("/.netlify/functions/atualizar-pedido-status", { method: "POST", body: JSON.stringify({ recordId: order.id, status }) });
      const index = state.orders.findIndex((item) => item.id === order.id);
      if (index >= 0) state.orders[index] = data.pedido;
      refreshAllViews();
      setNotice(status === "Cancelado" ? "Pedido cancelado." : "Pedido reaberto e devolvido à fila.", "success");
    } catch (error) {
      if (["login_required", "admin_required"].includes(error.code)) return;
      button.disabled = false;
      setNotice(errorMessage(error, "Não foi possível atualizar o pedido."), "error");
    }
  }

  function productImage(product) {
    const value = product.imagem || product.capaSteamGridDB || product.screenshots?.[0] || product.imagemFallback || "";
    try {
      const url = new URL(value, window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function renderCatalog() {
    const query = state.catalogQuery.toLowerCase().trim();
    const products = state.catalog.filter((product) => !query || [product.nome, product.plataforma, ...(product.genres || [])].join(" ").toLowerCase().includes(query)).slice(0, 30);
    const container = document.querySelector("[data-admin-catalog-list]");
    if (!container) return;
    container.innerHTML = products.length ? products.map((product) => `
      <article class="admin-catalog-item${product.naoFoiPossivelIgualarConcorrente ? " admin-catalog-warning" : ""}">
        <img src="${escapeHtml(productImage(product))}" alt="" loading="lazy" />
        <div class="admin-catalog-copy"><a href="produto.html?id=${encodeURIComponent(product.id)}" target="_blank" rel="noopener"><strong title="${escapeHtml(product.nome)}">${escapeHtml(product.nome)}</strong></a><small>${escapeHtml(product.plataforma)} · ${(product.genres || []).slice(0, 2).map(escapeHtml).join(", ") || "Sem género"}</small><small>${escapeHtml(product.fornecedorSelecionado || "Fornecedor não definido")} · custo Pix ${escapeHtml(formatBRL(product.custoFornecedorBRL))}</small>${product.naoFoiPossivelIgualarConcorrente ? '<mark>Não foi possível igualar o concorrente</mark>' : ""}</div>
        <div class="admin-catalog-price"><strong>${escapeHtml(formatPrice(product.precoVendaEUR))}</strong>${product.linkFornecedorSelecionado ? `<a href="${escapeHtml(product.linkFornecedorSelecionado)}" target="_blank" rel="noopener">Fornecedor</a>` : ""}</div>
      </article>`).join("") : '<div class="admin-empty">Nenhum produto encontrado.</div>';
  }

  function updateCatalogSummary() {
    const today = new Date();
    const discounted = state.catalog.filter((product) => Number(product.precoOriginalEUR) > Number(product.precoVendaEUR)).length;
    const preorders = state.catalog.filter((product) => product.released && new Date(product.released) > today).length;
    const average = state.catalog.length ? state.catalog.reduce((sum, product) => sum + Number(product.precoVendaEUR || 0), 0) / state.catalog.length : 0;
    const values = { total: state.catalog.length, discounted, preorders, average: formatPrice(average) };
    Object.entries(values).forEach(([key, value]) => {
      document.querySelectorAll(`[data-catalog-metric="${key}"]`).forEach((element) => { element.textContent = String(value); });
    });
    const task = document.querySelector('[data-admin-task="catalog"]');
    if (task) task.textContent = `${state.catalog.length} produtos publicados`;
  }

  function customerData() {
    const map = new Map();
    activeSales(state.orders).forEach((order) => {
      const email = String(order.clienteEmail || "Email não indicado").toLowerCase();
      const current = map.get(email) || { email, name: order.clienteNome || "Cliente", orders: 0, spend: 0, lastOrder: "" };
      current.orders += 1;
      current.spend += Number(order.valorPagoEUR || 0);
      if (!current.lastOrder || new Date(order.dataCompra) > new Date(current.lastOrder)) current.lastOrder = order.dataCompra;
      map.set(email, current);
    });
    return [...map.values()].sort((a, b) => b.spend - a.spend);
  }

  function renderCustomers() {
    const customers = customerData();
    const query = state.customerQuery.toLowerCase().trim();
    const filtered = customers.filter((customer) => !query || `${customer.name} ${customer.email}`.toLowerCase().includes(query));
    const returning = customers.filter((customer) => customer.orders > 1).length;
    const totalSpend = customers.reduce((sum, customer) => sum + customer.spend, 0);
    const values = { total: customers.length, returning, average: formatPrice(customers.length ? totalSpend / customers.length : 0) };
    Object.entries(values).forEach(([key, value]) => {
      document.querySelectorAll(`[data-customer-metric="${key}"]`).forEach((element) => { element.textContent = String(value); });
    });
    const container = document.querySelector("[data-admin-customer-list]");
    container.innerHTML = filtered.length ? filtered.map((customer) => `
      <div class="admin-customer-row"><div><strong>${escapeHtml(customer.name)}</strong><small>${escapeHtml(customer.email)}</small></div><span><small>Pedidos</small><strong>${customer.orders}</strong></span><span><small>Total gasto</small><strong>${escapeHtml(formatPrice(customer.spend))}</strong></span><span><small>Última compra</small><strong>${escapeHtml(formatDate(customer.lastOrder, { dateStyle: "short" }))}</strong></span></div>`).join("")
      : '<div class="admin-empty">Nenhum cliente encontrado.</div>';
  }

  function refreshAllViews() {
    updateSummary();
    updateDashboard();
    renderOrders();
    renderCustomers();
    window.lucide?.createIcons();
  }

  async function loadCatalog() {
    try {
      const data = await apiRequest("/.netlify/functions/admin-catalogo");
      state.catalog = data.produtos || [];
      updateCatalogSummary();
      renderCatalog();
    } catch (error) {
      console.error("[admin] falha ao carregar catálogo", error);
      document.querySelector("[data-admin-catalog-list]").innerHTML = '<div class="admin-empty">Não foi possível carregar o catálogo.</div>';
    }
  }

  async function loadOrders() {
    if (state.loading) return;
    state.loading = true;
    if (!state.orders.length) orderList.innerHTML = '<div class="admin-loading">A carregar pedidos...</div>';
    setNotice("");
    try {
      const data = await apiRequest("/.netlify/functions/admin-pedidos?status=all");
      state.orders = (data.pedidos || []).sort((a, b) => new Date(b.dataCompra || 0) - new Date(a.dataCompra || 0));
      refreshAllViews();
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

  async function recoverPaidOrder(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const sessionId = String(formData.get("sessionId") || "").trim();
    if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId) || button.disabled) {
      form.reportValidity();
      return;
    }
    button.disabled = true;
    button.textContent = "A recuperar...";
    setNotice("A confirmar o pagamento diretamente no Stripe...", "info");
    try {
      const data = await apiRequest("/.netlify/functions/admin-recuperar-pedido", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          sendConfirmation: formData.get("sendConfirmation") === "on"
        })
      });
      const recoveredOrder = data.pedido;
      if (recoveredOrder) {
        const index = state.orders.findIndex((order) => order.stripeSessionId === recoveredOrder.stripeSessionId || order.id === recoveredOrder.id);
        if (index >= 0) state.orders[index] = recoveredOrder;
        else state.orders.unshift(recoveredOrder);
      }
      form.reset();
      form.querySelector('[name="sendConfirmation"]').checked = true;
      state.filter = "pending";
      refreshAllViews();
      setNotice(data.existing
        ? "Este pedido já estava guardado e foi localizado com sucesso."
        : `Pedido recuperado${data.confirmationEmailSent ? " e confirmação enviada ao cliente" : ""}.`, "success");
    } catch (error) {
      if (["login_required", "admin_required"].includes(error.code)) return;
      const messages = {
        invalid_session_id: "O Session ID não é válido.",
        payment_not_paid: "A sessão existe, mas o Stripe não a apresenta como paga.",
        missing_order_data: "O Stripe não devolveu email ou produto suficientes para recuperar o pedido."
      };
      setNotice(messages[error.code] || "Não foi possível recuperar este pedido. Consulta os logs da Function.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Recuperar pedido";
    }
  }

  function boot(user) {
    if (!user) {
      redirectToLogin();
      return;
    }
    if (state.booted) return;
    state.booted = true;
    shell.hidden = false;
    if (searchInput) searchInput.value = state.query;
    if (catalogSearch) catalogSearch.value = state.catalogQuery;
    if (customerSearch) customerSearch.value = state.customerQuery;
    document.querySelectorAll("[data-admin-period]").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.adminPeriod) === state.period);
    });
    setView(state.view);
    window.lucide?.createIcons();
    loadOrders();
    loadCatalog();
    loadPresence();
    window.setInterval(loadPresence, 20 * 1000);
  }

  document.querySelectorAll("[data-admin-view-button]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.adminViewButton)));
  document.querySelectorAll("[data-admin-view-target]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.adminViewTarget)));
  document.querySelectorAll("[data-admin-go-orders]").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.adminGoOrders;
    setView("orders");
  }));
  document.querySelectorAll("[data-admin-period]").forEach((button) => button.addEventListener("click", () => {
    state.period = Number(button.dataset.adminPeriod);
    document.querySelectorAll("[data-admin-period]").forEach((item) => item.classList.toggle("active", item === button));
    updateDashboard();
    saveUi();
  }));
  document.querySelectorAll("[data-admin-visits-period]").forEach((button) => button.addEventListener("click", () => {
    state.visitsPeriod = Number(button.dataset.adminVisitsPeriod);
    document.querySelectorAll("[data-admin-visits-period]").forEach((item) => item.classList.toggle("active", item === button));
    renderVisitsChart();
  }));
  tabs.forEach((tab) => tab.addEventListener("click", () => { state.filter = tab.dataset.adminTab; renderOrders(); saveUi(); }));
  customerTypeFilters.forEach((button) => button.addEventListener("click", () => {
    state.customerType = button.dataset.adminCustomerType;
    renderOrders();
    saveUi();
  }));
  searchInput?.addEventListener("input", () => { state.query = searchInput.value; renderOrders(); saveUi(); });
  catalogSearch?.addEventListener("input", () => { state.catalogQuery = catalogSearch.value; renderCatalog(); saveUi(); });
  customerSearch?.addEventListener("input", () => { state.customerQuery = customerSearch.value; renderCustomers(); saveUi(); });
  recoveryForm?.addEventListener("submit", recoverPaidOrder);
  document.querySelectorAll("[data-admin-refresh]").forEach((button) => button.addEventListener("click", () => { loadOrders(); loadCatalog(); loadPresence(); }));
  document.querySelector("[data-admin-menu]")?.addEventListener("click", () => document.body.classList.toggle("admin-menu-open"));
  document.querySelector("[data-admin-menu-close]")?.addEventListener("click", () => document.body.classList.remove("admin-menu-open"));

  if (!identity) {
    redirectToLogin();
    return;
  }
  identity.on("init", boot);
  identity.on("login", boot);
  const currentUser = identity.currentUser?.();
  if (currentUser) boot(currentUser);
  window.setTimeout(() => { if (!identity.currentUser?.()) redirectToLogin(); }, 1400);
})();

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
