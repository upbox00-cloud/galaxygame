(function initializeGalaxyGameLogin() {
  if (window.__GalaxyGameAdminLoginReady) return;
  window.__GalaxyGameAdminLoginReady = true;

  const identity = window.netlifyIdentity;
  const form = document.querySelector("[data-admin-login-form]");
  const status = document.querySelector("[data-admin-login-status]");
  const submit = document.querySelector("[data-admin-login-submit]");
  const recovery = document.querySelector("[data-admin-login-recovery]");
  const title = document.querySelector("[data-login-title]");
  const copy = document.querySelector("[data-login-copy]");
  const kicker = document.querySelector("[data-login-kicker]");
  const modes = document.querySelector("[data-login-modes]");
  const nameRow = document.querySelector("[data-admin-login-name-row]");
  const modeButtons = Array.from(document.querySelectorAll("[data-login-mode]"));
  const params = new URLSearchParams(window.location.search);
  const requestedRedirect = params.get("redirect") || "minha-conta.html";
  const destination = /^(?!\/\/)[a-zA-Z0-9][a-zA-Z0-9._~/?=&%-]*$/.test(requestedRedirect)
    ? requestedRedirect
    : "minha-conta.html";
  let mode = params.get("mode") === "signup" ? "signup" : "login";
  let confirmationToken = window.__GalaxyGameConfirmationToken || "";

  try {
    confirmationToken = confirmationToken || window.sessionStorage.getItem("galaxygame_confirmation_token") || "";
  } catch (error) {
    // The in-memory fallback above still works when sessionStorage is blocked.
  }

  if (confirmationToken || params.get("mode") === "confirmacao") mode = "confirmacao";

  function showStatus(message, tone = "error") {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function continueToDestination() {
    window.location.replace(destination);
  }

  function setMode(nextMode) {
    mode = nextMode === "signup" ? "signup" : "login";
    const signingUp = mode === "signup";
    nameRow.hidden = !signingUp;
    nameRow.querySelector("input").required = signingUp;
    modes.hidden = false;
    form.hidden = false;
    recovery.hidden = signingUp;
    kicker.textContent = "Conta GalaxyGame";
    title.textContent = signingUp ? "Criar a tua conta" : "Entrar na GalaxyGame";
    copy.textContent = signingUp
      ? "Cria a tua conta para acompanhares pedidos e receberes os teus jogos digitais."
      : "Acede aos teus pedidos e acompanha as tuas compras digitais.";
    submit.textContent = signingUp ? "Criar conta" : "Entrar com seguranca";
    submit.disabled = false;
    showStatus("", "info");
    modeButtons.forEach((button) => {
      const active = button.dataset.loginMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    window.history.replaceState(null, document.title, url);
  }

  async function confirmAccount() {
    modes.hidden = true;
    form.hidden = true;
    recovery.hidden = true;
    kicker.textContent = "Conta GalaxyGame";
    title.textContent = "A confirmar o teu email";
    copy.textContent = "Só demora um instante. Estamos a ativar a tua conta com segurança.";
    showStatus("A validar o link de confirmação...", "info");

    if (!confirmationToken) {
      title.textContent = "Link de confirmação inválido";
      copy.textContent = "Este link não contém um código de confirmação válido.";
      modes.hidden = false;
      form.hidden = false;
      setMode("login");
      showStatus("Pede um novo email de confirmação ou entra se a conta já estiver ativa.");
      return;
    }

    try {
      await identity.gotrue.confirm(confirmationToken, true);
      try {
        window.sessionStorage.removeItem("galaxygame_confirmation_token");
      } catch (error) {
        // Nothing else is required when browser storage is unavailable.
      }
      title.textContent = "Email confirmado";
      copy.textContent = "A tua conta GalaxyGame está pronta. Vamos abrir a tua área de cliente.";
      showStatus("Conta confirmada com sucesso.", "success");
      window.setTimeout(continueToDestination, 900);
    } catch (error) {
      console.error("[login] confirmacao recusada", {
        status: Number(error?.status || 0),
        message: String(error?.message || "erro desconhecido").slice(0, 180)
      });
      try {
        window.sessionStorage.removeItem("galaxygame_confirmation_token");
      } catch (storageError) {
        // Ignore storage restrictions.
      }
      title.textContent = "Não foi possível confirmar este link";
      copy.textContent = "O link pode ter expirado ou já ter sido utilizado. Se já confirmaste a conta, inicia sessão abaixo.";
      modes.hidden = false;
      form.hidden = false;
      setMode("login");
      showStatus("Se ainda não confirmaste a conta, pede um novo email de confirmação.");
    }
  }

  if (!identity?.gotrue) {
    showStatus("O servico de login nao ficou disponivel. Recarrega a pagina e tenta novamente.");
    form?.querySelectorAll("input, button").forEach((element) => { element.disabled = true; });
    return;
  }

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.loginMode));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim().toLowerCase();
    const password = String(data.get("password") || "");
    const name = String(data.get("name") || "").trim();

    submit.disabled = true;
    submit.textContent = mode === "signup" ? "A criar conta..." : "A entrar...";
    showStatus("", "info");
    try {
      if (mode === "signup") {
        await identity.gotrue.signup(email, password, { full_name: name });
        showStatus("Conta criada. Enviámos um email para confirmares o registo.", "success");
        submit.textContent = "Email de confirmação enviado";
        return;
      }
      await identity.gotrue.login(email, password, true);
      showStatus("Sessão iniciada. A abrir a tua conta...", "success");
      continueToDestination();
    } catch (error) {
      console.error(`[login] ${mode === "signup" ? "registo" : "login"} recusado`, {
        status: Number(error?.status || 0),
        message: String(error?.message || "erro desconhecido").slice(0, 180)
      });
      showStatus(mode === "signup"
        ? "Não foi possível criar a conta. Confirma os dados ou tenta iniciar sessão se este email já estiver registado."
        : "Email ou palavra-passe incorretos. Confirma os dados e tenta novamente.");
      submit.disabled = false;
      submit.textContent = mode === "signup" ? "Criar conta" : "Entrar com seguranca";
    }
  });

  recovery.addEventListener("click", async () => {
    const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
    if (!email) {
      showStatus("Escreve primeiro o teu email para receberes a recuperacao da palavra-passe.");
      form.elements.email.focus();
      return;
    }
    recovery.disabled = true;
    try {
      await identity.gotrue.requestPasswordRecovery(email);
      showStatus("Enviamos as instrucoes de recuperacao para o teu email.", "success");
    } catch (error) {
      console.error("[admin-login] recuperacao recusada", {
        status: Number(error?.status || 0),
        message: String(error?.message || "erro desconhecido").slice(0, 180)
      });
      showStatus("Nao foi possivel enviar o email agora. Tenta novamente dentro de instantes.");
    } finally {
      recovery.disabled = false;
    }
  });

  identity.on("init", (user) => {
    if (mode === "confirmacao") {
      confirmAccount();
      return;
    }
    if (user) {
      continueToDestination();
      return;
    }
    setMode(mode);
  });
  identity.init({ locale: "pt" });
})();
