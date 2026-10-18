const crypto = require('node:crypto');
const { connectLambda } = require('@netlify/blobs');
const { readPriceOverrides, applyPriceOverrides, validateStoredDocument } = require('./_price-overrides');
const { buildSnapshot } = require('./_traffic-catalog');
// Static imports ensure esbuild includes both documents in the function bundle.
const publicCatalog = require('../../data/catalog-lite.json');
const availabilityDocument = require('./_data/traffic-availability.json');

const LOOPBACK = new Set(['127.0.0.1', '::1', '[::1]']);

function secureTransport(event, context) {
  try {
    const url = new URL(event.rawUrl);
    if (url.username || url.password || url.hash) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && /^http:\/\/(127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/.test(event.rawUrl) && LOOPBACK.has(url.hostname) &&
      context?.galaxyTrafficLocal === true && LOOPBACK.has(context.clientAddress) &&
      !process.env.NETLIFY && process.env.NODE_ENV !== 'production';
  } catch { return false; }
}

function authorized(headers, token) {
  const entries = Object.entries(headers || {}).filter(([key]) => key.toLowerCase() === 'authorization');
  if (entries.length !== 1 || typeof entries[0][1] !== 'string') return false;
  const match = /^Bearer ([^\s,]+)$/i.exec(entries[0][1]);
  if (!match) return false;
  // Fixed-length digests avoid a length-based early exit for secret comparison.
  const hash = (value) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(hash(match[1]), hash(token));
}

function response(statusCode, body, extra = {}) {
  return { statusCode, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store, max-age=0',
    'x-content-type-options': 'nosniff', ...extra
  }, body: typeof body === 'string' ? body : JSON.stringify(body) };
}

function createHandler({
  getToken = () => process.env.GALAXY_TRAFFIC_READ_TOKEN,
  loadCatalog = () => publicCatalog,
  loadAvailability = () => availabilityDocument,
  readOverrides = readPriceOverrides,
  connectBlobs = connectLambda,
  now = Date.now
} = {}) {
  return async (event, context) => {
    if (event.httpMethod !== 'GET') return response(405, { error: 'method_not_allowed' }, { Allow: 'GET' });
    const token = getToken();
    if (typeof token !== 'string' || token.length < 32 || /\s/.test(token)) return response(503, { error: 'catalog_unavailable' });
    if (!authorized(event.headers, token)) return response(401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' });
    if (!secureTransport(event, context)) return response(403, { error: 'https_required' });
    try {
      if (event.blobs) connectBlobs(event);
      const [catalog, availability, overrides] = await Promise.all([
        loadCatalog(), loadAvailability(), readOverrides({ strict: true })
      ]);
      validateStoredDocument(overrides);
      return response(200, buildSnapshot(applyPriceOverrides(catalog, overrides), availability, now()));
    } catch {
      // Never log tokens, price storage internals, or private catalog metadata.
      return response(503, { error: 'catalog_unavailable' });
    }
  };
}

exports.createHandler = createHandler;
exports.handler = createHandler();
