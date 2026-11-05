/*
 * Landing GTA VI — arranque antecipado (script síncrono e minúsculo, no <head>).
 * Corre antes da primeira pintura: se a landing está ativa para este produto, marca o <html>
 * (o CSS esconde o layout clássico) e pede já o CSS/imagem da landing. Não carrega bibliotecas.
 * Rede de segurança: se a landing não aparecer em 4 s, o layout clássico volta a ser mostrado.
 */
(function () {
  "use strict";
  var cfg = window.GALAXY_LANDING_GTA6;
  if (!cfg || !cfg.enabled) return;
  var q;
  try { q = new URLSearchParams(location.search); } catch (e) { return; }
  var id = q.get("id") || "gta-vi-ps5";
  var mode = q.get("landing");
  if (id !== cfg.productId || mode === "0") return;

  var de = document.documentElement;
  de.classList.add("g6-early");

  var mm = function (s) { return !!(window.matchMedia && window.matchMedia(s).matches); };
  var nav = navigator;
  var lite = mode === "lite" || mm("(prefers-reduced-motion: reduce)") ||
    !!(nav.connection && (nav.connection.saveData || /(^|-)2g$/.test(nav.connection.effectiveType || ""))) ||
    !!(nav.deviceMemory && nav.deviceMemory <= 2) || !!(nav.deviceMemory && nav.hardwareConcurrency && nav.hardwareConcurrency <= 2);
  var n = Number(cfg.version);
  var ver = mode === "v1" ? 1 : mode === "v2" ? 2 : mode === "v3" ? 3 : mode === "v4" ? 4 : mode === "v5" ? 5 : mode === "v6" ? 6 : (n >= 6 ? 6 : n >= 5 ? 5 : n >= 4 ? 4 : n >= 3 ? 3 : n >= 2 ? 2 : 1);

  var V = "20261105-22";
  // preload só da imagem que vai ser usada: desktop (>=768) ou o recorte mobile por densidade
  var html = '<link rel="preload" as="image" href="assets/gta-vi-visual-beach-5k.webp" fetchpriority="high" media="(min-width: 768px)">' +
    '<link rel="preload" as="image" href="assets/gta-vi-hero-m-780.webp" imagesrcset="assets/gta-vi-hero-m-390.webp 390w, assets/gta-vi-hero-m-780.webp 780w, assets/gta-vi-hero-m-1170.webp 1170w" imagesizes="100vw" fetchpriority="high" media="(max-width: 767px)">';
  if (!lite) for (var i = 2; i <= ver; i++) html += '<link rel="stylesheet" href="landing-gta6-v' + i + '.css?v=' + V + '" data-g6css="v' + i + '">';
  // document.write de <link> é bloqueante para a pintura (de propósito: o CSS da landing tem de estar pronto na 1.ª pintura)
  // V6: só mostra a 1.ª pintura quando o hero já existe (necessário para a transição entre páginas ser limpa)
  // (o opt-in tem de ser um <style> inline: num <link> escrito por document.write o navegador ainda não o conta no pagereveal)
  if (!lite && ver >= 6) html += '<style>@view-transition{navigation:auto}</style><link rel="expect" href="#g6-top" blocking="render">';
  try { document.write(html); } catch (e) { /* o landing-gta6.js garante o CSS na mesma */ }

  // Transição catálogo -> landing (View Transitions entre documentos, só Chromium/Safari recentes).
  // O elemento partilhado é o hero inteiro; sem suporte ou com lite/reduced-motion não há transição e a navegação é normal.
  // Alternativa para navegadores sem View Transitions entre documentos (Chrome/Firefox no iOS, Safari < 18.2, Firefox):
  // a capa clicada no catálogo (guardada por landing-gta6-nav.js) expande por cima da landing e dissolve-se.
  // Corre na página nova, depois da navegação: nunca atrasa nem bloqueia a abertura.
  var navData = null;
  try {
    var raw = sessionStorage.getItem("g6nav"); sessionStorage.removeItem("g6nav");
    var nd = raw && JSON.parse(raw);
    if (nd && Date.now() - nd.t < 10000 && nd.src) navData = nd;
  } catch (x) { /* sem sessionStorage: sem transição */ }
  function playFallback(d) {
    if (!d || !de.animate) return;
    var vw = de.clientWidth, vh = window.innerHeight;
    var ov = document.createElement("div");
    ov.setAttribute("aria-hidden", "true");
    ov.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:#07020d;pointer-events:none;overflow:hidden";
    var im = document.createElement("img");
    im.alt = ""; im.src = d.src; im.decoding = "async";
    im.style.cssText = "position:absolute;object-fit:cover;max-width:none;left:" + d.x + "px;top:" + d.y + "px;width:" + d.w + "px;height:" + d.h + "px;border-radius:" + (d.r || 0) + "px";
    ov.appendChild(im); de.appendChild(ov);
    var done = function () { if (ov.parentNode) ov.parentNode.removeChild(ov); };
    setTimeout(done, 2600); // rede de segurança
    try {
      var ease = "cubic-bezier(.16,1,.3,1)";
      im.animate([{ left: d.x + "px", top: d.y + "px", width: d.w + "px", height: d.h + "px", borderRadius: (d.r || 0) + "px", filter: "brightness(1)" },
                  { left: "0px", top: "0px", width: vw + "px", height: vh + "px", borderRadius: "0px", filter: "brightness(1.25)" }],
                 { duration: 850, easing: ease, fill: "forwards" });
      var fade = ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 550, delay: 500, easing: "ease-out", fill: "forwards" });
      fade.onfinish = done;
    } catch (x) { done(); }
  }
  if (!lite && ver >= 6 && !("PageRevealEvent" in window)) playFallback(navData);

  window.addEventListener("pagereveal", function (e) {
    var vt = e.viewTransition;
    if (!vt) { if (!lite && ver >= 6) playFallback(navData); return; }
    ["ready", "updateCallbackDone", "finished"].forEach(function (k) { if (vt[k] && vt[k].catch) vt[k].catch(function () { /* transição cancelada: a página fica normal */ }); });
    var hero = document.querySelector(".gta6-landing .g6-hero");
    if (lite || ver < 6 || !hero) { try { vt.skipTransition(); } catch (x) { /* ignora */ } return; }
    hero.style.viewTransitionName = "gta6-hero";
    de.classList.add("g6-vt");
    var done = function () { hero.style.viewTransitionName = ""; de.classList.remove("g6-vt"); };
    vt.finished.then(done, done);
  });
  // A saída da landing nunca anima (não pode atrasar nem bloquear a navegação).
  window.addEventListener("pageswap", function (e) {
    if (!e.viewTransition) return;
    var vt = e.viewTransition;
    ["ready", "updateCallbackDone", "finished"].forEach(function (k) { if (vt[k] && vt[k].catch) vt[k].catch(function () { /* esperado ao saltar */ }); });
    try { vt.skipTransition(); } catch (x) { /* ignora */ }
  });

  setTimeout(function () {
    if (!document.querySelector(".gta6-landing")) de.classList.remove("g6-early");
  }, 4000);
})();
