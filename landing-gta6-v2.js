/*
 * Landing GTA VI — camada V2 (3D + scroll cinematográfico).
 * Corre por cima da V1 (landing-gta6.js): não substitui nada, só acrescenta.
 * - Three.js (vendor/three.min.js) só é carregado aqui, só em dispositivos capazes.
 * - Cena 100% original e abstrata: partículas, grelha neon, formas em wireframe, brilhos.
 * - Sem WebGL, dispositivo fraco ou fps baixo: cena removida, fica o fallback 2D (CSS).
 * - Tudo o que é GSAP corre dentro de gsap.context e é revertido em dispose().
 */
(function () {
  "use strict";

  var THREE_SRC = "vendor/three.min.js?v=0.149.0";

  function qs(name) { try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; } }

  function hasWebGL() {
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl2") || c.getContext("webgl");
      var ok = !!gl;
      if (gl && gl.getExtension) { var ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); }
      return ok;
    } catch (e) { return false; }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = function () { reject(new Error("falha ao carregar " + src)); };
      document.head.appendChild(s);
    });
  }

  function glowTexture(THREE) {
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var g = c.getContext("2d");
    var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /* ---------------- Cena WebGL (única, no hero) ---------------- */
  function createScene(root, THREE, opts) {
    var hero = root.querySelector(".g6-hero");
    var canvas = document.createElement("canvas");
    canvas.className = "g6-gl";
    canvas.setAttribute("aria-hidden", "true");
    var host = root.querySelector(".g6-fx") || hero;
    host.insertBefore(canvas, host.firstChild);

    var mobile = opts.mobile;
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
    var maxDpr = mobile ? 1.25 : 1.75;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x12031f, 10, 58);
    var camera = new THREE.PerspectiveCamera(60, 1, 0.1, 120);

    var disposables = [];
    function track(o) { disposables.push(o); return o; }

    var PINK = 0xff2e93, ORANGE = 0xff8a3d, PURPLE = 0x7a2cff, CYAN = 0x19b5d6;

    var v3 = !!opts.v3;
    // Grelha neon (chão), move-se em direção à câmara (só V2; a V3 usa camadas SVG)
    var cell = 2, divisions = mobile ? 30 : 44, size = cell * divisions, grid = null;
    if (!v3) {
      grid = new THREE.GridHelper(size, divisions, PINK, PURPLE);
      grid.material.transparent = true; grid.material.opacity = 0.36;
      grid.position.set(0, -2.4, -size / 2 + 8);
      scene.add(grid); track(grid.geometry); track(grid.material);
    }

    // Partículas
    var count = v3 ? (mobile ? 180 : 420) : (mobile ? 320 : 900);
    var pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    var palette = v3 ? [new THREE.Color(ORANGE), new THREE.Color(ORANGE), new THREE.Color(PINK), new THREE.Color(0xffd08a), new THREE.Color(CYAN)] : [new THREE.Color(PINK), new THREE.Color(ORANGE), new THREE.Color(PURPLE), new THREE.Color(CYAN)];
    for (var i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = Math.random() * 14 - 3;
      pos[i * 3 + 2] = -Math.random() * 50 + 6;
      var c = palette[(Math.random() * palette.length) | 0];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    var pGeo = track(new THREE.BufferGeometry());
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    var glowTex = track(glowTexture(THREE));
    var pMat = track(new THREE.PointsMaterial({ size: v3 ? (mobile ? 0.2 : 0.15) : (mobile ? 0.28 : 0.22), map: glowTex, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    var points = new THREE.Points(pGeo, pMat);
    scene.add(points);

    // Formas flutuantes (wireframe, abstratas)
    var shapes = [];
    function addShape(geo, color, x, y, z, speed) {
      geo = track(geo);
      var m = track(new THREE.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.55, fog: true }));
      var mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.userData = { y0: y, speed: speed, ph: Math.random() * 6 };
      scene.add(mesh); shapes.push(mesh);
    }
    if (!v3) {
      addShape(new THREE.IcosahedronGeometry(1.6, 0), PINK, -8, 4.2, -14, 0.35);
      addShape(new THREE.TorusGeometry(1.8, 0.05, 8, 64), ORANGE, 9, 5.2, -20, 0.25);
      if (!mobile) addShape(new THREE.OctahedronGeometry(1.1, 0), CYAN, 5.5, 1.8, -9, 0.5);
    }

    // Brilhos atmosféricos (sprites aditivos)
    function addGlow(color, x, y, z, s, o) {
      var sm = track(new THREE.SpriteMaterial({ map: glowTex, color: color, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      var sp = new THREE.Sprite(sm); sp.position.set(x, y, z); sp.scale.set(s, s, 1); scene.add(sp);
    }
    addGlow(PINK, 8, 5, -30, 38, 0.32);
    addGlow(ORANGE, -12, 0, -26, 30, 0.26);
    addGlow(PURPLE, 0, 8, -40, 52, 0.3);
    if (v3) addGlow(ORANGE, 0, 1, -36, 64, 0.34); // halo do pôr do sol

    var st = { intro: 7, prog: 0, mx: 0, my: 0, tmx: 0, tmy: 0 };
    var running = false, raf = 0, last = 0, frames = 0, acc = 0, disposed = false, onDegrade = opts.onDegrade;

    function resize() {
      var w = hero.clientWidth, h = hero.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    var ro = ("ResizeObserver" in window) ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(hero); else window.addEventListener("resize", resize);
    resize();

    var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    function onMove(e) { st.tmx = (e.clientX / window.innerWidth) * 2 - 1; st.tmy = (e.clientY / window.innerHeight) * 2 - 1; }
    if (fine) window.addEventListener("pointermove", onMove, { passive: true });

    function frame(now) {
      if (!running || disposed) return;
      raf = requestAnimationFrame(frame);
      var dt = last ? Math.min((now - last) / 1000, 0.1) : 0.016; last = now;
      var t = now / 1000;

      // fps adaptativo: ignora 40 frames de arranque; avalia os 90 seguintes
      frames++;
      if (opts.adaptive && frames > 40 && frames <= 130) {
        acc += dt;
        if (frames === 130 && acc / 90 > 0.034) { degrade(); return; }
      }

      var auto = fine ? 0 : Math.sin(t * 0.35) * 0.5;
      st.mx += ((fine ? st.tmx : auto) - st.mx) * 0.05;
      st.my += ((fine ? st.tmy : 0) - st.my) * 0.05;

      var zBase = 6 + (st.intro) - st.prog * 7 - Math.min(t * 0.05, 1.2); // avanço lento + scroll
      camera.position.set(st.mx * 0.9, 1.3 - st.my * 0.35 + st.prog * 0.6, zBase);
      camera.fov = 60 + st.prog * 12; camera.updateProjectionMatrix();
      camera.lookAt(st.mx * 0.4, 0.6, -20);

      // chão infinito
      if (grid) grid.position.z = (-size / 2 + 8) + ((t * 3.2) % cell);
      if (v3) { // brasas a subir devagar
        var pa = pGeo.attributes.position.array;
        for (var q = 0; q < count; q++) { var yy = pa[q * 3 + 1] + dt * (0.18 + (q % 5) * 0.05); pa[q * 3 + 1] = yy > 11 ? -3 : yy; }
        pGeo.attributes.position.needsUpdate = true;
      }
      points.rotation.y = t * 0.012 + st.mx * 0.08;
      points.rotation.x = st.my * 0.04;
      points.position.y = Math.sin(t * 0.25) * 0.3;
      for (var k = 0; k < shapes.length; k++) {
        var s = shapes[k], d = s.userData;
        s.rotation.x += dt * d.speed; s.rotation.y += dt * d.speed * 0.7;
        s.position.y = d.y0 + Math.sin(t * d.speed + d.ph) * 0.5;
      }
      renderer.render(scene, camera);
    }

    function start() { if (running || disposed) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (en) { en[en.length - 1].isIntersecting && !document.hidden ? start() : stop(); }, { threshold: 0 }) : null;
    if (io) io.observe(hero); else start();
    function onVis() { if (document.hidden) stop(); else if (!io) start(); }
    document.addEventListener("visibilitychange", onVis);

    function onLost(e) { e.preventDefault(); degrade(); }
    canvas.addEventListener("webglcontextlost", onLost);

    function degrade() { if (disposed) return; dispose(); if (onDegrade) onDegrade(); }

    function dispose() {
      if (disposed) return; disposed = true; stop();
      if (io) io.disconnect();
      if (ro) ro.disconnect(); else window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      disposables.forEach(function (o) { try { o.dispose(); } catch (e) { /* ignora */ } });
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) { /* ignora */ }
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    return { state: st, dispose: dispose, start: start, get running() { return running; } };
  }

  /* ---------------- Camada GSAP / DOM ---------------- */
  function enhance(root, ctx) {
    var gsap = ctx.gsap, ScrollTrigger = ctx.ScrollTrigger;
    var mobile = (window.matchMedia && window.matchMedia("(max-width: 820px), (pointer: coarse)").matches);
    var forceGL = qs("gl") === "force";
    var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var cleanup = [];
    var scene = null;
    var gctx;

    root.classList.add("g6-v2");
    var css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "landing-gta6-v2.css?v=20261105-12";
    document.head.appendChild(css);
    cleanup.push(function () { if (css.parentNode) css.parentNode.removeChild(css); });
    var hero0 = root.querySelector(".g6-hero");
    var fx = document.createElement("div");
    fx.className = "g6-fx";
    fx.setAttribute("aria-hidden", "true");
    fx.innerHTML = "<div class=\"g6-fx2d\"><i></i><i></i><i></i></div>";
    hero0.insertBefore(fx, hero0.firstChild);
    cleanup.push(function () { if (fx.parentNode) fx.parentNode.removeChild(fx); });

    function show2D() { root.classList.add("g6-v2-2d"); }

    // 3D (opcional)
    var wantGL = !forceGL ? (hasWebGL() && !(navigator.deviceMemory && navigator.deviceMemory < 4)) : hasWebGL();
    var glReady = Promise.resolve();
    if (wantGL) {
      glReady = loadScript(THREE_SRC).then(function () {
        scene = createScene(root, window.THREE, {
          mobile: mobile, adaptive: !forceGL, v3: !!ctx.v3,
          onDegrade: function () { scene = null; root.classList.remove("g6-v2-gl"); show2D(); }
        });
        root.classList.add("g6-v2-gl");
        scene.start();
        gsap.to(scene.state, { intro: 0, duration: 3.2, ease: "power3.out" });
      }).catch(function (err) { console.warn("[landing-gta6-v2] 3D desativado:", err.message); show2D(); });
    } else { show2D(); }

    gctx = gsap.context(function () {
      var hero = root.querySelector(".g6-hero");

      // Hero: título em máscara + brilho; avanço de câmara com o scroll
      var title = root.querySelector("[data-g6-title]");
      gsap.fromTo(title, { clipPath: "inset(0 0 100% 0)", y: 70, scale: 1.12, filter: "blur(14px)" },
        { clipPath: "inset(0 0 -10% 0)", y: 0, scale: 1, filter: "blur(0px)", duration: 1.6, ease: "power4.out", delay: 0.5, clearProps: "clipPath,filter" });

      ScrollTrigger.create({
        trigger: hero, start: "top top", end: "bottom top", scrub: true,
        onUpdate: function (self) { if (scene) scene.state.prog = self.progress; }
      });
      gsap.to(root.querySelector(".g6-hero-inner"), { y: -70, opacity: 0.15, filter: "blur(6px)", ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom 30%", scrub: true } });
      gsap.to(root.querySelector(".g6-hero .g6-hero-media"), { scale: 1.14, ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } });
      gsap.to(fx, { opacity: 0, ease: "none",
        scrollTrigger: { trigger: hero, start: "40% top", end: "bottom top", scrub: true } });

      // Títulos com máscara (uma vez, ao entrar)
      root.querySelectorAll(".g6-h2").forEach(function (h) {
        gsap.fromTo(h, { clipPath: "inset(0 0 100% 0)", filter: "blur(10px)" },
          { clipPath: "inset(0 0 -12% 0)", filter: "blur(0px)", duration: 1.1, ease: "power4.out", clearProps: "clipPath,filter",
            scrollTrigger: { trigger: h, start: "top 86%", once: true } });
      });

      // Grelhas de cards: entrada em profundidade sincronizada com o scroll (contentores, não os cards: o tilt fica livre)
      root.querySelectorAll(".g6-stats, .g6-plat-grid, .g6-steps").forEach(function (grid) {
        gsap.fromTo(grid, { rotationX: 20, z: -140, transformOrigin: "50% 100%", transformPerspective: 900 },
          { rotationX: 0, z: 0, ease: "none", scrollTrigger: { trigger: grid, start: "top 98%", end: "top 55%", scrub: 0.6 } });
      });

      // Galeria: zoom cinematográfico + revelação
      var stage = root.querySelector(".g6-stage");
      if (stage && !stage.parentNode.classList.contains("g6-stage-zoom")) {
        var wrap = document.createElement("div");
        wrap.className = "g6-stage-zoom";
        stage.parentNode.insertBefore(wrap, stage);
        wrap.appendChild(stage);
        cleanup.push(function () { if (wrap.parentNode) { wrap.parentNode.insertBefore(stage, wrap); wrap.parentNode.removeChild(wrap); } });
        gsap.fromTo(wrap, { scale: 0.86, rotationX: 8, transformPerspective: 1100 },
          { scale: 1, rotationX: 0, ease: "none", scrollTrigger: { trigger: wrap, start: "top 95%", end: "top 40%", scrub: 0.6 } });
        bindGalleryDepth(stage, fine, cleanup);
      }

      // Cartão de produto 3D na área de compra
      buildBuyCard(root, gsap, fine, cleanup);

      // Luz dinâmica nos botões
      if (fine) {
        root.querySelectorAll(".g6-btn").forEach(function (b) {
          var mv = function (e) { var r = b.getBoundingClientRect(); b.style.setProperty("--lx", (e.clientX - r.left) + "px"); b.style.setProperty("--ly", (e.clientY - r.top) + "px"); };
          b.addEventListener("pointermove", mv);
          cleanup.push(function () { b.removeEventListener("pointermove", mv); });
        });
      }
    }, root);

    // pausa animações CSS das secções fora do ecrã
    var idleIO = null;
    if ("IntersectionObserver" in window) {
      idleIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { e.target.classList.toggle("g6-idle", !e.isIntersecting); });
      }, { rootMargin: "80px" });
      root.querySelectorAll(".g6-hero, .g6-pricebox, .g6-final").forEach(function (s) { idleIO.observe(s); });
    }

    function dispose() {
      if (idleIO) idleIO.disconnect();
      if (gctx) gctx.revert();
      cleanup.forEach(function (fn) { try { fn(); } catch (e) { /* ignora */ } });
      cleanup = [];
      if (scene) { scene.dispose(); scene = null; }
      root.classList.remove("g6-v2", "g6-v2-gl", "g6-v2-2d");
    }
    window.addEventListener("pagehide", dispose, { once: true });
    root.__g6v2 = { dispose: dispose, get scene() { return scene; }, ready: glReady };
    return root.__g6v2;
  }

  function bindGalleryDepth(stage, fine, cleanup) {
    if (fine) {
      var mv = function (e) {
        var r = stage.getBoundingClientRect();
        stage.style.setProperty("--px", (((e.clientX - r.left) / r.width) - 0.5).toFixed(3));
        stage.style.setProperty("--py", (((e.clientY - r.top) / r.height) - 0.5).toFixed(3));
      };
      stage.addEventListener("pointermove", mv);
      cleanup.push(function () { stage.removeEventListener("pointermove", mv); });
    }
    // swipe (touch/caneta/rato)
    var x0 = null;
    var down = function (e) { x0 = e.clientX; };
    var up = function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) { var b = stage.querySelector(dx < 0 ? "[data-g6-next]" : "[data-g6-prev]"); if (b) b.click(); }
    };
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", function () { x0 = null; });
    cleanup.push(function () { stage.removeEventListener("pointerdown", down); stage.removeEventListener("pointerup", up); });
  }

  function buildBuyCard(root, gsap, fine, cleanup) {
    var box = root.querySelector(".g6-pricebox .g6-wrap");
    var price = root.querySelector(".g6-pricebox .g6-bigprice");
    if (!box || !price || root.querySelector(".g6-buycard")) return;
    var holder = document.createElement("div");
    holder.className = "g6-buycard-float";
    holder.innerHTML =
      '<div class="g6-buycard" role="img" aria-label="Arte de Grand Theft Auto VI, edição digital para PlayStation 5">' +
        '<img src="assets/gta-vi-landscape-960.webp" alt="" loading="lazy" decoding="async" width="960" height="540">' +
        '<span class="g6-chip">PlayStation 5 · Digital</span>' +
        '<span class="g6-shine" aria-hidden="true"></span>' +
      '</div>';
    box.insertBefore(holder, price);
    var card = holder.firstChild;
    cleanup.push(function () { if (holder.parentNode) holder.parentNode.removeChild(holder); });
    gsap.from(holder, { y: 60, scale: 0.9, opacity: 0, filter: "blur(10px)", duration: 1.1, ease: "power3.out", clearProps: "filter,opacity,transform",
      scrollTrigger: { trigger: holder, start: "top 88%", once: true } });
    if (!fine) return;
    var mv = function (e) {
      var r = card.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.setProperty("--ry", ((x - 0.5) * 16).toFixed(2) + "deg");
      card.style.setProperty("--rx", ((0.5 - y) * 12).toFixed(2) + "deg");
      card.style.setProperty("--sx", (x * 100).toFixed(1) + "%");
      card.style.setProperty("--sy", (y * 100).toFixed(1) + "%");
    };
    var lv = function () { card.style.setProperty("--ry", "0deg"); card.style.setProperty("--rx", "0deg"); };
    card.addEventListener("pointermove", mv); card.addEventListener("pointerleave", lv);
    cleanup.push(function () { card.removeEventListener("pointermove", mv); card.removeEventListener("pointerleave", lv); });
  }

  window.GalaxyLandingGta6V2 = { enhance: enhance };
})();
