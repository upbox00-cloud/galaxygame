(function preserveIdentityRecoveryToken() {
  const hash = window.location.hash.replace(/^#/, "");
  const token = new URLSearchParams(hash).get("recovery_token");
  if (!token) return;

  try {
    window.sessionStorage.setItem("galaxygame_recovery_token", token);
  } catch (error) {
    window.__GalaxyGameRecoveryToken = token;
  }

  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
})();
