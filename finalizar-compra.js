(function initializeQuickCheckout() {
  const params = new URLSearchParams(window.location.search);
  const productId = String(params.get("produto") || "").trim();
  const errorBox = document.querySelector("[data-checkout-error]");
  const emailForm = document.querySelector("[data-email-checkout]");
  const accountPanel = document.querySelector("[data-signed-in]");
  const accountChoice = document.querySelector("[data-account-choice]");
  const guestDivider = document.querySelector("[data-guest-divider]");
  const accountButton = document.querySelector("[data-account-checkout]");
  let product = null;
  let submitting = false;

  const specialProducts = [
    { id: "gta-vi-ps5", nome: "Grand Theft Auto VI - PlayStation 5", plataforma: "PlayStation 5", precoVendaEUR: 57.99, precoOriginalEUR: 79.99, capaSteamGridDB: "assets/gta-vi-original.webp", imagemFallback: "assets/gta-vi-landscape-hq.webp" },
    { id: "gta-vi-xbox-series", nome: "Grand Theft Auto VI - Xbox Series X|S", plataforma: "Xbox Series X|S", precoVendaEUR: 69.99, precoOriginalEUR: 74.99, capaSteamGridDB: "assets/gta-vi-original.webp", imagemFallback: "assets/gta-vi-landscape-hq.webp" }
  ];

  function formatEUR(value) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function productImage(item) {
    const screenshots = Array.isArray(item?.screenshots) ? item.screenshots : [];
    return item?.capaSteamGridDB || item?.imagemPrincipal || item?.imagemFallback || screenshots[0] || "assets/site-cosmic-gaming-bg.webp";
  }

  function checkoutReturnPath() {
    return `finalizar-compra.html?produto=${encodeURIComponent(productId)}`;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    button.textContent = busy ? "A abrir pagamento..." : button.dataset.originalLabel;
  }

  function trackCheckout() {
    if (typeof window.fbq !== "function" || !product) return;
    const value = Number(product.precoVendaEUR || 0);
    window.fbq("track", "InitiateCheckout", {
      content_ids: [String(product.id)],
      content_name: String(product.nome || "Jogo digital"),
      content_type: "product",
      contents: [{ id: String(product.id), quantity: 1, item_price: value }],
      num_items: 1,
      value,
      currency: "EUR"
    });
  }

  async function beginCheckout({ email = "", user = null, checkoutMode }) {
    if (!product || submitting) return;
    submitting = true;
    showError("");
    const button = user ? accountButton : emailForm.querySelector("button[type='submit']");
    setBusy(button, true);

    try {
      const headers = { "content-type": "application/json" };
      if (user) headers.Authorization = `Bearer ${await user.jwt()}`;
      const response = await fetch("/.netlify/functions/criar-checkout", {
        method: "POST",
        headers,
        body: JSON.stringify({
          items: [{ id: product.id }],
          email: user ? undefined : email,
          checkoutMode,
          cancelUrl: checkoutReturnPath()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error || `checkout_${response.status}`);
      trackCheckout();
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      console.error("[finalizar-compra] não foi possível iniciar o checkout", {
        message: String(error?.message || "erro desconhecido").slice(0, 180)
      });
      showError("Não foi possível abrir o pagamento agora. Confirma a ligação e tenta novamente.");
      submitting = false;
      setBusy(button, false);
    }
  }

  function renderProduct() {
    document.querySelector("[data-product-name]").textContent = product.nome || "Jogo digital";
    document.querySelector("[data-product-platform]").textContent = product.plataforma || "Consola";
    document.querySelector("[data-product-price]").textContent = formatEUR(product.precoVendaEUR);
    const oldPrice = document.querySelector("[data-product-old-price]");
    const original = Number(product.precoOriginalEUR || 0);
    const sale = Number(product.precoVendaEUR || 0);
    oldPrice.hidden = !(original > sale);
    if (!oldPrice.hidden) oldPrice.textContent = formatEUR(original);
    const image = document.querySelector("[data-product-image]");
    image.src = productImage(product);
    image.alt = `Capa de ${product.nome || "jogo digital"}`;
    image.addEventListener("error", () => {
      if (!image.src.endsWith("assets/site-cosmic-gaming-bg.webp")) image.src = "assets/site-cosmic-gaming-bg.webp";
    }, { once: true });
    document.querySelector("[data-product-back]").href = `produto.html?id=${encodeURIComponent(product.id)}`;
    document.title = `Finalizar ${product.nome} | GalaxyGame`;
  }

  function setLoginLinks() {
    const redirect = encodeURIComponent(checkoutReturnPath());
    document.querySelector("[data-create-account]").href = `login.html?mode=signup&redirect=${redirect}`;
    document.querySelector("[data-login-account]").href = `login.html?mode=login&redirect=${redirect}`;
  }

  function renderIdentity(user) {
    const signedIn = Boolean(user);
    accountPanel.hidden = !signedIn;
    accountChoice.hidden = signedIn;
    guestDivider.hidden = signedIn;
    emailForm.hidden = signedIn;
    if (signedIn) document.querySelector("[data-account-email]").textContent = user.email || "Conta GalaxyGame";
  }

  async function loadProduct() {
    if (!productId) throw new Error("missing_product");
    const response = await fetch("data/catalog-lite.json", { cache: "no-store" });
    if (!response.ok) throw new Error("catalog_unavailable");
    const catalog = await response.json();
    product = [...specialProducts, ...(Array.isArray(catalog) ? catalog : [])].find((item) => String(item.id) === productId);
    if (!product) throw new Error("product_not_found");
    renderProduct();
  }

  emailForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!emailForm.reportValidity()) return;
    const email = String(new FormData(emailForm).get("email") || "").trim().toLowerCase();
    beginCheckout({ email, checkoutMode: "email_only" });
  });

  accountButton.addEventListener("click", () => {
    const user = window.netlifyIdentity?.currentUser?.();
    if (!user) {
      renderIdentity(null);
      return;
    }
    beginCheckout({ user, checkoutMode: "registered" });
  });

  setLoginLinks();
  accountButton.dataset.originalLabel = accountButton.textContent;
  emailForm.querySelector("button[type='submit']").dataset.originalLabel = emailForm.querySelector("button[type='submit']").textContent;
  renderIdentity(window.netlifyIdentity?.currentUser?.() || null);
  window.netlifyIdentity?.on?.("init", renderIdentity);
  window.netlifyIdentity?.on?.("login", renderIdentity);
  window.netlifyIdentity?.on?.("logout", () => renderIdentity(null));

  loadProduct().catch((error) => {
    console.error("[finalizar-compra] produto indisponível", { message: error.message });
    document.querySelector(".quick-checkout-layout").innerHTML = '<section class="quick-identification"><h2>Não foi possível abrir este jogo</h2><p>Volta ao catálogo e seleciona o produto novamente.</p><a class="quick-checkout-back" href="catalogo.html">Explorar catálogo</a></section>';
  });
})();
