(function initializeGalaxyGameAuth() {
  if (window.__GalaxyGameAuthReady) return;
  window.__GalaxyGameAuthReady = true;

  const identity = window.netlifyIdentity;
  const accountPage = document.body.classList.contains("account-page");
  const params = new URLSearchParams(window.location.search);
  let recoveryToken = window.__GalaxyGameRecoveryToken || "";
  try {
    recoveryToken ||= window.sessionStorage.getItem("galaxygame_recovery_token") || "";
  } catch (error) {
    // sessionStorage can be unavailable in strict privacy modes.
  }
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
    if (document.body.classList.contains("password-recovery-open")) return;
    window.requestAnimationFrame(() => {
      document.documentElement.style.removeProperty("overflow");
      document.body.style.removeProperty("overflow");
      document.body.style.removeProperty("position");
      document.body.style.removeProperty("width");
      document.documentElement.style.removeProperty("pointer-events");
      document.body.style.removeProperty("pointer-events");
    });
  }

  function clearRecoveryToken() {
    recoveryToken = "";
    window.__GalaxyGameRecoveryToken = "";
    try {
      window.sessionStorage.removeItem("galaxygame_recovery_token");
    } catch (error) {
      // Nothing else is needed when storage is unavailable.
    }
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (error) {
      return { msg: text };
    }
  }

  function recoveryErrorMessage(status, payload) {
    const apiMessage = String(payload?.msg || payload?.error_description || "").toLowerCase();
    if (status === 401 || status === 404 || status === 422 || apiMessage.includes("expired")) {
      return "Este link expirou ou ja foi utilizado. Pede um novo email de recuperacao e tenta novamente.";
    }
    return "Nao foi possivel alterar a palavra-passe agora. Tenta novamente ou contacta gamegalaxy26@gmail.com.";
  }

  function mountPasswordRecovery(token) {
    if (!token || document.querySelector("[data-password-recovery]")) return;

    const overlay = document.createElement("div");
    overlay.className = "password-recovery-overlay";
    overlay.dataset.passwordRecovery = "";
    overlay.innerHTML = `
      <section class="password-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="password-recovery-title">
        <button class="password-recovery-close" type="button" aria-label="Fechar">&times;</button>
        <span class="password-recovery-kicker">Conta GalaxyGame</span>
        <h1 id="password-recovery-title">Cria uma nova palavra-passe</h1>
        <p>Escolhe uma palavra-passe segura para voltares a entrar na tua conta.</p>
        <form class="password-recovery-form">
          <label>
            Nova palavra-passe
            <input name="password" type="password" minlength="8" autocomplete="new-password" required />
          </label>
          <label>
            Confirmar palavra-passe
            <input name="confirmation" type="password" minlength="8" autocomplete="new-password" required />
          </label>
          <p class="password-recovery-hint">Utiliza pelo menos 8 caracteres.</p>
          <p class="password-recovery-status" role="alert" aria-live="polite"></p>
          <button class="password-recovery-submit" type="submit">Guardar nova palavra-passe</button>
        </form>
      </section>`;

    const dialog = overlay.querySelector(".password-recovery-dialog");
    const form = overlay.querySelector(".password-recovery-form");
    const status = overlay.querySelector(".password-recovery-status");
    const submit = overlay.querySelector(".password-recovery-submit");

    function closeRecovery() {
      overlay.remove();
      document.body.classList.remove("password-recovery-open");
      restorePageInteractions();
    }

    overlay.querySelector(".password-recovery-close").addEventListener("click", closeRecovery);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeRecovery();
    });
    dialog.addEventListener("click", (event) => event.stopPropagation());

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const password = String(data.get("password") || "");
      const confirmation = String(data.get("confirmation") || "");

      status.className = "password-recovery-status";
      if (password.length < 8) {
        status.textContent = "A palavra-passe deve ter pelo menos 8 caracteres.";
        return;
      }
      if (password !== confirmation) {
        status.textContent = "As palavras-passe nao coincidem.";
        return;
      }

      submit.disabled = true;
      submit.textContent = "A guardar...";
      status.textContent = "";

      try {
        const verificationResponse = await fetch("/.netlify/identity/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "recovery", token })
        });
        const session = await readJsonResponse(verificationResponse);
        if (!verificationResponse.ok || !session.access_token) {
          throw { status: verificationResponse.status, payload: session };
        }

        const updateResponse = await fetch("/.netlify/identity/user", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ password })
        });
        const updatePayload = await readJsonResponse(updateResponse);
        if (!updateResponse.ok) {
          throw { status: updateResponse.status, payload: updatePayload };
        }

        clearRecoveryToken();
        dialog.innerHTML = `
          <div class="password-recovery-success">
            <span class="password-recovery-success-icon" aria-hidden="true">&#10003;</span>
            <span class="password-recovery-kicker">Tudo pronto</span>
            <h1>Palavra-passe alterada com sucesso</h1>
            <p>Ja podes entrar na tua conta GalaxyGame com a nova palavra-passe.</p>
            <button class="password-recovery-submit" type="button" data-recovery-login>Entrar na minha conta</button>
          </div>`;
        dialog.querySelector("[data-recovery-login]").addEventListener("click", () => {
          closeRecovery();
          identity?.open("login");
        });
      } catch (error) {
        status.textContent = recoveryErrorMessage(error?.status, error?.payload);
        submit.disabled = false;
        submit.textContent = "Guardar nova palavra-passe";
      }
    });

    document.body.append(overlay);
    document.body.classList.add("password-recovery-open");
    overlay.querySelector("input")?.focus();
  }

  enhanceAuthControls();
  mountPasswordRecovery(recoveryToken);

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
