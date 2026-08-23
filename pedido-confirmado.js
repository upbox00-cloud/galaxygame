(function trackConfirmedPurchase() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id") || "";
  const isGuestCheckout = params.get("guest") === "1";

  if (isGuestCheckout) {
    const copy = document.querySelector("[data-confirm-copy]");
    const sub = document.querySelector("[data-confirm-sub]");
    const primary = document.querySelector("[data-confirm-primary]");
    const secondary = document.querySelector("[data-confirm-secondary]");
    const guestAccount = document.querySelector("[data-confirm-guest]");
    if (copy) copy.textContent = "A confirmação foi enviada para o email usado no pagamento.";
    if (sub) sub.textContent = "Quando a entrega estiver pronta, vais receber nesse email o código ou os dados de acesso e as instruções do jogo.";
    if (primary) {
      primary.href = "login.html?mode=signup&redirect=minha-conta.html";
      primary.textContent = "Criar minha conta";
    }
    if (secondary) secondary.textContent = "Agora não";
    if (guestAccount) guestAccount.hidden = false;
  }

  if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) return;

  const storageKey = `galaxygame-meta-purchase:${sessionId}`;
  try {
    if (window.sessionStorage.getItem(storageKey) === "tracked") return;
  } catch {
    // Continue without browser-side deduplication when storage is unavailable.
  }

  const identity = window.netlifyIdentity || null;

  let requestInFlight = false;
  async function validateAndTrack(user = identity?.currentUser?.() || null) {
    if (requestInFlight) return;
    if (!window.GalaxyGameConsent?.hasMarketingConsent()) return;
    try {
      if (window.sessionStorage.getItem(storageKey) === "tracked") return;
    } catch {
      // Continue; the Stripe session remains the event identifier.
    }

    requestInFlight = true;
    try {
      const token = user ? await user.jwt() : "";
      const response = await fetch(`/.netlify/functions/confirmar-compra?session_id=${encodeURIComponent(sessionId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store"
      });
      const purchase = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(purchase.error || "purchase_validation_failed");
      if (purchase.currency !== "EUR" || !Number.isFinite(Number(purchase.value)) || purchase.transactionId !== sessionId) {
        throw new Error("invalid_purchase_payload");
      }
      if (typeof window.fbq !== "function") throw new Error("meta_pixel_unavailable");

      window.fbq("track", "Purchase", {
        value: Number(purchase.value),
        currency: "EUR"
      }, { eventID: purchase.transactionId });
      try {
        window.sessionStorage.setItem(storageKey, "tracked");
      } catch {
        // Tracking succeeded; storage is only an extra browser-side guard.
      }
    } catch (error) {
      console.error("[purchase] evento nao enviado", { message: error.message });
    } finally {
      requestInFlight = false;
    }
  }

  identity?.on("init", validateAndTrack);
  identity?.on("login", validateAndTrack);
  window.addEventListener("galaxygame:consent", (event) => {
    if (event.detail?.choice === "accepted") validateAndTrack();
  });
  validateAndTrack();
})();
