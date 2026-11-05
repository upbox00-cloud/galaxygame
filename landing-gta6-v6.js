/*
 * Landing GTA VI — camada V6 (experiência interativa).
 * Corre depois da V5. Galeria 3D (CSS), scroll narrativo em três momentos, microinterações.
 * Sem bibliotecas novas nem canvas. Tudo reversível em dispose(). A transição catálogo->landing está em
 * landing-gta6.early.js (pagereveal) + landing-gta6-v6.css (::view-transition-*).
 */
(function () {
  "use strict";

  function enhance(root, ctx) {
    var gsap = ctx.gsap, ScrollTrigger = ctx.ScrollTrigger;
    var cleanup = [], gctx;

    root.classList.add("g6-v6");
    var css = document.querySelector('link[data-g6css="v6"]');
    if (!css) { css = document.createElement("link"); css.rel = "stylesheet"; css.href = "landing-gta6-v6.css?v=20261105-22"; css.setAttribute("data-g6css", "v6"); document.head.appendChild(css); }
    cleanup.push(function () { if (css.parentNode) css.parentNode.removeChild(css); });

    /* ---- Galeria: reflexo na troca + pausa da câmara fora do ecrã ---- */
    var stage = root.querySelector(".g6-stage");
    var imgs = stage ? Array.prototype.slice.call(stage.querySelectorAll("img")) : [];
    var mo = null, io = null, sheenT = null;
    if (stage && imgs.length) {
      var cur = Math.max(0, imgs.findIndex(function (i) { return i.classList.contains("on"); }));
      mo = new MutationObserver(function () {
        var n = imgs.findIndex(function (i) { return i.classList.contains("on"); });
        if (n < 0 || n === cur) return;
        cur = n;
        stage.classList.remove("g6-sheen");
        void stage.offsetWidth; // reinicia a animação (só em cliques, nunca em scroll)
        stage.classList.add("g6-sheen");
        clearTimeout(sheenT);
        sheenT = setTimeout(function () { stage.classList.remove("g6-sheen"); }, 1400);
      });
      imgs.forEach(function (i) { mo.observe(i, { attributes: true, attributeFilter: ["class"] }); });
      if ("IntersectionObserver" in window) {
        io = new IntersectionObserver(function (en) { stage.classList.toggle("g6-still", !en[0].isIntersecting); }, { rootMargin: "60px" });
        io.observe(stage);
      }
    }

    /* ---- Scroll narrativo (sem scroll-jacking; estados finais = estados normais; nada fica escondido) ---- */
    var mobile = !!ctx.mobile;

    /* Mobile: o Chat IA sai da frente dos botões de compra enquanto estes estão no ecrã */
    if (mobile && "IntersectionObserver" in window) {
      var seen = new Set();
      var cio = new IntersectionObserver(function (en) {
        en.forEach(function (e) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
        document.body.classList.toggle("g6-chat-away", seen.size > 0);
      }, { rootMargin: "0px" });
      root.querySelectorAll(".g6-pricebox .g6-actions, .g6-final .g6-actions").forEach(function (a) { cio.observe(a); });
      cleanup.push(function () { cio.disconnect(); document.body.classList.remove("g6-chat-away"); });
    }

    if (mobile) mobileMotion();

    if (!mobile) gctx = gsap.context(function () {
      var scrub = function (trigger, start, end, q) { return { trigger: trigger, start: start, end: end, scrub: q === undefined ? 0.6 : q }; };

      /* 1) Entrada em Vice City: sol que sobe, skyline em perspetiva, horizontes a velocidades diferentes */
      var vice = root.querySelector(".g6-vice");
      var sun = root.querySelector(".g6-vice .g6-sun");
      if (vice && sun) gsap.fromTo(sun, { scale: 0.82 }, { scale: 1.18, ease: "none", scrollTrigger: scrub(vice, "top bottom", "bottom top", true) });
      var fig = root.querySelector(".g6-mask");
      if (fig) gsap.fromTo(fig, { rotationX: 9, transformPerspective: 1200, transformOrigin: "50% 100%" }, { rotationX: 0, ease: "none", scrollTrigger: scrub(fig, "top 96%", "top 36%") });
      var speeds = [[22, -14], [36, -24], [50, -34]];
      root.querySelectorAll(".g6-divider").forEach(function (d, i) {
        var s = speeds[i] || speeds[0];
        gsap.fromTo(d, { "--dy": s[0] + "px" }, { "--dy": s[1] + "px", ease: "none", scrollTrigger: scrub(d.parentNode, "top bottom", "top 20%", true) });
      });

      /* 2) Exploração da galeria: a moldura levanta-se em perspetiva e ganha luz */
      if (stage) {
        gsap.fromTo(stage, { "--tilt": 9 }, { "--tilt": 0, ease: "none", scrollTrigger: scrub(stage, "top 98%", "top 45%") });
        gsap.fromTo(stage, { "--glow": 0 }, { "--glow": 1, ease: "none", scrollTrigger: scrub(stage, "top 85%", "center 45%") });
        var thumbs = root.querySelectorAll(".g6-thumb");
        if (thumbs.length) gsap.from(thumbs, { y: 18, duration: 0.7, stagger: 0.06, ease: "power3.out", clearProps: "transform", scrollTrigger: { trigger: stage, start: "bottom 92%", once: true } });
      }

      /* 3) Revelação da área de compra: brilho que cresce, coluna do cartão a deslocar-se mais devagar, brilho no preço */
      var box = root.querySelector(".g6-pricebox");
      if (box) {
        gsap.fromTo(box, { "--bloom": 0 }, { "--bloom": 1, ease: "none", scrollTrigger: scrub(box, "top 85%", "top 25%") });
        var left = root.querySelector(".g6-buyleft");
        if (left) gsap.fromTo(left, { "--by": "36px" }, { "--by": "-12px", ease: "none", scrollTrigger: scrub(box, "top bottom", "bottom top", true) });
        var price = box.querySelector(".g6-bigprice");
        if (price) ScrollTrigger.create({ trigger: box, start: "top 55%", once: true, onEnter: function () { price.classList.add("g6-glint"); } });
      }
    }, root);

    var rf = function () { ScrollTrigger.refresh(); };
    var t1 = setTimeout(rf, 900), t2 = setTimeout(rf, 2600);
    cleanup.push(function () { clearTimeout(t1); clearTimeout(t2); });

    /* ---------- Movimento mobile: leve, em uníssono com o toque ---------- */
    function mobileMotion() {
      root.classList.add("g6m-on");
      cleanup.push(function () { root.classList.remove("g6m-on"); });

      // 1) Estado "premido" imediato por pointerdown (iOS/Android; não usa :active nem listeners de touch)
      var PRESS = ".g6-btn, .g6-plat, .g6-thumb, .g6-nav-btn, .g6-faq summary";
      var clearPress = function () { root.querySelectorAll(".is-pressed").forEach(function (n) { n.classList.remove("is-pressed"); }); };
      var down = function (e) { var t = e.target.closest && e.target.closest(PRESS); if (t) t.classList.add("is-pressed"); };
      root.addEventListener("pointerdown", down, { passive: true });
      ["pointerup", "pointercancel"].forEach(function (ev) { root.addEventListener(ev, clearPress, { passive: true }); });
      // seleção de plataforma: pulso no cartão ativo (PS5); o Xbox navega para a sua página
      var tap = function (e) {
        var c = e.target.closest && e.target.closest(".g6-plat.is-active");
        if (c) { c.classList.remove("is-pulse"); void c.offsetWidth; c.classList.add("is-pulse"); }
      };
      root.addEventListener("click", tap);
      cleanup.push(function () { root.removeEventListener("pointerdown", down); root.removeEventListener("click", tap); ["pointerup", "pointercancel"].forEach(function (ev) { root.removeEventListener(ev, clearPress); }); });

      // 2) Entradas únicas por IntersectionObserver (só o que ainda está abaixo do ecrã fica "pre"; rede de segurança a 8 s)
      var targets = [];
      [".g6-mask", ".g6-pricebox .g6-bigprice", ".g6-buycard"].forEach(function (sel) { var n = root.querySelector(sel); if (n) targets.push(n); });
      var foot = document.querySelector(".site-footer"); if (foot) targets.push(foot);
      if ("IntersectionObserver" in window && targets.length) {
        var vh = window.innerHeight, pending = [];
        targets.forEach(function (n) { if (n.getBoundingClientRect().top > vh * 0.92) { n.classList.add("g6m-pre"); pending.push(n); } });
        var rio = new IntersectionObserver(function (en) {
          en.forEach(function (e) {
            if (!e.isIntersecting) return;
            var o = e.target, n = o.__g6t || o; rio.unobserve(o); n.classList.add("is-in");
            if (n.classList.contains("g6-bigprice")) setTimeout(function () { n.classList.add("g6-glint"); }, 650);
          });
        }, { threshold: 0.12 });
        // o IntersectionObserver ignora um alvo totalmente cortado pelo seu próprio clip-path: o preço é observado pelo pai
        pending.forEach(function (n) { var o = n.classList.contains("g6-bigprice") ? n.parentNode : n; o.__g6t = n; rio.observe(o); });
        var safe = setTimeout(function () { pending.forEach(function (n) { n.classList.add("is-in"); }); }, 8000);
        cleanup.push(function () { rio.disconnect(); clearTimeout(safe); targets.forEach(function (n) { n.classList.remove("g6m-pre", "is-in"); }); });
      }

      // 3) Miniaturas: a ativa fica centrada ao trocar de imagem
      var strip = root.querySelector(".g6-thumbs");
      if (strip && imgs.length) {
        var center = function () {
          var t = strip.querySelector('[aria-current="true"]'); if (!t) return;
          strip.scrollTo({ left: Math.max(0, t.offsetLeft - (strip.clientWidth - t.clientWidth) / 2), behavior: "smooth" });
        };
        var mo2 = new MutationObserver(center);
        strip.querySelectorAll(".g6-thumb").forEach(function (t) { mo2.observe(t, { attributes: true, attributeFilter: ["aria-current"] }); });
        cleanup.push(function () { mo2.disconnect(); });
      }

      // 4) FAQ: abrir/fechar com altura animada (WAAPI), sem saltos; teclado e leitores de ecrã continuam a usar <details>
      root.querySelectorAll(".g6-faq details").forEach(function (d) {
        var s = d.querySelector("summary"); if (!s || !d.animate) return;
        var h = function (e) {
          e.preventDefault();
          if (d.__a) { d.__a.cancel(); d.__a = null; }
          var cs = getComputedStyle(d);
          var collapsed = s.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
          var from = d.offsetHeight, opening = !d.open, to;
          d.style.overflow = "hidden";
          if (opening) { d.open = true; to = d.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth); from = Math.min(from, to); }
          else to = collapsed;
          var a = d.__a = d.animate([{ height: from + "px" }, { height: to + "px" }], { duration: 320, easing: "cubic-bezier(.2,.7,.2,1)" });
          a.onfinish = function () { d.__a = null; d.style.overflow = ""; if (!opening) d.open = false; };
          a.oncancel = function () { d.style.overflow = ""; };
        };
        s.addEventListener("click", h);
        cleanup.push(function () { s.removeEventListener("click", h); });
      });
    }

    function dispose() {
      if (mo) mo.disconnect();
      if (io) io.disconnect();
      clearTimeout(sheenT);
      if (gctx) gctx.revert();
      cleanup.forEach(function (fn) { try { fn(); } catch (e) { /* ignora */ } });
      cleanup = [];
      if (stage) stage.classList.remove("g6-sheen", "g6-still");
      root.classList.remove("g6-v6");
    }
    window.addEventListener("pagehide", dispose, { once: true });
    root.__g6v6 = { dispose: dispose };
    return root.__g6v6;
  }

  window.GalaxyLandingGta6V6 = { enhance: enhance };
})();
