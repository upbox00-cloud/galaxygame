(function redirectLegacyCheckout() {
  const params = new URLSearchParams(window.location.search);
  const productId = String(params.get("produto") || "").trim();
  const layout = document.querySelector(".quick-checkout-layout");

  function renderStatus(title, copy, retry = false) {
    if (!layout) return;
    layout.innerHTML = `
      <section class="quick-identification">
        <h2>${title}</h2>
        <p>${copy}</p>
        ${retry ? '<button class="quick-checkout-submit" type="button" data-legacy-retry>Tentar novamente</button>' : ""}
        <a class="quick-checkout-back" href="${productId ? `produto.html?id=${encodeURIComponent(productId)}` : "catalogo.html"}">Voltar ao jogo</a>
      </section>`;
    layout.querySelector("[data-legacy-retry]")?.addEventListener("click", startCheckout);
  }

  async function startCheckout() {
    if (!productId) {
      renderStatus("Produto não identificado", "Volta ao catálogo e seleciona o jogo novamente.");
      return;
    }
    renderStatus("A abrir o pagamento seguro", "Serás encaminhado diretamente para o Stripe, onde podes indicar o teu email e concluir a compra.");
    try {
      const user = window.netlifyIdentity?.currentUser?.() || null;
      const token = user ? await user.jwt() : "";
      const response = await fetch("/.netlify/functions/criar-checkout", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          items: [{ id: productId }],
          checkoutMode: user ? "registered" : "guest",
          cancelUrl: `produto.html?id=${encodeURIComponent(productId)}`
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error || "checkout_failed");
      window.location.replace(data.checkoutUrl);
    } catch (error) {
      console.error("[finalizar-compra]", { message: error.message });
      renderStatus("Não foi possível abrir o pagamento", "Confirma a ligação e tenta novamente dentro de instantes.", true);
    }
  }

  startCheckout();
})();
