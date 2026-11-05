/*
 * Landing GTA VI — camada V4 (direção de arte).
 * Corre depois da V3 e só retoca: composição do hero, galeria, compra e microinterações.
 * Sem novas bibliotecas nem canvas. Tudo reversível em dispose().
 */
(function () {
  "use strict";

  function enhance(root, ctx) {
    var gsap = ctx.gsap, ScrollTrigger = ctx.ScrollTrigger;
    var cleanup = [], gctx;

    root.classList.add("g6-v4");
    var css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "landing-gta6-v4.css?v=20261105-20";
    document.head.appendChild(css);
    cleanup.push(function () { if (css.parentNode) css.parentNode.removeChild(css); });

    var hero = root.querySelector(".g6-hero");

    /* Barras de cinema que se retraem na abertura (entrada coordenada com o título) */
    var bars = document.createElement("div");
    bars.className = "g6-bars"; bars.setAttribute("aria-hidden", "true");
    bars.innerHTML = "<i></i><i></i>";
    hero.appendChild(bars);
    cleanup.push(function () { if (bars.parentNode) bars.parentNode.removeChild(bars); });

    /* Galeria: contador, pré-carregamento (evita transições "partidas" por imagem a meio de carregar) */
    var stage = root.querySelector(".g6-stage");
    var imgs = stage ? Array.prototype.slice.call(stage.querySelectorAll("img")) : [];
    var count = null, mo = null, io = null;
    if (stage && imgs.length) {
      count = document.createElement("div");
      count.className = "g6-count"; count.setAttribute("aria-hidden", "true");
      stage.appendChild(count);
      cleanup.push(function () { if (count.parentNode) count.parentNode.removeChild(count); });
      var upd = function () {
        var n = Math.max(0, imgs.findIndex(function (i) { return i.classList.contains("on"); })) + 1;
        count.innerHTML = "<b>0" + n + "</b> / 0" + imgs.length;
      };
      upd();
      mo = new MutationObserver(upd);
      imgs.forEach(function (i) { mo.observe(i, { attributes: true, attributeFilter: ["class"] }); });
      if ("IntersectionObserver" in window) {
        io = new IntersectionObserver(function (en) {
          if (!en[0].isIntersecting) return;
          imgs.forEach(function (i) { i.loading = "eager"; if (i.decode) i.decode().catch(function () {}); });
          io.disconnect();
        }, { rootMargin: "800px 0px" });
        io.observe(stage);
      }
    }

    gctx = gsap.context(function () {
      var tl = gsap.timeline({ defaults: { ease: "power4.inOut" } });
      tl.fromTo(bars.children, { scaleY: 1 }, { scaleY: 0, duration: 1.5, stagger: 0, delay: 0.1 }, 0);
    }, root);

    var rf = function () { ScrollTrigger.refresh(); };
    var t1 = setTimeout(rf, 700), t2 = setTimeout(rf, 2200);
    cleanup.push(function () { clearTimeout(t1); clearTimeout(t2); });

    function dispose() {
      if (mo) mo.disconnect();
      if (io) io.disconnect();
      if (gctx) gctx.revert();
      cleanup.forEach(function (fn) { try { fn(); } catch (e) { /* ignora */ } });
      cleanup = [];
      root.classList.remove("g6-v4");
    }
    window.addEventListener("pagehide", dispose, { once: true });
    root.__g6v4 = { dispose: dispose };
    return root.__g6v4;
  }

  window.GalaxyLandingGta6V4 = { enhance: enhance };
})();
