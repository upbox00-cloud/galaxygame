(function trackConfirmedPurchase() {
  const sessionId = new URLSearchParams(window.location.search).get("session_id") || "";
  if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) return;

  const storageKey = `galaxygame-meta-purchase:${sessionId}`;
  try {
    if (window.sessionStorage.getItem(storageKey) === "tracked") return;
  } catch {
    // Continue without browser-side deduplication when storage is unavailable.
  }

  const identity = window.netlifyIdentity;
  if (!identity) {
    console.warn("[purchase] Netlify Identity indisponivel");
    return;
  }

  let requestInFlight = false;
  async function validateAndTrack(user) {
    if (!user || requestInFlight) return;
    try {
      if (window.sessionStorage.getItem(storageKey) === "tracked") return;
    } catch {
      // Continue; the Stripe session remains the event identifier.
    }

    requestInFlight = true;
    try {
      const token = await user.jwt();
      const response = await fetch(`/.netlify/functions/confirmar-compra?session_id=${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${token}` },
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

  identity.on("init", validateAndTrack);
  identity.on("login", validateAndTrack);
  validateAndTrack(identity.currentUser?.());
})();
