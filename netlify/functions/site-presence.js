const { connectLambda, getStore } = require("@netlify/blobs");
const { json, requireAdmin } = require("./_orders");

// Reuse the store already provisioned for orders; presence stays isolated by prefix.
const STORE_NAME = "galaxygame-orders";
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_RECORDS = 5000;
const VISIT_HISTORY_DAYS = 30;
const MAX_VISITORS_PER_DAY = 20000;

let storeFactory = () => getStore(STORE_NAME);

function normalizeVisitorId(value) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{16,80}$/.test(id) ? id : "";
}

function normalizePage(value) {
  try {
    const url = new URL(String(value || "/"), "https://galaxygame.pt");
    const path = url.pathname.replace(/\/{2,}/g, "/").slice(0, 160);
    return path.startsWith("/") ? path : "/";
  } catch {
    return "/";
  }
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

async function registerDailyVisit(store, visitorId, now) {
  const key = `visits/daily/${dateKey(new Date(now))}.json`;
  const day = (await store.get(key, { type: "json" })) || { visitors: {} };
  if (day.visitors[visitorId] || Object.keys(day.visitors).length >= MAX_VISITORS_PER_DAY) return;
  day.visitors[visitorId] = now;
  await store.setJSON(key, day);
}

async function recordPresence(event) {
  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const visitorId = normalizeVisitorId(body.visitorId);
  if (!visitorId) return json(400, { error: "invalid_visitor" });
  const now = Date.now();
  const store = storeFactory();
  await Promise.all([
    store.setJSON(`active/${visitorId}.json`, {
      lastSeen: now,
      page: normalizePage(body.page)
    }),
    registerDailyVisit(store, visitorId, now)
  ]);
  return json(200, { received: true });
}

async function visitHistory(store) {
  const now = Date.now();
  const days = [];
  for (let offset = VISIT_HISTORY_DAYS - 1; offset >= 0; offset -= 1) {
    days.push(new Date(now - offset * 24 * 60 * 60 * 1000));
  }
  const counts = await Promise.all(days.map(async (date) => {
    const key = `visits/daily/${dateKey(date)}.json`;
    const day = await store.get(key, { type: "json" });
    return { date: dateKey(date), count: day ? Object.keys(day.visitors || {}).length : 0 };
  }));
  return counts;
}

async function listPresence(context) {
  const adminError = requireAdmin(context);
  if (adminError) return adminError;
  const store = storeFactory();
  const keys = [];
  for await (const page of store.list({ prefix: "active/", paginate: true })) {
    keys.push(...page.blobs.map((blob) => blob.key));
    if (keys.length >= MAX_RECORDS) break;
  }
  const now = Date.now();
  const values = await Promise.all(keys.slice(0, MAX_RECORDS).map(async (key) => ({
    key,
    value: await store.get(key, { type: "json" })
  })));
  const active = values.filter(({ value }) => Number(value?.lastSeen || 0) >= now - ACTIVE_WINDOW_MS);
  const pages = new Map();
  active.forEach(({ value }) => {
    const page = normalizePage(value.page);
    pages.set(page, (pages.get(page) || 0) + 1);
  });
  const staleKeys = values
    .filter(({ value }) => Number(value?.lastSeen || 0) < now - STALE_AFTER_MS)
    .slice(0, 100)
    .map(({ key }) => key);
  if (staleKeys.length) await Promise.allSettled(staleKeys.map((key) => store.delete(key)));
  const history = await visitHistory(store);
  return json(200, {
    active: active.length,
    pages: [...pages.entries()]
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count || a.page.localeCompare(b.page)),
    windowSeconds: ACTIVE_WINDOW_MS / 1000,
    history,
    generatedAt: new Date(now).toISOString()
  });
}

exports.handler = async (event, context) => {
  try {
    if (event?.blobs) connectLambda(event);
    if (event.httpMethod === "POST") return await recordPresence(event);
    if (event.httpMethod === "GET") return await listPresence(context);
    return json(405, { error: "method_not_allowed" });
  } catch (error) {
    console.error("[site-presence]", { message: error?.message || "erro desconhecido" });
    return json(500, { error: "presence_failed" });
  }
};

exports._test = {
  normalizeVisitorId,
  normalizePage,
  setStoreFactory(factory) { storeFactory = factory; },
  resetStoreFactory() { storeFactory = () => getStore(STORE_NAME); }
};
