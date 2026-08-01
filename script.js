const games = {
  trending: [
    { title: "Grand Theft Auto VI - Midia Digital PlayStation 5", price: "57.99 €", discount: "-28%", platforms: ["PlayStation 5"], art: "url('assets/gta-vi-landscape-hq.webp')", video: "https://www.youtube.com/embed/QdBZY2fkU-0?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=QdBZY2fkU-0" },
    { title: "Grand Theft Auto VI - Midia Digital Xbox Series X|S", oldPrice: "74,99 €", price: "69,99 €", discount: "-7%", platforms: ["Xbox Series"], href: "produto-xbox.html", art: "url('assets/gta-vi-landscape-hq.webp')", video: "https://www.youtube.com/embed/QdBZY2fkU-0?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=QdBZY2fkU-0" },
    { title: "Esports Manager 2026 - Edicao Digital", price: "11.99 €", discount: "-30%", platforms: ["PlayStation 5", "Xbox One", "Xbox Series"], art: "linear-gradient(135deg, #5c22d6, #111 55%, #5bf0ff)" },
    { title: "Football Manager 26 - Consola", price: "29.99 €", discount: "-18%", platforms: ["PlayStation 5", "Xbox Series"], art: "linear-gradient(135deg, #fb4b92, #232323 45%, #71ff8e)" },
    { title: "Maranhao 26 - Codigo Europeu", price: "25.99 €", discount: "-22%", platforms: ["PlayStation 4", "PlayStation 5"], art: "linear-gradient(135deg, #e4dc56, #1a8056 52%, #103238)" },
    { title: "FC 26 Ultimate Edition - Digital", price: "22.99 €", discount: "-40%", platforms: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series"], art: "linear-gradient(135deg, #7745ff, #e8ebff 50%, #ff8930)" },
    { title: "Slopecrash Reborn - Edicao Consola", price: "15.99 €", discount: "-10%", platforms: ["PlayStation 5", "Xbox Series"], art: "linear-gradient(135deg, #67dff7, #e8f0c0 42%, #64be73)" },
    { title: "Night Path - Aventura Digital", price: "22.99 €", discount: "-35%", platforms: ["PlayStation 4", "PlayStation 5"], art: "linear-gradient(135deg, #100f33, #8148d8 50%, #141414)" },
    { title: "Wave Save - Codigo Instantaneo", price: "18.79 €", discount: "-28%", platforms: ["PlayStation 4", "Xbox One"], art: "linear-gradient(135deg, #f68242, #58c9d8 50%, #1b363f)" },
    { title: "Forza Horizon Festival - Xbox One / Xbox Series Digital", price: "13.59 €", discount: "-55%", platforms: ["Xbox One", "Xbox Series"], art: "linear-gradient(135deg, #ffffff, #d92525 45%, #171717)" },
    { title: "Outer Kingdoms - Edicao Europeia", price: "18.49 €", discount: "-25%", platforms: ["PlayStation 5", "Xbox Series"], art: "linear-gradient(135deg, #49354d, #ff8945 48%, #151515)" }
  ],
  preorders: [
    { title: "Grand Theft Auto VI - Pre-lancamento Digital", price: "57.99 €", discount: "-28%", platforms: ["PlayStation 5"], art: "url('assets/gta-vi-landscape-hq.webp')", video: "https://www.youtube.com/embed/QdBZY2fkU-0?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=QdBZY2fkU-0" },
    { title: "Grand Theft Auto VI - Pre-lancamento Xbox Series X|S", oldPrice: "74,99 €", price: "69,99 €", discount: "-7%", platforms: ["Xbox Series"], href: "produto-xbox.html", art: "url('assets/gta-vi-landscape-hq.webp')", video: "https://www.youtube.com/embed/QdBZY2fkU-0?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=QdBZY2fkU-0" },
    { title: "Age of Pirates - Pre-venda Digital", price: "57.49 €", discount: "-12%", platforms: ["PlayStation 5", "Xbox Series"], art: "linear-gradient(135deg, #98d4ff, #394253 44%, #b87a39)" },
    { title: "Dream City - Lancamento PlayStation 5", price: "52.99 €", discount: "-15%", platforms: ["PlayStation 5"], art: "linear-gradient(135deg, #ff78d8, #3c295f 48%, #ffbd54)" },
    { title: "Dragon's Arc II - Edicao Consola", price: "58.99 €", discount: "-20%", platforms: ["PlayStation 5", "Xbox Series"], art: "linear-gradient(135deg, #2d251d, #e15427 50%, #111)" },
    { title: "Red Zone Day One - Codigo Europeu", price: "64.99 €", discount: "-8%", platforms: ["PlayStation 4", "PlayStation 5"], art: "linear-gradient(135deg, #150202, #d20000 54%, #111)" },
    { title: "Skate Fall - Pre-venda Digital", price: "54.49 €", discount: "-14%", platforms: ["PlayStation 5", "Xbox Series"], art: "linear-gradient(135deg, #d7eaff, #668498 44%, #222)" },
    { title: "Directive Dark - Xbox One / Xbox Series Digital", price: "51.99 €", discount: "-16%", platforms: ["Xbox One", "Xbox Series"], art: "linear-gradient(135deg, #3c120c, #ff5b22 50%, #090909)" }
  ],
  bestSellers: [
    { title: "Grand Theft Auto VI - PlayStation 5 Digital", price: "57.99 €", discount: "-28%", platforms: ["PlayStation 5"], art: "url('assets/gta-vi-landscape-hq.webp')", video: "https://www.youtube.com/embed/QdBZY2fkU-0?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=QdBZY2fkU-0" },
    { title: "Grand Theft Auto VI - Xbox Series X|S Digital", oldPrice: "74,99 €", price: "69,99 €", discount: "-7%", platforms: ["Xbox Series"], href: "produto-xbox.html", art: "url('assets/gta-vi-landscape-hq.webp')", video: "https://www.youtube.com/embed/QdBZY2fkU-0?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=QdBZY2fkU-0" },
    { title: "Esports Manager 2026 - Edicao Digital", price: "11.99 €", discount: "-30%", platforms: ["PlayStation 5", "Xbox One", "Xbox Series"], art: "linear-gradient(135deg, #5c22d6, #111 55%, #5bf0ff)" },
    { title: "PlayStation Store 20 € - Saldo Digital", price: "18.89 €", discount: "-6%", platforms: ["PlayStation 4", "PlayStation 5"], art: "linear-gradient(135deg, #3d77ff, #244a9a 58%, #f2f6ff)" },
    { title: "GTA Trilogy Definitive - Consola", price: "29.79 €", discount: "-45%", platforms: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series"], art: "linear-gradient(135deg, #e45940, #f6c54a 42%, #282828)" },
    { title: "PlayStation Wallet 20 € - Codigo Digital", price: "18.99 €", discount: "-5%", platforms: ["PlayStation 4", "PlayStation 5"], art: "linear-gradient(135deg, #1780ff, #045cd6 55%, #ffffff)" },
    { title: "Assassin's Creed Black Flag Remake - EU", price: "47.49 €", discount: "-62%", platforms: ["PlayStation 5", "Xbox Series"], art: "linear-gradient(135deg, #cdd8e1, #383a42 48%, #9b4c25)" },
    { title: "Minecraft Legends - Codigo Europeu", price: "16.99 €", discount: "-35%", platforms: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series"], art: "linear-gradient(135deg, #61b25d, #9cd8ff 45%, #855c34)" },
    { title: "Football Manager 26 - Consola", price: "29.99 €", discount: "-18%", platforms: ["PlayStation 5", "Xbox Series"], art: "linear-gradient(135deg, #fb4b92, #232323 45%, #71ff8e)" },
    { title: "Craft Valley Legends - Edicao Digital", price: "12.89 €", discount: "-50%", platforms: ["PlayStation 4", "Xbox One"], art: "linear-gradient(135deg, #70c85b, #b2ddff 52%, #5f3e20)" },
    { title: "Roblox 1000 Credits - Xbox One / Xbox Series Digital", price: "8.49 €", discount: "-10%", platforms: ["Xbox One", "Xbox Series"], art: "linear-gradient(135deg, #727272, #d8d8d8 45%, #202020)" }
  ],
  indies: [
    { title: "Night Path - Aventura Digital", price: "22.99 €", discount: "-35%", platforms: ["PlayStation 4", "PlayStation 5"], art: "linear-gradient(135deg, #100f33, #8148d8 50%, #141414)" },
    { title: "Esports Manager 2026 - Edicao Digital", price: "11.99 €", discount: "-30%", platforms: ["PlayStation 5", "Xbox One", "Xbox Series"], art: "linear-gradient(135deg, #5c22d6, #111 55%, #5bf0ff)" },
    { title: "Slopecrash Reborn - Edicao Consola", price: "15.99 €", discount: "-10%", platforms: ["PlayStation 5", "Xbox Series"], art: "linear-gradient(135deg, #67dff7, #e8f0c0 42%, #64be73)" },
    { title: "Far West Run - Codigo Digital", price: "13.49 €", discount: "-24%", platforms: ["PlayStation 4", "Xbox One"], art: "linear-gradient(135deg, #f4c365, #a9501f 52%, #1d1d1d)" }
  ]
};

const gtaCatalogArt = {
  "Grand Theft Auto VI - Midia Digital PlayStation 5": "url('assets/gta-vi-landscape-hq.webp')",
  "Grand Theft Auto VI - Midia Digital Xbox Series X|S": "url('assets/gta-vi-original.webp')",
  "Grand Theft Auto VI - Pre-lancamento Digital": "url('assets/gta-vi-visual-beach-5k.webp')",
  "Grand Theft Auto VI - Pre-lancamento Xbox Series X|S": "url('assets/gta-vi-visual-city-sunset.jpg')",
  "Grand Theft Auto VI - PlayStation 5 Digital": "url('assets/gta-vi-visual-skyline.jpg')",
  "Grand Theft Auto VI - Xbox Series X|S Digital": "url('assets/gta-vi-visual-night-hdr.webp')"
};

Object.values(games).flat().forEach((game) => {
  if (gtaCatalogArt[game.title]) {
    game.art = gtaCatalogArt[game.title];
  }
});

let selectedPlatform = "PlayStation 5";
let cartCount = 0;
let revealObserver;
let toastTimer;

const progressBar = document.createElement("div");
progressBar.className = "scroll-progress";
document.body.prepend(progressBar);

const toast = document.createElement("div");
toast.className = "toast";
document.body.append(toast);

function createGameCard(game) {
  const hasVideo = Boolean(game.video);
  const coverTitle = hasVideo ? "" : `<span class="cover-title">${game.title}</span>`;
  const price = game.oldPrice
    ? `<span class="game-price"><s>${game.oldPrice}</s><strong>${game.price}</strong></span>`
    : `<span class="game-price"><strong>${game.price}</strong></span>`;
  const videoFrame = hasVideo
    ? `<iframe class="cover-video" data-video-src="${game.video}" title="${game.title} trailer" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
    : "";
  const productHref = productHrefForGame(game);
  const platformBadge = platformBadgeForGame(game);

  return `
    <a class="game-card${hasVideo ? " has-video" : ""}" href="${productHref}" data-platforms="${game.platforms.join(",")}">
      <div class="cover" style="--art: ${game.art}">
        ${videoFrame}
        <span class="tag">${game.discount}</span>
        ${platformBadge}
        ${coverTitle}
      </div>
      <div class="game-info">
        <h3 title="${game.title}">${game.title}</h3>
        ${price}
        <div class="platforms">${game.platforms.map((platform) => `<span>${platform === "Xbox Series" ? "Xbox Series X|S" : platform}</span>`).join("")}</div>
      </div>
    </a>
  `;
}

function platformBadgeForGame(game) {
  const platform = String(game.platforms?.[0] || game.title || "").toLowerCase();
  if (platform.includes("xbox")) {
    return `<span class="platform-logo-badge xbox" aria-label="Xbox"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5.4 5.3c-2.2.2-4 1.2-5.4 2.8-1.4-1.6-3.2-2.6-5.4-2.8A8 8 0 0 1 12 4c2.1 0 4 .8 5.4 3.3ZM4.5 12c0-1 .2-1.9.5-2.7 1.9.6 3.5 1.6 4.8 3L6.1 17A7.5 7.5 0 0 1 4.5 12Zm3.2 6.3 4.3-4.5 4.3 4.5a7.4 7.4 0 0 1-8.6 0Zm10.2-1.3-3.7-4.7c1.3-1.4 2.9-2.4 4.8-3 .3.8.5 1.7.5 2.7 0 1.9-.6 3.6-1.6 5Z"/></svg></span>`;
  }
  return `<span class="platform-logo-badge playstation" aria-label="PlayStation"><span aria-hidden="true">PS</span></span>`;
}

function productHrefForGame(game) {
  if (/grand theft auto vi/i.test(game.title) && /xbox series/i.test(game.title)) {
    return "produto.html?id=gta-vi-xbox-series";
  }
  if (/grand theft auto vi/i.test(game.title)) {
    return "produto.html?id=gta-vi-ps5";
  }
  return game.href && game.href !== "produto-xbox.html" ? game.href : "produto.html";
}

function renderGrid(name) {
  const grid = document.querySelector(`[data-game-grid="${name}"]`);
  if (!grid) return;

  const visibleGames = games[name].filter((game) => {
    return selectedPlatform === "all" || game.platforms.includes(selectedPlatform);
  });

  grid.innerHTML = visibleGames.map(createGameCard).join("");
  animateFreshCards(grid);
}

function renderAll() {
  Object.keys(games).forEach(renderGrid);
  observeRevealTargets();
}

function animateFreshCards(grid) {
  const cards = grid.querySelectorAll(".game-card");

  cards.forEach((card, index) => {
    card.style.transitionDelay = `${Math.min(index * 45, 240)}ms`;
    requestAnimationFrame(() => card.classList.add("revealed"));
  });
}

function observeRevealTargets() {
  if (!revealObserver) return;

  const targets = document.querySelectorAll(
    ".trust-band article, .review-grid article, .news-section article, .cat, .feature-strip, .testimonial-band > *, .wide-promo > *, .app-band > *, .faq-section details, .indie-art"
  );

  targets.forEach((target, index) => {
    if (target.dataset.revealReady) return;
    target.dataset.revealReady = "true";
    target.style.transitionDelay = `${Math.min(index * 35, 260)}ms`;
    revealObserver.observe(target);
  });
}

function updateScrollProgress() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = maxScroll <= 0 ? 0 : window.scrollY / maxScroll;
  progressBar.style.transform = `scaleX(${Math.min(progress, 1)})`;

  document.querySelector(".site-header")?.classList.toggle("is-scrolled", window.scrollY > 12);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 1900);
}

function bumpCart() {
  const cartButton = document.querySelector(".cart-button");
  if (!cartButton) return;

  cartCount += 1;
  cartButton.textContent = cartCount;
  cartButton.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.2)" },
      { transform: "scale(1)" }
    ],
    { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" }
  );
}

function attachCardMotion(event) {
  const card = event.target.closest(".game-card");
  if (!card) return;

  const rect = card.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  const tiltX = ((x - 50) / 50) * 5;
  const tiltY = ((50 - y) / 50) * 4;

  card.style.setProperty("--mx", `${x}%`);
  card.style.setProperty("--my", `${y}%`);
  card.style.setProperty("--tilt-x", `${tiltX}deg`);
  card.style.setProperty("--tilt-y", `${tiltY}deg`);
}

function clearCardMotion(event) {
  const card = event.target.closest(".game-card");
  if (!card) return;

  card.style.removeProperty("--tilt-x");
  card.style.removeProperty("--tilt-y");
}

function buyGame(card) {
  const title = card.querySelector("h3")?.textContent || "Jogo";
  card.classList.remove("pop");
  void card.offsetWidth;
  card.classList.add("pop");
  bumpCart();
  showToast(`${title} adicionado ao carrinho`);
}

function playCardVideo(card) {
  const video = card.querySelector(".cover-video");
  if (!video) return;

  const separator = video.dataset.videoSrc.includes("?") ? "&" : "?";
  video.src = `${video.dataset.videoSrc}${separator}hover=${Date.now()}`;
  card.classList.add("video-playing");
}

function stopCardVideo(card) {
  const video = card.querySelector(".cover-video");
  if (!video) return;

  card.classList.remove("video-playing");
  video.removeAttribute("src");
}

revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.16, rootMargin: "0px 0px -7% 0px" }
);

document.querySelectorAll(".hero-platform-bar [data-platform]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedPlatform = button.dataset.platform;
    document.querySelectorAll(".hero-platform-bar [data-platform]").forEach((item) => {
      item.classList.toggle("active", item.dataset.platform === selectedPlatform);
    });
    window.location.href = `catalogo.html?plataforma=${encodeURIComponent(selectedPlatform)}`;
  });
});

document.querySelector(".hero-search")?.addEventListener("click", () => {
  document.querySelector(".header-search input")?.focus();
});

document.addEventListener("pointermove", (event) => {
  const hero = document.querySelector(".hero");
  if (hero) {
    const x = (event.clientX / window.innerWidth - 0.5) * -18;
    const y = (event.clientY / window.innerHeight - 0.5) * -10;
    hero.style.setProperty("--hero-x", `${x}px`);
    hero.style.setProperty("--hero-y", `${y}px`);
  }

  attachCardMotion(event);
});

document.addEventListener("pointerout", clearCardMotion);

document.addEventListener("click", (event) => {
  const card = event.target.closest(".game-card");
  if (card?.matches("a[href]")) return;
  if (card) buyGame(card);
});

document.addEventListener("scroll", updateScrollProgress, { passive: true });

renderAll();
updateScrollProgress();
