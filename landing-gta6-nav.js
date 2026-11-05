/*
 * Catálogo/Início -> landing GTA VI: lado de origem da transição entre páginas (View Transitions entre documentos).
 * Só marca a capa do GTA VI PS5 como elemento partilhado no instante do clique. Não impede nem atrasa a navegação:
 * sem suporte do navegador, com prefers-reduced-motion, ou com ctrl/cmd/nova aba, não faz nada e o link abre normalmente.
 * A animação de chegada (e a decisão final de a usar) está em landing-gta6.early.js + landing-gta6-v6.css.
 */
(function () {
  "use strict";
  var hasVT = "PageRevealEvent" in window; // sem isto, usa-se a alternativa (capa que expande) em landing-gta6.early.js
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // só com a landing ativa e na versão 6 (rollback por config: version 5 ou menos => sem transição, sem efeitos)
  var cfg = window.GALAXY_LANDING_GTA6;
  if (!cfg || !cfg.enabled || Number(cfg.version) < 6) return;

  var RE = /[?&]id=gta-vi-ps5(?:&|$)/;
  var marked = null;

  function clear() { if (marked) { marked.style.viewTransitionName = ""; marked = null; } }

  if (hasVT) {
    var st = document.createElement("style");
    st.textContent = "@view-transition { navigation: auto; }";
    document.head.appendChild(st);
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || (a.target && a.target !== "_self") || !RE.test(a.getAttribute("href") || "")) return;
    var img = a.querySelector("img");
    if (!img) return;
    clear();
    if (hasVT) { img.style.viewTransitionName = "gta6-hero"; marked = img; }
    // para a alternativa em navegadores sem View Transitions: posição e imagem da capa
    try {
      var r = img.getBoundingClientRect(), cs = getComputedStyle(img.parentNode);
      sessionStorage.setItem("g6nav", JSON.stringify({ t: Date.now(), src: img.currentSrc || img.src, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: parseFloat(cs.borderTopLeftRadius) || 0 }));
    } catch (x) { /* ignora */ }
  }, true);

  // Qualquer outra saída desta página não anima.
  window.addEventListener("pageswap", function (e) {
    var vt = e.viewTransition; if (!vt) return;
    // o destino pode não ter opt-in (ex.: ?landing=v5 / lite): a promessa é rejeitada e isso é normal
    ["ready", "finished", "updateCallbackDone"].forEach(function (k) { if (vt[k] && vt[k].catch) vt[k].catch(function () { /* ignora */ }); });
    if (!marked) vt.skipTransition();
  });
  // Voltar (bfcache) a esta página: limpar a marca
  window.addEventListener("pageshow", clear);
})();
