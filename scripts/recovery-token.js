(function preserveIdentityEmailTokens() {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const recoveryToken = params.get("recovery_token");
  const confirmationToken = params.get("confirmation_token");
  if (!recoveryToken && !confirmationToken) return;

  try {
    if (recoveryToken) window.sessionStorage.setItem("galaxygame_recovery_token", recoveryToken);
    if (confirmationToken) window.sessionStorage.setItem("galaxygame_confirmation_token", confirmationToken);
  } catch (error) {
    if (recoveryToken) window.__GalaxyGameRecoveryToken = recoveryToken;
    if (confirmationToken) window.__GalaxyGameConfirmationToken = confirmationToken;
  }

  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
  if (confirmationToken && !/\/login\.html$/i.test(window.location.pathname)) {
    window.location.replace("login.html?mode=confirmacao&redirect=minha-conta.html");
  }
})();
