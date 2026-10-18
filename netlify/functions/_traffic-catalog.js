const ORIGIN = 'https://galaxygame.pt';
const MAX_PRODUCTS = 10000;
const MAX_BYTES = 5 * 1024 * 1024;

function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('invalid_catalog');
  return value.trim();
}

function description(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20000);
}

function cents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 999.99) throw new Error('invalid_price');
  const result = Math.round(value * 100);
  if (Math.abs(value * 100 - result) > 0.00001) throw new Error('invalid_price');
  return result;
}

function validateDocument(document) {
  if (!document || document.version !== 1 || !document.confirmations || typeof document.confirmations !== 'object' || Array.isArray(document.confirmations)) throw new Error('invalid_availability');
  return document;
}

function currentConfirmation(entry, now) {
  return Boolean(entry && entry.available === true && typeof entry.checkedBy === 'string' && entry.checkedBy.trim() &&
    Number.isFinite(Date.parse(entry.confirmedAt)) && Date.parse(entry.confirmedAt) <= now &&
    Number.isFinite(Date.parse(entry.validUntil)) && Date.parse(entry.validUntil) > now);
}

function imageUrl(product) {
  for (const value of [product.capaSteamGridDB, product.imagemFallback]) {
    if (typeof value !== 'string' || !value || value.length > 4096) continue;
    try {
      const url = new URL(value, ORIGIN);
      if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
    } catch { /* Omit untrusted or malformed optional image. */ }
  }
  return undefined;
}

function validPromotion(promotion, price, now) {
  return Boolean(promotion && promotion.confirmed === true && promotion.price === price &&
    Number.isSafeInteger(promotion.originalPrice) && promotion.originalPrice > price && promotion.originalPrice <= 99999 &&
    typeof promotion.startsAt === 'string' && typeof promotion.endsAt === 'string' &&
    Number.isFinite(Date.parse(promotion.startsAt)) && Date.parse(promotion.startsAt) <= now &&
    Number.isFinite(Date.parse(promotion.endsAt)) && Date.parse(promotion.endsAt) > now);
}

function buildSnapshot(catalog, availability, now = Date.now()) {
  validateDocument(availability);
  if (!Array.isArray(catalog) || catalog.length > MAX_PRODUCTS) throw new Error('invalid_catalog');
  const ids = new Set();
  const products = catalog.map((source) => {
    const id = text(source.id, 180);
    if (id !== source.id || ids.has(id)) throw new Error('invalid_id');
    ids.add(id);
    const entry = Object.hasOwn(availability.confirmations, id) ? availability.confirmations[id] : undefined;
    const available = currentConfirmation(entry, now);
    const price = cents(source.precoVendaEUR);
    const product = {
      externalId: id,
      name: text(source.nome, 300),
      description: description(source.descricao),
      platform: text(source.plataforma, 100),
      price, currency: 'EUR', available,
      url: `${ORIGIN}/produto?id=${encodeURIComponent(id)}`
    };
    const image = imageUrl(source);
    if (image) product.imageUrl = image;
    if (available && validPromotion(entry.promotion, price, now)) {
      product.promotion = { originalPrice: entry.promotion.originalPrice, startsAt: new Date(entry.promotion.startsAt).toISOString(), endsAt: new Date(entry.promotion.endsAt).toISOString() };
    }
    return product;
  });
  products.sort((a, b) => a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0);
  const body = JSON.stringify({ products, hasMore: false });
  if (Buffer.byteLength(body, 'utf8') > MAX_BYTES) throw new Error('catalog_too_large');
  return body;
}

module.exports = { buildSnapshot, currentConfirmation, validPromotion, validateDocument, MAX_BYTES, MAX_PRODUCTS };
