(function () {
  const STORAGE_KEY = "galaxygame-chat-v1";
  const MAX_MESSAGES = 8;
  const suggestions = [
    "Recomenda-me um jogo",
    "Tenho ate 30 euros",
    "Quero um jogo para PS5",
    "Como funciona a entrega?"
  ];
  let messages = readSession();
  let sending = false;

  function readSession() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      return Array.isArray(stored) ? stored.filter(validMessage).slice(-MAX_MESSAGES) : [];
    } catch {
      return [];
    }
  }

  function validMessage(message) {
    return ["user", "assistant"].includes(message?.role) && typeof message?.content === "string" && message.content.length <= 1200;
  }

  function saveSession() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function formatEUR(value) {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function mountStyles() {
    if (document.querySelector('link[data-chat-styles]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "chat.css?v=20260720-3";
    link.dataset.chatStyles = "";
    document.head.append(link);
  }

  function createUi() {
    const root = el("div", "sales-chat");
    root.innerHTML = `
      <button class="sales-chat-toggle" type="button" aria-label="Abrir chat IA de compras" aria-expanded="false"><span class="sales-chat-toggle-icon" aria-hidden="true">AI</span><b><strong>Chat IA</strong><small>Ajuda instantanea</small></b></button>
      <section class="sales-chat-panel" role="dialog" aria-label="Assistente de compras" aria-hidden="true">
        <header class="sales-chat-header">
          <div><span class="sales-chat-status" aria-hidden="true"></span><span><strong>Assistente de compras</strong><small>Online para te ajudar</small></span></div>
          <span class="sales-chat-actions"><button type="button" data-chat-clear title="Limpar conversa">Limpar</button><button type="button" data-chat-close aria-label="Fechar assistente">x</button></span>
        </header>
        <div class="sales-chat-messages" data-chat-messages aria-live="polite"></div>
        <div class="sales-chat-suggestions" data-chat-suggestions></div>
        <form class="sales-chat-form" data-chat-form>
          <label class="sr-only" for="sales-chat-input">Escreve a tua mensagem</label>
          <textarea id="sales-chat-input" maxlength="1200" rows="1" placeholder="Em que posso ajudar?" required></textarea>
          <button type="submit" aria-label="Enviar mensagem">Enviar</button>
        </form>
        <p class="sales-chat-note">Nao partilhes palavras-passe nem dados bancarios.</p>
      </section>`;
    document.body.append(root);
    return root;
  }

  function renderMessage(container, message) {
    const article = el("article", `sales-chat-message ${message.role}`);
    const bubble = el("div", "sales-chat-bubble", message.content);
    article.append(bubble);
    if (Array.isArray(message.products) && message.products.length) {
      const list = el("div", "sales-chat-products");
      message.products.forEach((product) => {
        const link = el("a", "sales-chat-product");
        link.href = product.url;
        if (product.image) {
          const image = document.createElement("img");
          image.src = product.image;
          image.alt = "";
          image.loading = "lazy";
          image.addEventListener("error", () => image.remove(), { once: true });
          link.append(image);
        }
        const copy = el("span");
        copy.append(el("strong", "", product.name), el("small", "", product.platform));
        link.append(copy, el("b", "", formatEUR(product.price)));
        list.append(link);
      });
      article.append(list);
    }
    container.append(article);
  }

  function render(root) {
    const container = root.querySelector("[data-chat-messages]");
    container.replaceChildren();
    if (!messages.length) {
      renderMessage(container, {
        role: "assistant",
        content: "Ola! Posso ajudar-te a encontrar um jogo para a tua consola, dentro do teu orcamento, ou explicar a entrega em ate 10 minutos na tua conta GalaxyGame + email apos confirmacao do pagamento."
      });
    } else {
      messages.forEach((message) => renderMessage(container, message));
    }
    const suggestionBox = root.querySelector("[data-chat-suggestions]");
    suggestionBox.replaceChildren();
    if (!messages.length) {
      suggestions.forEach((text) => {
        const button = el("button", "", text);
        button.type = "button";
        button.addEventListener("click", () => submitMessage(root, text));
        suggestionBox.append(button);
      });
    }
    requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
  }

  function setOpen(root, open) {
    const panel = root.querySelector(".sales-chat-panel");
    const toggle = root.querySelector(".sales-chat-toggle");
    root.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar assistente de compras" : "Abrir assistente de compras");
    sessionStorage.setItem(`${STORAGE_KEY}-open`, open ? "1" : "0");
    if (open) setTimeout(() => root.querySelector("textarea").focus(), 100);
  }

  function setTyping(root, active) {
    root.classList.toggle("is-sending", active);
    root.querySelector("textarea").disabled = active;
    root.querySelector('[type="submit"]').disabled = active;
    const container = root.querySelector("[data-chat-messages]");
    container.querySelector(".sales-chat-typing")?.remove();
    if (active) {
      const typing = el("div", "sales-chat-typing");
      typing.setAttribute("aria-label", "A assistente esta a escrever");
      typing.innerHTML = "<i></i><i></i><i></i>";
      container.append(typing);
      container.scrollTop = container.scrollHeight;
    }
  }

  async function submitMessage(root, rawText) {
    const text = String(rawText || "").trim();
    if (!text || sending) return;
    sending = true;
    messages.push({ role: "user", content: text });
    messages = messages.slice(-MAX_MESSAGES);
    saveSession();
    render(root);
    setTyping(root, true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const history = messages.slice(0, -1).map(({ role, content }) => ({ role, content }));
      const response = await fetch("/.netlify/functions/chat-ia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, history }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(data.error || "Nao foi possivel responder."), { status: response.status });
      messages.push({ role: "assistant", content: data.reply, products: Array.isArray(data.products) ? data.products : [] });
    } catch (error) {
      const content = error.name === "AbortError"
        ? "A resposta demorou mais do que o esperado. Tenta novamente dentro de instantes."
        : (error.message || "Nao consegui responder agora. Tenta novamente ou contacta gamegalaxy26@gmail.com.");
      messages.push({ role: "assistant", content });
    } finally {
      clearTimeout(timeout);
      messages = messages.slice(-MAX_MESSAGES);
      saveSession();
      sending = false;
      setTyping(root, false);
      render(root);
    }
  }

  function init() {
    mountStyles();
    const root = createUi();
    render(root);
    setOpen(root, sessionStorage.getItem(`${STORAGE_KEY}-open`) === "1");
    root.querySelector(".sales-chat-toggle").addEventListener("click", () => setOpen(root, !root.classList.contains("is-open")));
    root.querySelector("[data-chat-close]").addEventListener("click", () => setOpen(root, false));
    root.querySelector("[data-chat-clear]").addEventListener("click", () => {
      messages = [];
      saveSession();
      render(root);
    });
    const form = root.querySelector("[data-chat-form]");
    const input = form.querySelector("textarea");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value;
      input.value = "";
      submitMessage(root, value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
