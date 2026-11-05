/*
 * Landing GTA VI — camada V3 (Vice City).
 * Corre depois da V2 (que mantém a cena Three.js única). Não cria outro canvas.
 * - Hero em camadas SVG/CSS originais: sol, neblina, horizonte, palmeiras, com parallax do cursor e "dolly" no scroll.
 * - Capítulos: a iluminação da página muda por secção (sticky .g6-light) e há horizontes a ligar as secções.
 * - Galeria: transição em perspetiva, arrasto com resposta visual e expansão em ecrã inteiro.
 * - Compra: composição em duas colunas, luz que segue o cursor, entrada coordenada do preço.
 * Tudo em gsap.context e revertido em dispose().
 */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  /* ---------- Geradores SVG originais (determinísticos) ---------- */
  function skylineD(w, h, seed, minH, maxH, segW) {
    var r = rng(seed), x = 0, d = "M0 " + h;
    while (x < w) {
      var bw = segW * (0.6 + r() * 1.3), bh = minH + r() * (maxH - minH), top = h - bh;
      d += " L" + x.toFixed(0) + " " + top.toFixed(0) + " L" + (x + bw).toFixed(0) + " " + top.toFixed(0);
      var k = r();
      if (k > 0.82) { var mx = x + bw * 0.5; d += " L" + mx.toFixed(0) + " " + top.toFixed(0) + " L" + mx.toFixed(0) + " " + (top - 16).toFixed(0) + " L" + (mx + 2).toFixed(0) + " " + (top - 16).toFixed(0) + " L" + (mx + 2).toFixed(0) + " " + top.toFixed(0); }
      else if (k > 0.6) { d += " L" + (x + bw * 0.2).toFixed(0) + " " + top.toFixed(0) + " L" + (x + bw * 0.2).toFixed(0) + " " + (top - 8).toFixed(0) + " L" + (x + bw * 0.8).toFixed(0) + " " + (top - 8).toFixed(0) + " L" + (x + bw * 0.8).toFixed(0) + " " + top.toFixed(0); }
      x += bw;
    }
    return d + " L" + w + " " + h + " Z";
  }

  function palmSVG(x, baseY, height, bend, seed, fill) {
    var r = rng(seed), tx = x + bend, ty = baseY - height;
    var s = '<path d="M' + x + ' ' + baseY + ' Q' + (x + bend * 0.1) + ' ' + (baseY - height * 0.55) + ' ' + tx + ' ' + ty + '" fill="none" stroke="' + fill + '" stroke-width="' + Math.max(4, height * 0.022).toFixed(1) + '" stroke-linecap="round"/>';
    var n = 12;
    for (var i = 0; i < n; i++) {
      var a = (-Math.PI * 1.0) + (Math.PI * 1.0) * (i / (n - 1)) + (r() - 0.5) * 0.18;
      var len = height * (0.36 + r() * 0.16), w = len * 0.1;
      var ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.5 + len * 0.5;
      var cx = tx + Math.cos(a) * len * 0.55, cy = ty + Math.sin(a) * len * 0.7 - len * 0.12;
      s += '<path d="M' + tx.toFixed(0) + ' ' + ty.toFixed(0) + ' Q' + (cx - w).toFixed(0) + ' ' + (cy - w).toFixed(0) + ' ' + ex.toFixed(0) + ' ' + ey.toFixed(0) + ' Q' + (cx + w).toFixed(0) + ' ' + (cy + w).toFixed(0) + ' ' + tx.toFixed(0) + ' ' + ty.toFixed(0) + ' Z" fill="' + fill + '"/>';
    }
    return s;
  }

  function svg(viewBox, inner, cls) {
    var el = document.createElementNS(NS, "svg");
    el.setAttribute("viewBox", viewBox);
    el.setAttribute("preserveAspectRatio", "xMidYMax slice");
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("focusable", "false");
    if (cls) el.setAttribute("class", cls);
    el.innerHTML = inner;
    return el;
  }

  function heroLayers() {
    var W = 1600, H = 520;
    var defs = '<defs><pattern id="g6win" width="14" height="18" patternUnits="userSpaceOnUse"><rect x="4" y="5" width="2.5" height="3.5" fill="#ffb35c" opacity=".5"/><rect x="9" y="11" width="2.5" height="3.5" fill="#ff6fb0" opacity=".4"/></pattern></defs>';
    var far = svg("0 0 " + W + " " + H, defs + '<path d="' + skylineD(W, H, 11, 90, 230, 46) + '" fill="#5b1a78" opacity=".7"/><path d="' + skylineD(W, H, 11, 90, 230, 46) + '" fill="url(#g6win)" opacity=".32"/>', "g6-l g6-l-far");
    var mid = svg("0 0 " + W + " " + H, '<path d="' + skylineD(W, H, 29, 60, 160, 64) + '" fill="#26083a"/>', "g6-l g6-l-mid");
    var fg = svg("0 0 " + W + " " + H, '<path d="' + skylineD(W, H, 53, 18, 58, 110) + '" fill="#07020d"/>' +
      palmSVG(60, H, 420, 34, 5, "#07020d") + palmSVG(150, H, 280, -22, 8, "#07020d") +
      palmSVG(W - 80, H, 460, -42, 13, "#07020d") + palmSVG(W - 210, H, 310, 30, 21, "#07020d"), "g6-l g6-l-fg");
    return [far, mid, fg];
  }

  function dividerSVG(seed) {
    var W = 1600, H = 140;
    return svg("0 0 " + W + " " + H, '<path d="' + skylineD(W, H, seed, 18, 100, 70) + '" fill="#07020d"/>', "g6-divider-svg");
  }

  /* ---------- Montagem ---------- */
  function enhance(root, ctx) {
    var gsap = ctx.gsap, ScrollTrigger = ctx.ScrollTrigger, lenis = ctx.lenis;
    var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var cleanup = [], gctx;

    root.classList.add("g6-v3");
    var css = document.querySelector('link[data-g6css="v3"]');
    if (!css) { css = document.createElement("link"); css.rel = "stylesheet"; css.href = "landing-gta6-v3.css?v=20261105-22"; css.setAttribute("data-g6css", "v3"); document.head.appendChild(css); }
    cleanup.push(function () { if (css.parentNode) css.parentNode.removeChild(css); });

    var hero = root.querySelector(".g6-hero");

    /* Hero: camadas */
    var stack = document.createElement("div");
    stack.className = "g6-stack";
    stack.setAttribute("aria-hidden", "true");
    stack.innerHTML = '<div class="g6-sun3"></div><div class="g6-haze"></div>';
    var layers = heroLayers();
    stack.insertBefore(layers[0], stack.querySelector(".g6-haze"));
    stack.appendChild(layers[1]);
    stack.appendChild(layers[2]);
    hero.appendChild(stack);
    cleanup.push(function () { if (stack.parentNode) stack.parentNode.removeChild(stack); });

    /* Luz de capítulo (sticky, dentro do root: não cobre o rodapé) */
    var light = document.createElement("div");
    light.className = "g6-light";
    light.setAttribute("aria-hidden", "true");
    root.insertBefore(light, root.firstChild);
    cleanup.push(function () { if (light.parentNode) light.parentNode.removeChild(light); });

    /* Horizontes entre capítulos */
    [["#g6-vice", 71], ["#g6-preco", 83], ["#g6-faq", 97]].forEach(function (p) {
      var sec = root.querySelector(p[0]);
      if (!sec) return;
      var d = document.createElement("div");
      d.className = "g6-divider";
      d.setAttribute("aria-hidden", "true");
      d.appendChild(dividerSVG(p[1]));
      sec.insertBefore(d, sec.firstChild);
      cleanup.push(function () { if (d.parentNode) d.parentNode.removeChild(d); });
    });

    /* Capítulo Vice City: figura com máscara */
    var viceGrid = root.querySelector(".g6-vice-grid");
    var fig = null;
    if (viceGrid) {
      fig = document.createElement("figure");
      fig.className = "g6-mask";
      fig.innerHTML = '<img src="assets/gta-vi-visual-skyline.jpg" alt="Skyline de Vice City ao anoitecer" loading="lazy" decoding="async" width="1600" height="900"><figcaption>Vice City · Leonida</figcaption>';
      viceGrid.insertBefore(fig, viceGrid.children[1] || null);
      cleanup.push(function () { if (fig.parentNode) fig.parentNode.removeChild(fig); });
    }

    buildBuy(root, cleanup);

    gctx = gsap.context(function () {
      /* --- Hero: dolly de camada + parallax do cursor --- */
      var far = root.querySelector(".g6-l-far"), mid = root.querySelector(".g6-l-mid"), fg = root.querySelector(".g6-l-fg");
      var sun = root.querySelector(".g6-sun3"), haze = root.querySelector(".g6-haze");

      gsap.from([far, mid, fg], { yPercent: 14, opacity: 0, duration: 1.8, ease: "power3.out", stagger: 0.18, delay: 0.2 });
      gsap.from(sun, { yPercent: 40, opacity: 0, duration: 2.4, ease: "power3.out", delay: 0.1 });

      var st = { trigger: hero, start: "top top", end: "bottom top", scrub: true };
      if (!ctx.mobile) {
        gsap.to(fg, { scale: 1.45, yPercent: 8, transformOrigin: "50% 100%", ease: "none", scrollTrigger: st });
        gsap.to(mid, { scale: 1.22, transformOrigin: "50% 100%", ease: "none", scrollTrigger: st });
        gsap.to(far, { scale: 1.1, transformOrigin: "50% 100%", ease: "none", scrollTrigger: st });
        gsap.to(sun, { yPercent: -18, scale: 1.12, ease: "none", scrollTrigger: st });
      } else {
        // mobile: só o primeiro plano se afasta ligeiramente (transform apenas)
        gsap.to(fg, { yPercent: 10, ease: "none", scrollTrigger: st });
      }

      if (fine) {
        var q = [[far, 6], [mid, 14], [fg, 30], [sun, -4]].map(function (p) {
          return { x: gsap.quickTo(p[0], "x", { duration: 1.2, ease: "power3.out" }), y: gsap.quickTo(p[0], "y", { duration: 1.2, ease: "power3.out" }), k: p[1] };
        });
        var onMove = function (e) {
          var nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
          q.forEach(function (o) { o.x(-nx * o.k * 2); o.y(-ny * o.k); });
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        cleanup.push(function () { window.removeEventListener("pointermove", onMove); });
      }

      /* --- Capítulos: iluminação --- */
      var PAL = {
        "g6-vice": ["rgba(25,181,214,.26)", "rgba(255,138,61,.20)", "82%", "18%"],
        "g6-gallery": ["rgba(255,46,147,.24)", "rgba(122,44,255,.28)", "18%", "30%"],
        "g6-platforms": ["rgba(122,44,255,.30)", "rgba(25,181,214,.20)", "80%", "25%"],
        "g6-exp": ["rgba(255,138,61,.26)", "rgba(255,46,147,.20)", "20%", "20%"],
        "g6-pricebox": ["rgba(255,46,147,.34)", "rgba(255,138,61,.24)", "50%", "15%"],
        "g6-faq": ["rgba(122,44,255,.20)", "rgba(25,181,214,.14)", "75%", "20%"],
        "g6-final": ["rgba(255,138,61,.32)", "rgba(255,46,147,.26)", "50%", "30%"]
      };
      if (!ctx.mobile) gsap.set(light, { "--lc1": "rgba(255,46,147,0.0)", "--lc2": "rgba(255,138,61,0.0)", "--lx": "50%", "--ly": "20%" });
      function grade(key) {
        var p = PAL[key]; if (!p) return;
        gsap.to(light, { "--lc1": p[0], "--lc2": p[1], "--lx": p[2], "--ly": p[3], duration: 1.4, ease: "power2.inOut", overwrite: "auto" });
      }
      if (!ctx.mobile) Object.keys(PAL).forEach(function (key) {
        var sec = root.querySelector("." + key);
        if (!sec) return;
        ScrollTrigger.create({ trigger: sec, start: "top 55%", end: "bottom 45%", onEnter: function () { grade(key); }, onEnterBack: function () { grade(key); } });
      });
      if (!ctx.mobile) ScrollTrigger.create({ trigger: hero, start: "top top", end: "bottom 60%", onEnterBack: function () { gsap.to(light, { "--lc1": "rgba(255,46,147,0)", "--lc2": "rgba(255,138,61,0)", duration: 1, overwrite: "auto" }); } });

      /* --- Figura com máscara + zoom controlado pelo scroll --- */
      if (fig && !ctx.mobile) {
        var img = fig.querySelector("img");
        gsap.fromTo(fig, { clipPath: "inset(22% 22% 22% 22% round 26px)" },
          { clipPath: "inset(0% 0% 0% 0% round 26px)", ease: "none", scrollTrigger: { trigger: fig, start: "top 92%", end: "top 38%", scrub: 0.6 } });
        gsap.fromTo(img, { scale: 1.45 }, { scale: 1, ease: "none", scrollTrigger: { trigger: fig, start: "top 92%", end: "bottom 30%", scrub: 0.6 } });
      }

      /* --- Compra: entrada coordenada --- */
      var left = root.querySelector(".g6-buyleft"), price = root.querySelector(".g6-pricebox .g6-bigprice"), facts = root.querySelectorAll(".g6-facts li"), cta = root.querySelector(".g6-pricebox .g6-actions");
      if (left && price) {
        var tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
        if (ctx.mobile) tl.from([left, right0(root)], { y: 22, opacity: 0, duration: 0.6, stagger: 0.08, clearProps: "transform,opacity" }, 0);
        else tl.from(left, { rotationY: -28, x: -80, opacity: 0, duration: 1.2, transformPerspective: 1000, clearProps: "transform,opacity" }, 0)
          .fromTo(price, { clipPath: "inset(0 0 100% 0)", y: 50, scale: 1.08 }, { clipPath: "inset(-5% 0 -15% 0)", y: 0, scale: 1, duration: 1.1, clearProps: "clipPath" }, 0.25)
          .from(facts, { y: 20, opacity: 0, duration: 0.6, stagger: 0.1, clearProps: "transform,opacity" }, 0.7)
          .from(cta, { y: 24, opacity: 0, duration: 0.7, clearProps: "transform,opacity" }, 0.95);
        if (ctx.mobile) tl.timeScale(1);
        ScrollTrigger.create({ trigger: left, start: "top 85%", once: true, onEnter: function () { tl.play(); } });
      }
    }, root);

    /* --- Galeria premium --- */
    bindGallery(root, gsap, lenis, fine, cleanup);

    /* --- Luz que segue o cursor na compra --- */
    var box = root.querySelector(".g6-pricebox");
    if (box && fine) {
      var mv = function (e) { var r = box.getBoundingClientRect(); box.style.setProperty("--spx", (e.clientX - r.left) + "px"); box.style.setProperty("--spy", (e.clientY - r.top) + "px"); };
      box.addEventListener("pointermove", mv);
      cleanup.push(function () { box.removeEventListener("pointermove", mv); });
    }

    /* As posições dos triggers mudaram com a nova composição: recalcular */
    var rf = function () { ScrollTrigger.refresh(); };
    requestAnimationFrame(rf);
    var t1 = setTimeout(rf, 900), t2 = setTimeout(rf, 2500);
    cleanup.push(function () { clearTimeout(t1); clearTimeout(t2); });
    if (fig) { var fi = fig.querySelector("img"); fi.addEventListener("load", rf, { once: true }); }

    /* Pausa animações CSS dos novos blocos fora do ecrã */
    var io = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(function (en) { en.forEach(function (e) { e.target.classList.toggle("g6-idle", !e.isIntersecting); }); }, { rootMargin: "80px" });
      [hero, box].forEach(function (s) { if (s) io.observe(s); });
    }

    function dispose() {
      if (io) io.disconnect();
      if (gctx) gctx.revert();
      cleanup.forEach(function (fn) { try { fn(); } catch (e) { /* ignora */ } });
      cleanup = [];
      root.classList.remove("g6-v3");
    }
    window.addEventListener("pagehide", dispose, { once: true });
    root.__g6v3 = { dispose: dispose };
    return root.__g6v3;
  }

  function right0(root) { return root.querySelector(".g6-buyright") || root.querySelector(".g6-pricebox .g6-bigprice"); }

  /* ---------- Compra: recomposição do bloco existente (preserva botões e listeners) ---------- */
  function buildBuy(root, cleanup) {
    var wrap = root.querySelector(".g6-pricebox .g6-wrap");
    if (!wrap || wrap.querySelector(".g6-buygrid")) return;
    var holder = wrap.querySelector(".g6-buycard-float");
    var eyebrow = wrap.querySelector(".g6-eyebrow"), h2 = wrap.querySelector(".g6-h2"), price = wrap.querySelector(".g6-bigprice"), lead = wrap.querySelector(".g6-lead"), actions = wrap.querySelector(".g6-actions");
    if (!holder || !price || !actions) return;
    var releaseEl = root.querySelector(".g6-hero .g6-price small");
    var release = releaseEl ? releaseEl.textContent : "";

    var grid = document.createElement("div"); grid.className = "g6-buygrid";
    var left = document.createElement("div"); left.className = "g6-buyleft";
    var right = document.createElement("div"); right.className = "g6-buyright";
    var facts = document.createElement("ul"); facts.className = "g6-facts";
    facts.innerHTML =
      "<li><b>Plataforma</b> PlayStation 5</li>" +
      "<li><b>Formato</b> Edição digital, sem envio</li>" +
      "<li><b>Acesso</b> Conta GalaxyGame e email, após a confirmação do pagamento</li>" +
      (release ? "<li><b>Estado</b> Pré-lançamento · " + release.toLowerCase().replace("lançamento previsto: ", "lançamento previsto ") + "</li>" : "");

    left.appendChild(holder);
    [eyebrow, h2, price, lead, facts, actions].forEach(function (n) { if (n) right.appendChild(n); });
    grid.appendChild(left); grid.appendChild(right);
    wrap.appendChild(grid);
    // reposição simples: ao desmontar, volta a V2 (ordem original)
    cleanup.push(function () {
      [eyebrow, h2, holder, price, lead, actions].forEach(function (n) { if (n) wrap.appendChild(n); });
      if (grid.parentNode) grid.parentNode.removeChild(grid);
    });
  }

  /* ---------- Galeria: direção, arrasto, expansão ---------- */
  function bindGallery(root, gsap, lenis, fine, cleanup) {
    var stage = root.querySelector(".g6-stage");
    if (!stage) return;
    var imgs = Array.prototype.slice.call(stage.querySelectorAll("img"));
    var cur = Math.max(0, imgs.findIndex(function (i) { return i.classList.contains("on"); }));

    // direção + classe "leaving" (a imagem que sai afasta-se em perspetiva)
    var mo = new MutationObserver(function () {
      var n = imgs.findIndex(function (i) { return i.classList.contains("on"); });
      if (n < 0 || n === cur) return;
      var dir = (n > cur || (cur === imgs.length - 1 && n === 0)) && !(cur === 0 && n === imgs.length - 1) ? 1 : -1;
      stage.style.setProperty("--dir", dir);
      var old = imgs[cur]; old.classList.add("leaving");
      setTimeout(function () { old.classList.remove("leaving"); }, 1200);
      cur = n;
    });
    imgs.forEach(function (i) { mo.observe(i, { attributes: true, attributeFilter: ["class"] }); });
    cleanup.push(function () { mo.disconnect(); });

    // arrasto com resposta visual (a navegação por swipe continua na V2)
    var x0 = null, moved = 0, id = null;
    var down = function (e) { if (e.target.closest("button")) return; x0 = e.clientX; moved = 0; id = e.pointerId; };
    var move = function (e) {
      if (x0 === null || e.pointerId !== id) return;
      var dx = e.clientX - x0; moved = Math.max(moved, Math.abs(dx));
      if (moved > 6) { stage.classList.add("dragging"); stage.style.setProperty("--drag", Math.max(-140, Math.min(140, dx * 0.5)) + "px"); }
    };
    var end = function () {
      var wasClick = x0 !== null && moved < 6;
      x0 = null; stage.classList.remove("dragging"); stage.style.setProperty("--drag", "0px");
      if (wasClick) setTimeout(function () { openExpand(); }, 0);
    };
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    cleanup.push(function () { stage.removeEventListener("pointerdown", down); stage.removeEventListener("pointermove", move); stage.removeEventListener("pointerup", end); stage.removeEventListener("pointercancel", end); });

    // botão acessível de expansão (teclado)
    var exp = document.createElement("button");
    exp.type = "button"; exp.className = "g6-expand-btn"; exp.setAttribute("aria-label", "Ver imagem em ecrã inteiro");
    exp.innerHTML = "&#10530;";
    exp.addEventListener("click", function (e) { e.stopPropagation(); openExpand(); });
    exp.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    stage.appendChild(exp);
    cleanup.push(function () { if (exp.parentNode) exp.parentNode.removeChild(exp); });

    var overlay = null, opener = null, onKey = null;
    function activeSrc() { var a = imgs[Math.max(0, imgs.findIndex(function (i) { return i.classList.contains("on"); }))]; return { src: a.currentSrc || a.src, alt: a.alt }; }
    function openExpand() {
      if (overlay) return;
      opener = document.activeElement;
      var r = stage.getBoundingClientRect(), a = activeSrc();
      overlay = document.createElement("div");
      overlay.className = "g6-expand"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", "Imagem em ecrã inteiro");
      overlay.innerHTML = '<img src="' + a.src + '" alt=""><button type="button" class="g6-expand-close" aria-label="Fechar">&times;</button><button type="button" class="g6-expand-nav g6-expand-prev" aria-label="Imagem anterior">&#8249;</button><button type="button" class="g6-expand-nav g6-expand-next" aria-label="Imagem seguinte">&#8250;</button>';
      overlay.querySelector("img").alt = a.alt;
      document.body.appendChild(overlay);
      if (lenis && lenis.stop) lenis.stop();
      document.body.style.overflow = "hidden";
      var W = window.innerWidth, H = window.innerHeight;
      gsap.fromTo(overlay, { clipPath: "inset(" + r.top + "px " + (W - r.right) + "px " + (H - r.bottom) + "px " + r.left + "px round 22px)", opacity: 1 },
        { clipPath: "inset(0px 0px 0px 0px round 0px)", duration: 0.8, ease: "power4.inOut" });
      gsap.fromTo(overlay.querySelector("img"), { scale: 1.15 }, { scale: 1, duration: 1, ease: "power3.out" });
      var closeBtn = overlay.querySelector(".g6-expand-close"); closeBtn.focus();
      function swap(dirBtn) {
        var b = stage.querySelector(dirBtn); if (b) b.click();
        setTimeout(function () { var s = activeSrc(); var im = overlay && overlay.querySelector("img"); if (im) { im.src = s.src; im.alt = s.alt; } }, 60);
      }
      overlay.querySelector(".g6-expand-prev").addEventListener("click", function () { swap("[data-g6-prev]"); });
      overlay.querySelector(".g6-expand-next").addEventListener("click", function () { swap("[data-g6-next]"); });
      closeBtn.addEventListener("click", closeExpand);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) closeExpand(); });
      onKey = function (e) {
        if (e.key === "Escape") closeExpand();
        else if (e.key === "ArrowLeft") swap("[data-g6-prev]");
        else if (e.key === "ArrowRight") swap("[data-g6-next]");
        else if (e.key === "Tab") { // armadilha de foco simples
          var f = overlay.querySelectorAll("button"), first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener("keydown", onKey);
    }
    function closeExpand() {
      if (!overlay) return;
      var o = overlay, r = stage.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
      overlay = null; document.removeEventListener("keydown", onKey);
      gsap.to(o, { clipPath: "inset(" + Math.max(0, r.top) + "px " + Math.max(0, W - r.right) + "px " + Math.max(0, H - r.bottom) + "px " + Math.max(0, r.left) + "px round 22px)", duration: 0.6, ease: "power4.inOut",
        onComplete: function () { if (o.parentNode) o.parentNode.removeChild(o); document.body.style.overflow = ""; if (lenis && lenis.start) lenis.start(); if (opener && opener.focus) opener.focus(); } });
    }
    cleanup.push(function () { if (overlay) { overlay.parentNode && overlay.parentNode.removeChild(overlay); overlay = null; document.body.style.overflow = ""; if (lenis && lenis.start) lenis.start(); } if (onKey) document.removeEventListener("keydown", onKey); });
  }

  window.GalaxyLandingGta6V3 = { enhance: enhance };
})();
