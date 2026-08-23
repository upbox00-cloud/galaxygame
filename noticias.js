const NEWS_FEED_URL = "https://www.eurogamer.pt/feed";
const NEWS_LIMIT = 6;

const newsSection = document.querySelector("#noticias.dynamic-news");
const newsList = document.querySelector("#noticias-lista");
const newsSourceLink = document.querySelector("[data-news-source]");
const isProductNewsPage = document.body.classList.contains("product-page");
let localNewsCachePromise;

function renderNewsSkeletons(count = NEWS_LIMIT) {
  if (!newsSection || !newsList || isProductNewsPage) return;
  newsSection.hidden = false;
  newsSection.dataset.homeLoading = "true";
  newsList.innerHTML = Array.from({ length: count }, () => `
    <article class="news-card news-card-skeleton" aria-hidden="true">
      <div class="news-card-image"></div>
      <div class="news-card-body"><time></time><h3></h3><p></p><span></span></div>
    </article>
  `).join("");
}

function normalizeNewsKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function cachedProductNews(productName) {
  localNewsCachePromise ||= fetch("data/noticias-jogos.json", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : { games: {} })
    .catch(() => ({ games: {} }));
  const cache = await localNewsCachePromise;
  return cache.games?.[normalizeNewsKey(productName)]?.items || [];
}

function productNewsFeedUrl(productName, broad = false) {
  const query = broad ? `"${productName}"` : `"${productName}" videojogo OR game`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-PT&gl=PT&ceid=PT:pt-150`;
}

async function fetchNewsFeed(feedUrl) {
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
  const response = await fetch(apiUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("feed indisponível");

  const data = await response.json();
  if (data.status !== "ok" || !Array.isArray(data.items)) throw new Error("feed invalido");
  return data.items.filter((item) => item?.title && item?.link);
}

function escapeNewsHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripHtml(value) {
  const element = document.createElement("div");
  element.innerHTML = String(value || "");
  return (element.textContent || element.innerText || "").replace(/\s+/g, " ").trim();
}

function shortSummary(item) {
  const text = stripHtml(item.description || item.content || "");
  return text.length > 190 ? `${text.slice(0, 187).trim()}...` : text;
}

function newsImage(item) {
  const enclosure = item.enclosure?.link || item.enclosure?.url;
  if (enclosure) return enclosure;
  if (item.thumbnail) return item.thumbnail;

  const media = item.media?.content?.url || item.media?.thumbnail?.url;
  if (media) return media;

  const html = String(item.content || item.description || "");
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] || "";
}

function formatNewsDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function renderNews(items, fallbackImages = []) {
  const validItems = items
    .filter((item) => item?.title && item?.link)
    .slice(0, NEWS_LIMIT);

  const cards = validItems.map((item, index) => {
    const image = newsImage(item) || fallbackImages[index % Math.max(1, fallbackImages.length)] || "";
    const title = stripHtml(item.title);
    const summary = shortSummary(item);
    const date = formatNewsDate(item.pubDate);
    const link = item.link;

    return `
      <article class="news-card">
        <div class="news-card-image">
          ${image ? `<img src="${escapeNewsHtml(image)}" alt="" width="720" height="405" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer">` : ""}
        </div>
        <div class="news-card-body">
          <time datetime="${escapeNewsHtml(item.pubDate || "")}">${escapeNewsHtml(date)}</time>
          <h3>${escapeNewsHtml(title)}</h3>
          <p>${escapeNewsHtml(summary || "Consulta as últimas informações, novidades e atualizações relacionadas com este jogo.")}</p>
          <a href="${escapeNewsHtml(link)}" target="_blank" rel="noopener noreferrer">Leia mais</a>
        </div>
      </article>
    `;
  }).join("");

  if (!cards) {
    newsSection.hidden = true;
    return;
  }
  newsList.innerHTML = cards;
  newsSection.removeAttribute("data-home-loading");
  newsSection.hidden = false;

  if (typeof window.observeRevealTargets === "function") {
    window.observeRevealTargets();
  } else {
    newsList.querySelectorAll(".news-card").forEach((card) => card.classList.add("is-visible"));
  }
}

async function loadNews(productName = "", fallbackImages = []) {
  if (!newsSection || !newsList) return;

  const cleanProductName = String(productName || "").trim();
  if (isProductNewsPage && !cleanProductName) return;

  if (newsSourceLink && isProductNewsPage) {
    newsSourceLink.href = `https://news.google.com/search?q=${encodeURIComponent(`"${cleanProductName}" videojogo OR game`)}`;
  }

  try {
    if (isProductNewsPage) {
      const cachedItems = await cachedProductNews(cleanProductName);
      if (cachedItems.length) {
        renderNews(cachedItems, fallbackImages);
        return;
      }
    }

    const feedCandidates = isProductNewsPage
      ? [productNewsFeedUrl(cleanProductName), productNewsFeedUrl(cleanProductName, true)]
      : [NEWS_FEED_URL];
    let items = [];
    for (const feedUrl of feedCandidates) {
      try {
        items = await fetchNewsFeed(feedUrl);
      } catch {
        items = [];
      }
      if (items.length) break;
    }
    if (!items.length) throw new Error("sem noticias relacionadas");
    renderNews(items, fallbackImages);
  } catch {
    newsSection.hidden = true;
    newsList.innerHTML = "";
  }
}

if (isProductNewsPage) {
  window.addEventListener("product-news-ready", (event) => loadNews(event.detail?.name, event.detail?.images || []));
  loadNews(window.productNewsContext?.name || document.body.dataset.productNewsQuery, window.productNewsContext?.images || []);
} else {
  renderNewsSkeletons();
  const scheduleNews = () => loadNews();
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(scheduleNews, { timeout: 4000 });
  } else {
    window.setTimeout(scheduleNews, 1800);
  }
}
