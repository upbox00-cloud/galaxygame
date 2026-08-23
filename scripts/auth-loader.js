(function () {
  "use strict";

  let loading;
  let ready = false;

  function addScript(src) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function loadIdentity() {
    if (ready) return Promise.resolve();
    if (loading) return loading;
    loading = addScript("https://identity.netlify.com/v1/netlify-identity-widget.js")
      .then(function () { return addScript("scripts/identity-modern.js?v=20260809-1"); })
      .then(function () { return addScript("scripts/auth.js?v=20260811-7"); })
      .then(function () { ready = true; })
      .catch(function (error) {
        loading = null;
        console.error("Falha ao carregar a area de cliente.", error);
      });
    return loading;
  }

  const controls = document.querySelector(".auth-controls");
  if (controls) {
    ["pointerenter", "touchstart", "focusin"].forEach(function (eventName) {
      controls.addEventListener(eventName, loadIdentity, { once: true, passive: true });
    });
    controls.addEventListener("click", function (event) {
      if (ready) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const target = event.target.closest("button, a");
      loadIdentity().then(function () {
        if (target && ready) target.click();
      });
    }, true);
  }

  if (window.__GalaxyGameRecoveryToken) loadIdentity();

  // Identity and its modal stylesheet are loaded only when the account is used.
})();
