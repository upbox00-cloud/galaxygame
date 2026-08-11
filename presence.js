(function initializeAnonymousPresence() {
  if (window.__GalaxyGamePresenceReady) return;
  window.__GalaxyGamePresenceReady = true;

  const STORAGE_KEY = "galaxygame_presence_session";
  const HEARTBEAT_INTERVAL_MS = 45 * 1000;

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, "");
    const random = `${Date.now()}_${Math.random()}_${Math.random()}`;
    return random.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 48).padEnd(16, "0");
  }

  function sessionId() {
    try {
      const current = sessionStorage.getItem(STORAGE_KEY);
      if (current) return current;
      const created = createId();
      sessionStorage.setItem(STORAGE_KEY, created);
      return created;
    } catch {
      return createId();
    }
  }

  const visitorId = sessionId();
  function heartbeat() {
    if (document.hidden) return;
    fetch("/.netlify/functions/site-presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorId, page: window.location.pathname }),
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
