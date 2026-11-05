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
    !!(nav.deviceMemory && nav.deviceMemory <= 2) || !!(nav.hardwareConcurrency && nav.hardwareConcurrency <= 2);
  var n = Number(cfg.version);
  var ver = mode === "v1" ? 1 : mode === "v2" ? 2 : mode === "v3" ? 3 : mode === "v4" ? 4 : mode === "v5" ? 5 : (n >= 5 ? 5 : n >= 4 ? 4 : n >= 3 ? 3 : n >= 2 ? 2 : 1);

  var V = "20261105-21";
  var html = '<link rel="preload" as="image" href="assets/gta-vi-visual-beach-5k.webp" fetchpriority="high">';
  if (!lite) for (var i = 2; i <= ver; i++) html += '<link rel="stylesheet" href="landing-gta6-v' + i + '.css?v=' + V + '" data-g6css="v' + i + '">';
  // document.write de <link> é bloqueante para a pintura (de propósito: o CSS da landing tem de estar pronto na 1.ª pintura)
  try { document.write(html); } catch (e) { /* o landing-gta6.js garante o CSS na mesma */ }

  setTimeout(function () {
    if (!document.querySelector(".gta6-landing")) de.classList.remove("g6-early");
  }, 4000);
})();
