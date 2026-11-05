/*
 * Landing temporária GTA VI. Só monta para o produto configurado em
 * landing-gta6.config.js. Não altera carrinho, checkout nem preços: os CTAs
 * delegam nos botões clássicos (.buy-button / .cart-add-button), que continuam
 * no DOM (escondidos por CSS) e chamam criar-checkout, onde o preço é validado.
 */
(function () {
  "use strict";

  var cfg = window.GALAXY_LANDING_GTA6 || { enabled: false };
  var VENDOR = ["vendor/gsap.min.js?v=3.12.5", "vendor/ScrollTrigger.min.js?v=3.12.5", "vendor/lenis.min.js?v=1.1.13"];

  var IMG = {
    hero: { src: "assets/gta-vi-visual-beach-5k.webp", srcset: "" },
    gallery: [
      { src: "assets/gta-vi-visual-beach-5k.webp", alt: "Praia de Vice City ao entardecer" },
      { src: "assets/gta-vi-visual-city-sunset.jpg", alt: "Cidade de Vice City com pôr do sol" },
      { src: "assets/gta-vi-visual-skyline.jpg", alt: "Skyline de Vice City" },
      { src: "assets/gta-vi-original.webp", alt: "Arte promocional de Grand Theft Auto VI" },
      { src: "assets/gta-vi-visual-night-hdr.webp", alt: "Vice City de noite" }
    ]
  };

  function params() { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(""); } }

  function isEnabledFor(product) {
    if (!cfg.enabled || !product || product.id !== cfg.productId) return false;
    return params().get("landing") !== "0";
  }

  // 5 = V5 (polimento); 4 = V4 (direção de arte); 3 = V3 (Vice City); 2 = V2 (3D + scroll cinematográfico); 1 = V1. URL: ?landing=v1 | v2 | v3
  function landingVersion() {
    var q = params().get("landing");
    if (q === "v1") return 1;
    if (q === "v2") return 2;
    if (q === "v3") return 3;
    if (q === "v4") return 4;
    if (q === "v5") return 5;
    var n = Number(cfg.version);
    return n >= 5 ? 5 : n >= 4 ? 4 : n >= 3 ? 3 : n >= 2 ? 2 : 1;
  }

  function formatEUR(value) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) n = cfg.fallbackPriceEUR;
    return n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
  }

  function formatDate(value) {
    var d = new Date(value + "T12:00:00");
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = resolve; s.onerror = function () { reject(new Error("falha ao carregar " + src)); };
      document.head.appendChild(s);
    });
  }

  function isLiteDevice() {
    if (params().get("landing") === "lite") return true;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    var nav = navigator;
    if (nav.connection && (nav.connection.saveData || /(^|-)2g$/.test(nav.connection.effectiveType || ""))) return true;
    if (nav.deviceMemory && nav.deviceMemory <= 2) return true;
    if (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) return true;
    return false;
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function template(product) {
    var price = formatEUR(product.precoVendaEUR);
    var release = product.released ? formatDate(product.released) : "";
    var confirmed = cfg.offerConfirmed !== false;
    var primaryLabel = confirmed ? "Ver disponibilidade" : "Consultar disponibilidade";
    var releaseLine = release ? "Lançamento previsto: " + release : "Data de lançamento a confirmar";
    var gallery = IMG.gallery.map(function (g, i) {
      return '<img src="' + g.src + '" alt="' + g.alt + '" ' + (i === 0 ? 'class="on" fetchpriority="low"' : 'loading="lazy"') + ' decoding="async" width="1600" height="900">';
    }).join("");
    var thumbs = IMG.gallery.map(function (g, i) {
      return '<button class="g6-thumb" type="button" data-g6-thumb="' + i + '" aria-label="Ver imagem ' + (i + 1) + ' de ' + IMG.gallery.length + '"' + (i === 0 ? ' aria-current="true"' : "") + '><img src="' + g.src + '" alt="" loading="lazy" decoding="async" width="320" height="180"></button>';
    }).join("");
    var buyBlock = confirmed
      ? '<button class="g6-btn g6-btn-primary" type="button" data-g6-buy>Reservar agora</button><button class="g6-btn g6-btn-ghost" type="button" data-g6-cart>Adicionar ao carrinho</button>'
      : '<a class="g6-btn g6-btn-primary" href="#g6-faq" data-g6-anchor>Consultar disponibilidade</a>';
    var finalBlock = confirmed
      ? '<button class="g6-btn g6-btn-primary" type="button" data-g6-buy>Reservar agora</button><button class="g6-btn g6-btn-ghost" type="button" data-g6-cart>Adicionar ao carrinho</button>'
      : '<a class="g6-btn g6-btn-primary" href="#g6-faq" data-g6-anchor>Consultar disponibilidade</a>';

    return '' +
      '<div class="g6-progress" aria-hidden="true"><span></span></div>' +

      '<section class="g6-hero" id="g6-top" aria-labelledby="g6-title">' +
        '<div class="g6-hero-media" data-g6-parallax aria-hidden="true"><img src="' + IMG.hero.src + '" alt="" fetchpriority="high" decoding="async" width="1800" height="1125"></div>' +
        '<div class="g6-hero-inner">' +
          '<span class="g6-tag"><i></i>Pré-lançamento digital · PS5</span>' +
          '<h1 class="g6-title" id="g6-title" data-g6-title>GTA VI</h1>' +
          '<p class="g6-sub" data-g6-words>Vice City está à tua espera.</p>' +
          '<div class="g6-hero-row">' +
            '<div class="g6-price" data-g6-fade>' + price + '<small>' + releaseLine + '</small></div>' +
            '<div class="g6-actions" data-g6-fade>' +
              '<a class="g6-btn g6-btn-primary" href="#g6-preco" data-g6-anchor>' + primaryLabel + '</a>' +
              '<a class="g6-btn g6-btn-ghost" href="#g6-vice" data-g6-anchor>Explorar o jogo</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<span class="g6-scroll" aria-hidden="true"></span>' +
      '</section>' +

      '<section class="g6-section g6-vice" id="g6-vice" aria-labelledby="g6-vice-h">' +
        '<div class="g6-sun" aria-hidden="true" data-g6-parallax-slow></div>' +
        '<div class="g6-wrap g6-vice-grid">' +
          '<div data-g6-reveal>' +
            '<p class="g6-eyebrow">Leonida · Vice City</p>' +
            '<h2 class="g6-h2" id="g6-vice-h">Bem-vindo a Vice City</h2>' +
            '<p class="g6-lead">Neon a refletir no asfalto molhado, praias ao fim da tarde e uma cidade que nunca dorme. Grand Theft Auto VI regressa a Vice City, no estado de Leonida, num mundo aberto de ação e aventura.</p>' +
          '</div>' +
          '<div class="g6-stats">' +
            '<div class="g6-card" data-g6-tilt data-g6-reveal><h3>Mundo aberto</h3><p>Cidade, pântanos e litoral para explorar.</p></div>' +
            '<div class="g6-card" data-g6-tilt data-g6-reveal><h3>Ação e aventura</h3><p>Género confirmado na ficha do produto.</p></div>' +
            '<div class="g6-card" data-g6-tilt data-g6-reveal><h3>Digital</h3><p>Sem caixa, sem espera de envio.</p></div>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="g6-section g6-gallery" id="g6-galeria" aria-labelledby="g6-gal-h">' +
        '<div class="g6-wrap">' +
          '<p class="g6-eyebrow" data-g6-reveal>Galeria</p>' +
          '<h2 class="g6-h2" id="g6-gal-h" data-g6-reveal>Vê Vice City de perto</h2>' +
          '<div class="g6-stage" data-g6-reveal role="group" aria-roledescription="carrossel" aria-label="Galeria de imagens">' +
            gallery +
            '<button class="g6-nav-btn g6-prev" type="button" data-g6-prev aria-label="Imagem anterior">&#8249;</button>' +
            '<button class="g6-nav-btn g6-next" type="button" data-g6-next aria-label="Imagem seguinte">&#8250;</button>' +
          '</div>' +
          '<div class="g6-thumbs">' + thumbs + '</div>' +
        '</div>' +
      '</section>' +

      '<section class="g6-section g6-platforms" id="g6-plataformas" aria-labelledby="g6-plat-h">' +
        '<div class="g6-wrap">' +
          '<p class="g6-eyebrow" data-g6-reveal>Plataformas</p>' +
          '<h2 class="g6-h2" id="g6-plat-h" data-g6-reveal>Escolhe a tua plataforma</h2>' +
          '<div class="g6-plat-grid">' +
            '<div class="g6-card g6-plat" data-g6-tilt data-g6-reveal><strong>PlayStation 5</strong><p>Esta oferta de ' + price + ' é para a versão PlayStation 5.</p><span class="g6-badge ok">Oferta nesta página</span></div>' +
            '<div class="g6-card g6-plat" data-g6-tilt data-g6-reveal><strong>Xbox Series X|S</strong><p>Tem página e preço próprios na GalaxyGame.</p><a class="g6-badge alt" href="produto.html?id=gta-vi-xbox-series">Ver versão Xbox</a></div>' +
          '</div>' +
          '<p class="g6-note" data-g6-reveal>Compatibilidade conforme a ficha do produto. Não indicamos compatibilidade com outras consolas sem confirmação oficial.</p>' +
        '</div>' +
      '</section>' +

      '<section class="g6-section g6-exp" id="g6-experiencia" aria-labelledby="g6-exp-h">' +
        '<div class="g6-wrap">' +
          '<p class="g6-eyebrow" data-g6-reveal>GalaxyGame</p>' +
          '<h2 class="g6-h2" id="g6-exp-h" data-g6-reveal>A tua experiência GalaxyGame</h2>' +
          '<div class="g6-steps">' +
            '<div class="g6-card g6-step" data-g6-tilt data-g6-reveal><h3>Reservas</h3><p>Pagamento seguro em euros, com os métodos indicados no checkout.</p></div>' +
            '<div class="g6-card g6-step" data-g6-tilt data-g6-reveal><h3>Recebes o acesso</h3><p>Depois da confirmação do pagamento, o acesso fica na tua conta GalaxyGame (Minha Conta &gt; Meus Pedidos) e segue por email.</p></div>' +
            '<div class="g6-card g6-step" data-g6-tilt data-g6-reveal><h3>Ativas e jogas</h3><p>As instruções de ativação seguem com o pedido. Vê os detalhes em <a href="como-funciona.html">Como funciona</a>.</p></div>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="g6-section g6-pricebox" id="g6-preco" aria-labelledby="g6-preco-h">' +
        '<div class="g6-wrap">' +
          '<p class="g6-eyebrow" data-g6-reveal>Oferta</p>' +
          '<h2 class="g6-h2" id="g6-preco-h" data-g6-reveal>Uma oferta GalaxyGame para ficares de olho.</h2>' +
          '<div class="g6-bigprice" data-g6-reveal data-g6-price>' + price + '</div>' +
          '<p class="g6-lead" data-g6-reveal>Grand Theft Auto VI · PlayStation 5 · edição digital. ' + releaseLine + '.</p>' +
          '<div class="g6-actions" data-g6-reveal>' + buyBlock + '</div>' +
        '</div>' +
      '</section>' +

      '<section class="g6-section g6-faq" id="g6-faq" aria-labelledby="g6-faq-h">' +
        '<div class="g6-wrap">' +
          '<p class="g6-eyebrow" data-g6-reveal>Perguntas frequentes</p>' +
          '<h2 class="g6-h2" id="g6-faq-h" data-g6-reveal>Antes de reservares</h2>' +
          '<div data-g6-reveal>' +
            '<details><summary>Que plataformas estão incluídas?</summary><p>Esta página é a versão PlayStation 5. A versão Xbox Series X|S tem página própria.</p></details>' +
            '<details><summary>O jogo é digital?</summary><p>Sim. É uma edição digital, sem produto físico nem envio.</p></details>' +
            '<details><summary>Quando recebo o acesso?</summary><p>Depois da confirmação do pagamento, o acesso fica disponível na tua conta GalaxyGame e é enviado por email. Como o jogo está em pré-lançamento, consulta as condições da reserva no checkout e em Como funciona.</p></details>' +
            '<details><summary>Como ativo?</summary><p>As instruções de ativação seguem com o teu pedido, por email e em Minha Conta &gt; Meus Pedidos.</p></details>' +
            '<details><summary>Há suporte?</summary><p>Sim. Podes falar connosco pelo chat do site ou consultar a página Como funciona.</p></details>' +
            '<details><summary>Está disponível?</summary><p>' + (confirmed ? 'A reserva está aberta nesta página. A disponibilidade final depende do lançamento do jogo.' : 'A disponibilidade ainda não está confirmada. Fala connosco pelo chat para saberes mais.') + '</p></details>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="g6-section g6-final" aria-labelledby="g6-final-h">' +
        '<div class="g6-hero-media" data-g6-parallax aria-hidden="true"><img src="assets/gta-vi-visual-city-sunset.jpg" alt="" loading="lazy" decoding="async" width="1600" height="900"></div>' +
        '<div class="g6-wrap">' +
          '<h2 class="g6-h2" id="g6-final-h" data-g6-reveal>Vice City está à tua espera.</h2>' +
          '<div class="g6-bigprice" data-g6-reveal style="font-size:clamp(2.6rem,10vw,6rem)">' + price + '</div>' +
          '<div class="g6-actions" data-g6-reveal>' + finalBlock + '</div>' +
        '</div>' +
      '</section>';
  }

  function splitWords(el) {
    var text = el.textContent;
    el.setAttribute("aria-label", text);
    el.textContent = "";
    var out = [];
    text.split(" ").forEach(function (word, i, arr) {
      var span = document.createElement("span");
      span.className = "w";
      span.setAttribute("aria-hidden", "true");
      span.textContent = word;
      el.appendChild(span);
      out.push(span);
      if (i < arr.length - 1) el.appendChild(document.createTextNode(" "));
    });
    return out;
  }

  function bindActions(root) {
    root.querySelectorAll("[data-g6-buy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var classic = document.querySelector(".buy-button");
        if (classic) classic.click();
      });
    });
    root.querySelectorAll("[data-g6-cart]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var classic = document.querySelector(".cart-add-button");
        if (classic) classic.click();
      });
    });
  }

  function bindGallery(root, lite) {
    var imgs = root.querySelectorAll(".g6-stage img");
    var thumbs = root.querySelectorAll("[data-g6-thumb]");
    var idx = 0, timer = null;
    function show(i) {
      idx = (i + imgs.length) % imgs.length;
      imgs.forEach(function (im, n) { im.classList.toggle("on", n === idx); });
      thumbs.forEach(function (t, n) { if (n === idx) t.setAttribute("aria-current", "true"); else t.removeAttribute("aria-current"); });
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() { if (lite || timer) return; timer = setInterval(function () { show(idx + 1); }, 5500); }
    root.querySelector("[data-g6-prev]").addEventListener("click", function () { stop(); show(idx - 1); });
    root.querySelector("[data-g6-next]").addEventListener("click", function () { stop(); show(idx + 1); });
    thumbs.forEach(function (t) { t.addEventListener("click", function () { stop(); show(Number(t.getAttribute("data-g6-thumb"))); }); });
    var stage = root.querySelector(".g6-stage");
    stage.setAttribute("tabindex", "0");
    stage.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { stop(); show(idx - 1); }
      if (e.key === "ArrowRight") { stop(); show(idx + 1); }
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) { entries[0].isIntersecting ? start() : stop(); }, { threshold: 0.4 }).observe(stage);
    }
  }

  function bindPointerFx(root) {
    if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    root.querySelectorAll(".g6-btn").forEach(function (btn) {
      btn.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect();
        btn.style.setProperty("--mx", ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + "px");
        btn.style.setProperty("--my", ((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1) + "px");
      });
      btn.addEventListener("pointerleave", function () { btn.style.setProperty("--mx", "0px"); btn.style.setProperty("--my", "0px"); });
    });
    root.querySelectorAll("[data-g6-tilt]").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(800px) rotateX(" + (-y * 7).toFixed(2) + "deg) rotateY(" + (x * 9).toFixed(2) + "deg) translateZ(0)";
      });
      card.addEventListener("pointerleave", function () { card.style.transform = ""; });
    });
  }

  function animate(root, lite) {
    var gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
    gsap.registerPlugin(ScrollTrigger);
    var lenis = null;

    if (!lite && window.Lenis) {
      lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    }

    // Âncoras (com ou sem Lenis)
    root.querySelectorAll("[data-g6-anchor]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        var target = root.querySelector(a.getAttribute("href"));
        if (!target) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(target, { offset: -8 });
        else target.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      });
    });

    // Barra de progresso
    gsap.to(root.querySelector(".g6-progress span"), {
      scaleX: 1, ease: "none",
      scrollTrigger: { trigger: document.documentElement, start: "top top", end: "bottom bottom", scrub: 0.2 }
    });

    // Hero: entrada cinematográfica
    var words = splitWords(root.querySelector("[data-g6-words]"));
    var v2 = landingVersion() >= 2 && !lite;
    var tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.from(root.querySelector(".g6-hero-media img"), { scale: 1.18, opacity: 0, duration: 1.8 }, 0)
      .from(root.querySelector(".g6-tag"), { y: 20, opacity: 0, duration: 0.7 }, 0.3);
    // na V2 o título é animado por landing-gta6-v2.js (máscara + blur)
    if (!v2) tl.from(root.querySelector("[data-g6-title]"), { y: 60, opacity: 0, scale: 0.94, letterSpacing: "0.08em", duration: 1.3 }, 0.45);
    tl.from(words, { y: 28, opacity: 0, duration: 0.7, stagger: 0.12 }, 1.0)
      .from(root.querySelectorAll(".g6-hero [data-g6-fade]"), { y: 24, opacity: 0, duration: 0.7, stagger: 0.12 }, 1.4);

    if (!lite) {
      root.querySelectorAll("[data-g6-parallax]").forEach(function (el) {
        gsap.to(el, { yPercent: 8, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true } });
      });
      root.querySelectorAll("[data-g6-parallax-slow]").forEach(function (el) {
        gsap.to(el, { y: -90, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true } });
      });
    }

    // Revelação por secção
    ScrollTrigger.batch(root.querySelectorAll("[data-g6-reveal]"), {
      start: "top 88%", once: true,
      onEnter: function (batch) {
        gsap.fromTo(batch, { y: lite ? 0 : 36, opacity: 0 }, { y: 0, opacity: 1, duration: lite ? 0.3 : 0.9, ease: "power3.out", stagger: 0.12, overwrite: "auto", clearProps: "transform,opacity" });
      }
    });
    // evita flash: oculta o que ainda não entrou (só depois de o gsap estar pronto)
    gsap.set(root.querySelectorAll("[data-g6-reveal]"), { opacity: 0 });

    window.addEventListener("load", function () { ScrollTrigger.refresh(); }, { once: true });
    return lenis;
  }

  function mount(product) {
    if (!isEnabledFor(product)) return;
    var main = document.querySelector("main");
    if (!main || document.querySelector(".gta6-landing")) return;

    var lite = isLiteDevice();
    var root = document.createElement("div");
    root.className = "gta6-landing" + (lite ? " g6-lite" : "");
    root.innerHTML = template(product);
    main.insertBefore(root, main.firstChild);
    document.body.classList.add("landing-gta6-on");

    bindActions(root);
    bindGallery(root, lite);
    if (!lite) bindPointerFx(root);

    // prefers-reduced-motion: sem GSAP nem animações. O CSS global do site força transition-duration:1ms
    // e, em teste, o GSAP deixava o título em opacity 0; assim o conteúdo fica sempre visível e estático.
    if (reducedMotion()) return;

    var chain = Promise.resolve();
    VENDOR.forEach(function (src) {
      if (lite && /lenis/.test(src)) return;
      chain = chain.then(function () { return loadScript(src); });
    });
    chain.then(function () {
      var lenis = animate(root, lite);
      if (!lite && landingVersion() >= 2) {
        var ver = landingVersion();
        var ctx = { gsap: window.gsap, ScrollTrigger: window.ScrollTrigger, lenis: lenis, v3: ver >= 3 };
        return loadScript("landing-gta6-v2.js?v=20261105-20").then(function () {
          window.GalaxyLandingGta6V2.enhance(root, ctx);
          if (ver < 3) return null;
          return loadScript("landing-gta6-v3.js?v=20261105-20").then(function () {
            window.GalaxyLandingGta6V3.enhance(root, ctx);
            if (ver < 4) return null;
            return loadScript("landing-gta6-v4.js?v=20261105-20").then(function () {
              window.GalaxyLandingGta6V4.enhance(root, ctx);
              if (ver < 5) return null;
              return loadScript("landing-gta6-v5.js?v=20261105-20").then(function () { window.GalaxyLandingGta6V5.enhance(root, ctx); });
            });
          });
        });
      }
    }).catch(function (err) {
      // sem animações: conteúdo continua visível e funcional
      console.warn("[landing-gta6] animações desativadas:", err.message);
    });
  }

  window.GalaxyLandingGta6 = { mount: mount };
})();
