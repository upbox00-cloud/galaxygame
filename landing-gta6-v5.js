/*
 * Landing GTA VI — camada V5 (polimento cinematográfico).
 * Corre depois da V4 e só retoca: plataformas, exp., galeria, FAQ, final/rodapé, chat e ritmo.
 * Sem novas bibliotecas nem canvas. Tudo reversível em dispose().
 */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function skylineD(w, h, seed, minH, maxH, segW) {
    var r = rng(seed), x = 0, d = "M0 " + h;
    while (x < w) {
      var bw = segW * (0.6 + r() * 1.3), bh = minH + r() * (maxH - minH), top = h - bh;
      d += " L" + x.toFixed(0) + " " + top.toFixed(0) + " L" + (x + bw).toFixed(0) + " " + top.toFixed(0);
      x += bw;
    }
    return d + " L" + w + " " + h + " Z";
  }

  function enhance(root, ctx) {
    var gsap = ctx.gsap, ScrollTrigger = ctx.ScrollTrigger, lenis = ctx.lenis;
    var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var cleanup = [], gctx;

    root.classList.add("g6-v5");
    var css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "landing-gta6-v5.css?v=20261105-20";
    document.head.appendChild(css);
    cleanup.push(function () { if (css.parentNode) css.parentNode.removeChild(css); });

    function goTo(sel) {
      var t = root.querySelector(sel); if (!t) return;
      if (lenis && lenis.scrollTo) lenis.scrollTo(t, { offset: -8 });
      else t.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    /* ---- Plataformas: arte, estado ativo, luz dinâmica ---- */
    var cards = root.querySelectorAll(".g6-plat");
    var priceTxt = (root.querySelector(".g6-bigprice") || {}).textContent || "";
    var ART = ["assets/gta-vi-visual-beach-5k.webp", "assets/gta-vi-visual-skyline.jpg"];
    var artEls = [];
    cards.forEach(function (card, i) {
      var art = document.createElement("div");
      art.className = "g6-plat-art"; art.setAttribute("aria-hidden", "true");
      art.dataset.src = ART[i] || ART[0];
      card.insertBefore(art, card.firstChild);
      artEls.push(art);
      var meta = document.createElement("p");
      meta.className = "g6-plat-meta";
      if (i === 0) {
        card.classList.add("is-active"); card.setAttribute("aria-current", "true");
        meta.innerHTML = "<b>" + priceTxt.trim() + "</b> · edição digital · reserva aberta";
        var go = document.createElement("a");
        go.className = "g6-plat-cta"; go.href = "#g6-preco"; go.textContent = "Ver oferta";
        go.addEventListener("click", function (e) { e.preventDefault(); goTo("#g6-preco"); });
        card.appendChild(meta); card.appendChild(go);
      } else {
        meta.textContent = "Preço e condições na página da versão Xbox.";
        card.appendChild(meta);
      }
      if (fine) {
        var mv = function (e) { var r = card.getBoundingClientRect(); card.style.setProperty("--lx", (e.clientX - r.left) + "px"); card.style.setProperty("--ly", (e.clientY - r.top) + "px"); };
        card.addEventListener("pointermove", mv);
        cleanup.push(function () { card.removeEventListener("pointermove", mv); });
      }
    });
    var artIO = null;
    if ("IntersectionObserver" in window && artEls.length) {
      artIO = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        artEls.forEach(function (a) { a.style.backgroundImage = "url('" + a.dataset.src + "')"; a.classList.add("ready"); });
        artIO.disconnect();
      }, { rootMargin: "600px 0px" });
      artIO.observe(artEls[0]);
    } else { artEls.forEach(function (a) { a.style.backgroundImage = "url('" + a.dataset.src + "')"; a.classList.add("ready"); }); }

    /* ---- Final: horizonte a cortar o rodapé (cor lida do rodapé real) ---- */
    var finalSec = root.querySelector(".g6-final");
    var footer = document.querySelector(".site-footer");
    var fdiv = null;
    if (finalSec) {
      var fc = "#121212";
      if (footer) { var c = getComputedStyle(footer).backgroundColor; if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") fc = c; }
      fdiv = document.createElement("div");
      fdiv.className = "g6-final-divider"; fdiv.setAttribute("aria-hidden", "true");
      var sv = document.createElementNS(NS, "svg");
      sv.setAttribute("viewBox", "0 0 1600 140"); sv.setAttribute("preserveAspectRatio", "xMidYMax slice"); sv.setAttribute("focusable", "false");
      sv.innerHTML = '<path d="' + skylineD(1600, 140, 131, 14, 90, 64) + '" fill="' + fc + '"/>';
      fdiv.appendChild(sv);
      finalSec.appendChild(fdiv);
      cleanup.push(function () { if (fdiv.parentNode) fdiv.parentNode.removeChild(fdiv); });
    }

    gctx = gsap.context(function () {
      /* Hero: empurrão lento de câmara depois da entrada (uma só vez) */
      var heroImg = root.querySelector(".g6-hero-media img");
      if (heroImg) gsap.to(heroImg, { scale: 1.07, duration: 16, ease: "none", delay: 2.2 });
      var bars = root.querySelectorAll(".g6-bars i");
      if (bars.length) gsap.fromTo(bars, { scaleY: 1 }, { scaleY: 0, duration: 1.0, ease: "power4.inOut", delay: 0.05, overwrite: true });

      /* Experiência: linha que se desenha ao longo dos passos */
      var steps = root.querySelector(".g6-steps");
      if (steps) gsap.fromTo(steps, { "--line": 0 }, { "--line": 1, ease: "none", scrollTrigger: { trigger: steps, start: "top 80%", end: "bottom 55%", scrub: 0.5 } });

      /* Galeria: zoom cinematográfico controlado pelo scroll */
      var stage = root.querySelector(".g6-stage");
      if (stage) {
        ScrollTrigger.create({ trigger: stage, start: "top bottom", end: "bottom top", scrub: true,
          onUpdate: function (s) { stage.style.setProperty("--zoom", (s.progress * 0.07).toFixed(4)); } });
      }

      /* Plataformas: cartões entram com revelação de arte */
      artEls.forEach(function (a, i) {
        gsap.fromTo(a, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 1.1, ease: "power4.out", delay: i * 0.12,
          scrollTrigger: { trigger: a, start: "top 90%", once: true } });
      });

      /* Final: a imagem cresce e revela o capítulo (máscara + escala sincronizadas) */
      if (finalSec) {
        var media = finalSec.querySelector(".g6-hero-media");
        var fimg = finalSec.querySelector(".g6-hero-media img");
        if (media) gsap.fromTo(media, { clipPath: "inset(14% 8% 14% 8% round 28px)" }, { clipPath: "inset(0% 0% 0% 0% round 0px)", ease: "none",
          scrollTrigger: { trigger: finalSec, start: "top 90%", end: "top 25%", scrub: 0.6 } });
        if (fimg) gsap.fromTo(fimg, { scale: 1.3 }, { scale: 1, ease: "none", scrollTrigger: { trigger: finalSec, start: "top 90%", end: "bottom 60%", scrub: 0.6 } });
      }
    }, root);

    var rf = function () { ScrollTrigger.refresh(); };
    var t1 = setTimeout(rf, 800), t2 = setTimeout(rf, 2400);
    cleanup.push(function () { clearTimeout(t1); clearTimeout(t2); });

    function dispose() {
      if (artIO) artIO.disconnect();
      if (gctx) gctx.revert();
      cleanup.forEach(function (fn) { try { fn(); } catch (e) { /* ignora */ } });
      cleanup = [];
      cards.forEach(function (c) { c.classList.remove("is-active"); c.removeAttribute("aria-current"); [".g6-plat-art", ".g6-plat-meta", ".g6-plat-cta"].forEach(function (s) { var n = c.querySelector(s); if (n) n.parentNode.removeChild(n); }); });
      root.classList.remove("g6-v5");
    }
    window.addEventListener("pagehide", dispose, { once: true });
    root.__g6v5 = { dispose: dispose };
    return root.__g6v5;
  }

  window.GalaxyLandingGta6V5 = { enhance: enhance };
})();
