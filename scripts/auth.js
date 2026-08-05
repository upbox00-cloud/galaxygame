(function initializeGalaxyGameAuth() {
  if (window.__GalaxyGameAuthReady) return;
  window.__GalaxyGameAuthReady = true;

  const identity = window.netlifyIdentity;
  const accountPage = document.body.classList.contains("account-page");
  const params = new URLSearchParams(window.location.search);
  const userIconSvg = `
    <span class="header-user-icon" data-auth-icon aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M20 21a8 8 0 0 0-16 0"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    </span>`;

  function userLabel(user) {
    return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Minha conta";
  }

  function formatRegistrationDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Não disponível";
    return new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function renderAccount(user) {
    const accountContent = document.querySelector("[data-account-content]");
    if (!accountContent || !user) return;
    document.querySelector("[data-account-name]").textContent = userLabel(user);
    document.querySelector("[data-account-email]").textContent = user.email || "Não disponível";
    document.querySelector("[data-account-created]").textContent = formatRegistrationDate(user.created_at);
    accountContent.hidden = false;
  }

  function enhanceAuthControls() {
    document.querySelectorAll(".auth-controls").forEach((controls) => {
      const duplicateLoginDropdowns = controls.querySelectorAll("[data-auth-login-dropdown]");
      duplicateLoginDropdowns.forEach((dropdown, index) => {
        if (index > 0) dropdown.remove();
      });

      if (controls.dataset.authEnhanced === "true") return;
      controls.dataset.authEnhanced = "true";
      controls.classList.add("account-shell-control");

      const loginButton = controls.querySelector("[data-auth-login]");
      if (loginButton) {
        loginButton.classList.add("account-icon-button");
        loginButton.type = "button";
        loginButton.setAttribute("aria-label", "Conta");
        loginButton.setAttribute("aria-haspopup", "true");
        loginButton.setAttribute("aria-expanded", "false");
        loginButton.innerHTML = `${userIconSvg}<span class="sr-only">Entrar / Criar conta</span>`;

        const loginDropdown = document.createElement("div");
        loginDropdown.className = "auth-dropdown auth-login-dropdown";
        loginDropdown.dataset.authLoginDropdown = "";
        loginDropdown.hidden = true;
        loginDropdown.innerHTML = `
          <button type="button" data-auth-open-login>Entrar</button>
          <button type="button" data-auth-open-signup>Criar conta</button>
        `;
        loginButton.after(loginDropdown);
      }

      const userButton = controls.querySelector("[data-auth-menu]");
      if (userButton) {
        userButton.classList.add("account-icon-button");
        userButton.setAttribute("aria-label", "Abrir menu da conta");
        userButton.innerHTML = `${userIconSvg}<span class="sr-only" data-auth-name>Minha Conta</span>`;
      }
    });
  }

  function updateAuthUI(user) {
    const isLoggedIn = Boolean(user);

    // Rebuild the icon buttons so repeated Identity events can never append icons.
    document.querySelectorAll("[data-auth-login]").forEach((button) => {
      button.innerHTML = `${userIconSvg}<span class="sr-only">Entrar / Criar conta</span>`;
    });
    document.querySelectorAll("[data-auth-menu]").forEach((button) => {
      button.innerHTML = `${userIconSvg}<span class="sr-only" data-auth-name>Minha Conta</span>`;
    });
    document.querySelectorAll("[data-auth-login]").forEach((button) => {
      button.hidden = isLoggedIn;
      button.setAttribute("aria-hidden", String(isLoggedIn));
    });
    document.querySelectorAll("[data-auth-login-dropdown]").forEach((dropdown) => {
      dropdown.hidden = true;
    });
    document.querySelectorAll("[data-auth-user]").forEach((container) => {
      container.hidden = !isLoggedIn;
      container.setAttribute("aria-hidden", String(!isLoggedIn));
    });
    document.querySelectorAll("[data-auth-name]").forEach((element) => {
      element.textContent = userLabel(user);
      element.title = user?.email || "";
    });
    document.querySelectorAll(".auth-controls").forEach((controls) => {
      controls.dataset.authState = isLoggedIn ? "logged-in" : "logged-out";
    });
    renderAccount(user);
  }

  function redirectToLogin() {
    const returnTo = encodeURIComponent("minha-conta.html");
    window.location.replace(`index.html?login=1&redirect=${returnTo}`);
  }

  function closeMenus(except = null) {
    document.querySelectorAll("[data-auth-dropdown], [data-auth-login-dropdown]").forEach((dropdown) => {
      if (dropdown !== except) dropdown.hidden = true;
    });
    document.querySelectorAll("[data-auth-login]").forEach((button) => {
      const dropdown = button.parentElement?.querySelector("[data-auth-login-dropdown]");
      button.setAttribute("aria-expanded", String(Boolean(except && dropdown === except && !except.hidden)));
    });
    document.querySelectorAll("[data-auth-menu]").forEach((button) => {
      button.setAttribute("aria-expanded", String(Boolean(except && button.nextElementSibling === except && !except.hidden)));
    });
  }

  function toggleDropdown(button, dropdown) {
    if (!dropdown) return;
    const willOpen = dropdown.hidden;
    closeMenus(dropdown);
    dropdown.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
  }

  function restorePageInteractions() {
    closeMenus();
    window.requestAnimationFrame(() => {
      document.documentElement.style.removeProperty("overflow");
      document.body.style.removeProperty("overflow");
      document.body.style.removeProperty("position");
      document.body.style.removeProperty("width");
      document.documentElement.style.removeProperty("pointer-events");
      document.body.style.removeProperty("pointer-events");
    });
  }

  enhanceAuthControls();

  document.querySelectorAll("[data-auth-login]").forEach((button) => {
    const dropdown = button.parentElement?.querySelector("[data-auth-login-dropdown]");
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleDropdown(button, dropdown);
    });
  });

  document.querySelectorAll("[data-auth-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const dropdown = button.parentElement.querySelector("[data-auth-dropdown]");
      toggleDropdown(button, dropdown);
    });
  });

  document.querySelectorAll("[data-auth-open-login]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      closeMenus();
      identity?.open("login");
    });
  });

  document.querySelectorAll("[data-auth-open-signup]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      closeMenus();
      identity?.open("signup");
    });
  });

  document.querySelectorAll("[data-auth-logout]").forEach((button) => {
    button.addEventListener("click", () => identity?.logout());
  });

  document.addEventListener("click", () => closeMenus());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenus();
  });

  if (!identity) {
    console.warn("Netlify Identity nao esta disponível. Confirma se o widget foi carregado.");
    if (accountPage) redirectToLogin();
    return;
  }

  identity.on("init", (user) => {
    updateAuthUI(user);
    if (accountPage && !user) {
      redirectToLogin();
      return;
    }
    if (!user && params.get("login") === "1") identity.open("login");
  });

  identity.on("login", (user) => {
    updateAuthUI(user);
    try {
      identity.close();
    } catch (error) {
      console.error("[auth] falha ao fechar o modal de login", error);
    }
    // O widget nem sempre dispara o evento "close" depois de um login bem
    // sucedido (o modal já se fecha sozinho e a chamada acima pode virar
    // um no-op), o que deixava o overflow/position do body presos e a
    // página inteira sem responder a cliques. Chamamos diretamente aqui,
    // em vez de confiar só no listener de "close".
    restorePageInteractions();
    window.setTimeout(restorePageInteractions, 400);

    const redirect = params.get("redirect");
    if (redirect) window.location.assign(redirect);
  });

  identity.on("logout", () => {
    updateAuthUI(null);
    window.location.assign("index.html");
  });

  identity.on("close", restorePageInteractions);

  window.addEventListener("pageshow", () => {
    const currentUser = identity.currentUser?.();
    if (currentUser) updateAuthUI(currentUser);
    restorePageInteractions();
  });

  identity.init({ locale: "pt" });
})();
