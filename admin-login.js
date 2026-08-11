(function initializeAdminLogin() {
  if (window.__GalaxyGameAdminLoginReady) return;
  window.__GalaxyGameAdminLoginReady = true;

  const identity = window.netlifyIdentity;
  const form = document.querySelector("[data-admin-login-form]");
  const status = document.querySelector("[data-admin-login-status]");
  const submit = document.querySelector("[data-admin-login-submit]");
  const recovery = document.querySelector("[data-admin-login-recovery]");
  const requestedRedirect = new URLSearchParams(window.location.search).get("redirect") || "painel-pedidos.html";
  const destination = /^(?!\/\/)[a-zA-Z0-9][a-zA-Z0-9._~/?=&%-]*$/.test(requestedRedirect)
    ? requestedRedirect
    : "painel-pedidos.html";

  function showStatus(message, tone = "error") {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function continueToDestination() {
    window.location.replace(destination);
  }

  if (!identity?.gotrue) {
    showStatus("O servico de login nao ficou disponivel. Recarrega a pagina e tenta novamente.");
    form?.querySelectorAll("input, button").forEach((element) => { element.disabled = true; });
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim().toLowerCase();
    const password = String(data.get("password") || "");

    submit.disabled = true;
    submit.textContent = "A entrar...";
    showStatus("", "info");
    try {
      await identity.gotrue.login(email, password, true);
      showStatus("Sessao iniciada. A abrir o painel...", "success");
      continueToDestination();
    } catch (error) {
      console.error("[admin-login] login recusado", {
        status: Number(error?.status || 0),
        message: String(error?.message || "erro desconhecido").slice(0, 180)
      });
      showStatus("Email ou palavra-passe incorretos. Confirma os dados e tenta novamente.");
      submit.disabled = false;
      submit.textContent = "Entrar com seguranca";
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
    if (user) continueToDestination();
  });
  identity.init({ locale: "pt" });
})();
