(function initializeAnonymousPresence() {
  if (window.__GalaxyGamePresenceReady) return;
  window.__GalaxyGamePresenceReady = true;

  const STORAGE_KEY = "galaxygame_presence_visitor_v2";
  const LEGACY_STORAGE_KEY = "galaxygame_presence_session";
  const HEARTBEAT_INTERVAL_MS = 45 * 1000;
  const AUTOMATION_PATTERN = /bot|crawler|spider|headless|lighthouse|pagespeed|speed insights|preview/i;

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, "");
    const random = `${Date.now()}_${Math.random()}_${Math.random()}`;
    return random.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 48).padEnd(16, "0");
  }

  function visitorId() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) return current;
      const legacy = sessionStorage.getItem(LEGACY_STORAGE_KEY);
      const created = legacy || createId();
      localStorage.setItem(STORAGE_KEY, created);
      return created;
    } catch {
      return createId();
    }
  }

  function shouldTrack() {
    if (navigator.webdriver || AUTOMATION_PATTERN.test(navigator.userAgent || "")) return false;
    if (/^\/(?:admin|painel-pedidos)(?:\.html)?\/?$/i.test(window.location.pathname)) return false;
    try {
      const referrer = new URL(document.referrer);
      if (referrer.origin === window.location.origin && /^\/(?:admin|painel-pedidos)(?:\.html)?\/?$/i.test(referrer.pathname)) return false;
    } catch {
      // Referrers externos ou vazios representam navegação normal da loja.
    }
    return true;
  }

  if (!shouldTrack()) return;
  const anonymousVisitorId = visitorId();
  function heartbeat() {
    if (document.hidden) return;
    fetch("/.netlify/functions/site-presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorId: anonymousVisitorId, page: window.location.pathname }),
      keepalive: true,
      credentials: "same-origin"
    }).catch(() => {});
  }

  heartbeat();
  window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) heartbeat();
  });
})();
