(function initializeCookieConsent() {
  const STORAGE_KEY = "galaxygame_cookie_consent_v1";
  const CONSENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000;
  const META_PIXEL_ID = "2151605615698965";
  const VALID_CHOICES = new Set(["accepted", "rejected"]);

  function readConsent() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || !VALID_CHOICES.has(saved.choice) || !Number.isFinite(saved.savedAt)) return null;
      if (Date.now() - saved.savedAt > CONSENT_MAX_AGE) {
        window.localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return saved.choice;
    } catch {
      return null;
    }
  }

  function saveConsent(choice) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, savedAt: Date.now() }));
    } catch {
      // The decision still applies to the current page when storage is unavailable.
    }
  }

  function loadMetaPixel() {
    if (window.__galaxyMetaPixelLoaded) return;
    window.__galaxyMetaPixelLoaded = true;

    (function createPixelQueue(f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function pixelQueue() {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

    window.fbq("consent", "grant");
    window.fbq("init", META_PIXEL_ID);
    window.fbq("track", "PageView");
  }

  function expireMarketingCookies() {
    if (typeof window.fbq === "function") window.fbq("consent", "revoke");
    ["_fbp", "_fbc"].forEach((name) => {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.galaxygame.pt; SameSite=Lax`;
    });
  }

  function removeBanner() {
    document.querySelector("[data-cookie-consent]")?.remove();
  }

  function applyChoice(choice) {
    saveConsent(choice);
    removeBanner();
    if (choice === "accepted") loadMetaPixel();
    else expireMarketingCookies();
    window.dispatchEvent(new CustomEvent("galaxygame:consent", { detail: { choice } }));
  }

  function showBanner() {
    if (!document.body || document.querySelector("[data-cookie-consent]")) return;
    const banner = document.createElement("section");
    banner.className = "cookie-consent";
    banner.dataset.cookieConsent = "";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Preferências de cookies");
    banner.innerHTML = `
      <div class="cookie-consent__mark" aria-hidden="true">C</div>
      <div class="cookie-consent__copy">
        <strong>A tua privacidade é importante</strong>
        <p>Usamos cookies essenciais para a loja funcionar. O Meta Pixel só é ativado com a tua autorização para medir campanhas e apresentar ofertas relevantes.</p>
        <a href="cookies.html">Consultar a Política de Cookies</a>
      </div>
      <div class="cookie-consent__actions">
        <button class="cookie-consent__reject" type="button" data-cookie-reject>Apenas essenciais</button>
        <button class="cookie-consent__accept" type="button" data-cookie-accept>Aceitar todos</button>
      </div>`;
    banner.querySelector("[data-cookie-accept]").addEventListener("click", () => applyChoice("accepted"));
    banner.querySelector("[data-cookie-reject]").addEventListener("click", () => applyChoice("rejected"));
    document.body.appendChild(banner);
  }

  function openPreferences() {
    removeBanner();
    showBannerWhenReady();
  }

  function showBannerWhenReady() {
    if (!document.fonts?.load) {
      showBanner();
      return;
    }
    Promise.race([
      document.fonts.load('400 16px "Roboto Condensed"'),
      new Promise((resolve) => window.setTimeout(resolve, 600))
    ]).then(showBanner);
  }

  const consent = readConsent();
  if (consent === "accepted") loadMetaPixel();

  window.GalaxyGameConsent = {
    getChoice: readConsent,
    hasMarketingConsent: () => readConsent() === "accepted",
    openPreferences
  };

  function onReady() {
    if (!readConsent()) showBannerWhenReady();
    document.querySelectorAll("[data-cookie-preferences]").forEach((button) => {
      button.addEventListener("click", openPreferences);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onReady, { once: true });
  else onReady();
})();
