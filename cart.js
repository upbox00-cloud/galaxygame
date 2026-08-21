(function () {
  if (window.__GalaxyGameCartReady) return;
  window.__GalaxyGameCartReady = true;

  const STORAGE_KEY = "galaxygame-cart-v1";

  function readCart() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(stored) ? stored.filter((item) => item?.id && item?.name) : [];
    } catch {
      return [];
    }
  }

  function writeCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("console-cart-change", { detail: { items } }));
  }

  function formatEUR(value) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function trackMetaEvent(eventName, parameters) {
    if (typeof window.fbq !== "function") return;
    try {
      window.fbq("track", eventName, parameters);
    } catch (error) {
      console.warn(`[meta-pixel] falha ao enviar ${eventName}`, error);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function total(items = readCart()) {
    return items.reduce((sum, item) => sum + Number(item.price || 0), 0);
  }

  function add(product) {
    const items = readCart();
    if (items.some((item) => item.id === product.id)) return false;
    items.push({
      id: product.id,
      name: product.name,
      platform: product.platform || "Consola",
      price: Number(product.price || 0),
      originalPrice: Number(product.originalPrice || 0),
      image: product.image || "assets/gta-vi-landscape-hq.webp",
      preorder: product.preorder === true
    });
    writeCart(items);
    return true;
  }

  function remove(id) {
    writeCart(readCart().filter((item) => item.id !== id));
  }

  function clear() {
    writeCart([]);
  }

  function renderHeaderCart() {
    const items = readCart();
    document.querySelectorAll(".cart-button").forEach((button) => {
      button.innerHTML = `
        <span class="cart-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="9" cy="20" r="1.8"></circle>
            <circle cx="18" cy="20" r="1.8"></circle>
            <path d="M3 4h2.2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H7"></path>
          </svg>
        </span>
        <span class="cart-count-badge">${items.length}</span>
      `;
      button.setAttribute("aria-label", `Carrinho com ${items.length} produto${items.length === 1 ? "" : "s"}`);
    });

    document.querySelectorAll("[data-cart-popover]").forEach((popover) => {
      if (!items.length) {
        popover.innerHTML = `
          <div class="mini-cart-empty">
            <strong>O teu carrinho está vazio</strong>
            <p>Explora o catálogo e escolhe o jogo certo para a tua consola.</p>
            <a href="catalogo.html">Explorar catálogo</a>
          </div>`;
        return;
      }

      popover.innerHTML = `
        <div class="mini-cart-heading"><strong>O teu carrinho</strong><span>${items.length} produto${items.length === 1 ? "" : "s"}</span></div>
        <div class="mini-cart-items">
          ${items.slice(-3).reverse().map((item) => `
            <a class="mini-cart-item" href="produto.html?id=${encodeURIComponent(item.id)}">
              <img src="${escapeHtml(item.image)}" alt="" loading="lazy">
              <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.platform)}</small></span>
              <b>${formatEUR(item.price)}</b>
            </a>`).join("")}
        </div>
        ${items.length > 3 ? `<p class="mini-cart-more">E mais ${items.length - 3} produto${items.length - 3 === 1 ? "" : "s"}</p>` : ""}
        <div class="mini-cart-total"><span>Subtotal</span><strong>${formatEUR(total(items))}</strong></div>
        <a class="mini-cart-cta" href="carrinho.html">Ver carrinho e finalizar</a>`;
    });
  }

  function mountHeaderCart() {
    document.querySelectorAll(".cart-button").forEach((button) => {
      if (button.closest(".cart-shell")) return;
      const shell = document.createElement("div");
      shell.className = "cart-shell";
      const popover = document.createElement("div");
      popover.className = "cart-popover";
      popover.dataset.cartPopover = "";
      button.parentNode.insertBefore(shell, button);
      shell.append(button, popover);
      button.type = "button";
      button.setAttribute("aria-haspopup", "true");
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const willOpen = !shell.classList.contains("open");
        closeHeaderCarts(shell);
        shell.classList.toggle("open", willOpen);
        button.setAttribute("aria-expanded", String(willOpen));
      });
    });
    renderHeaderCart();
  }

  function closeHeaderCarts(except = null) {
    document.querySelectorAll(".cart-shell.open").forEach((shell) => {
      if (shell === except) return;
      shell.classList.remove("open");
      shell.querySelector(".cart-button")?.setAttribute("aria-expanded", "false");
    });
  }

  function renderCartPage() {
    const list = document.querySelector("[data-cart-list]");
    if (!list) return;
    const items = readCart();
    const empty = document.querySelector("[data-cart-empty]");
    const content = document.querySelector("[data-cart-content]");
    const count = document.querySelector("[data-cart-count]");
    const subtotal = document.querySelector("[data-cart-subtotal]");
    const finalTotal = document.querySelector("[data-cart-total]");

    empty.hidden = items.length > 0;
    content.hidden = items.length === 0;
    if (count) count.textContent = `${items.length} produto${items.length === 1 ? "" : "s"}`;
    if (subtotal) subtotal.textContent = formatEUR(total(items));
    if (finalTotal) finalTotal.textContent = formatEUR(total(items));

    list.innerHTML = items.map((item) => `
      <article class="cart-line" data-cart-id="${escapeHtml(item.id)}">
        <a class="cart-line-image" href="produto.html?id=${encodeURIComponent(item.id)}"><img src="${escapeHtml(item.image)}" alt="Capa de ${escapeHtml(item.name)}"></a>
        <div class="cart-line-copy">
          <div class="cart-line-tags"><span>${escapeHtml(item.platform)}</span>${item.preorder ? "<span>Pre-venda</span>" : "<span>Conta + email</span>"}</div>
          <a href="produto.html?id=${encodeURIComponent(item.id)}"><h2>${escapeHtml(item.name)}</h2></a>
          <p>${item.preorder ? "Reserva confirmada por email. Com sessao iniciada, tambem fica guardada em Minha Conta." : "Depois da confirmacao do pagamento, recebes por email os dados e as instrucoes da compra."}</p>
          <button type="button" data-cart-remove="${escapeHtml(item.id)}">Remover</button>
        </div>
        <div class="cart-line-price">${item.originalPrice > item.price ? `<s>${formatEUR(item.originalPrice)}</s>` : ""}<strong>${formatEUR(item.price)}</strong></div>
      </article>`).join("");
  }

  function bindCartPage() {
    if (!document.querySelector("[data-cart-page]")) return;
    renderCartPage();
    document.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-cart-remove]");
      if (!removeButton) return;
      remove(removeButton.dataset.cartRemove);
    });
    document.querySelector("[data-cart-clear]")?.addEventListener("click", clear);
    const checkoutForm = document.querySelector("[data-checkout-form]");
    checkoutForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const identity = window.netlifyIdentity;
      const user = identity?.currentUser();
      const notice = document.querySelector("[data-checkout-notice]");
      const button = form.querySelector("button[type='submit']");
      const consent = form.querySelector('.checkout-consent input[type="checkbox"]');
      if (!consent?.checked) {
        consent?.focus();
        form.reportValidity();
        return;
      }

      button.disabled = true;
      button.textContent = "A abrir pagamento seguro...";
      if (notice) notice.hidden = true;
      try {
        const token = user ? await user.jwt() : "";
        const response = await fetch("/.netlify/functions/criar-checkout", {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "content-type": "application/json"
          },
          body: JSON.stringify({
            items: readCart().map((item) => ({ id: item.id })),
            checkoutMode: user ? "registered" : "guest"
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.checkoutUrl) throw new Error(data.error || "checkout_failed");
        const items = readCart();
        const checkoutValue = Number(total(items).toFixed(2));
        trackMetaEvent("InitiateCheckout", {
          content_ids: items.map((item) => String(item.id)),
          content_type: "product",
          contents: items.map((item) => ({
            id: String(item.id),
            quantity: 1,
            item_price: Number(item.price || 0)
          })),
          num_items: items.length,
          value: checkoutValue,
          currency: "EUR"
        });
        window.location.assign(data.checkoutUrl);
      } catch (error) {
        console.error("[checkout]", error.message);
        button.disabled = false;
        button.textContent = "Continuar para pagamento";
        if (notice) {
          notice.hidden = false;
          notice.innerHTML = "<strong>Não foi possível abrir o pagamento</strong><p>Tenta novamente dentro de instantes ou contacta gamegalaxy26@gmail.com.</p>";
          notice.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    });
  }

  window.ConsoleCart = { read: readCart, add, remove, clear, total, formatEUR };
  window.addEventListener("console-cart-change", () => {
    renderHeaderCart();
    renderCartPage();
  });
  window.addEventListener("storage", () => {
    renderHeaderCart();
    renderCartPage();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".cart-shell")) closeHeaderCarts();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHeaderCarts();
  });
  mountHeaderCart();
  bindCartPage();
})();
