const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('commercial source URLs override existing static files with exact forced 404 routes', async () => {
  const { parseAllRedirects } = await import('@netlify/redirect-parser');
  const { redirects, errors } = await parseAllRedirects({
    redirectsFiles: [path.resolve(__dirname, '../_redirects')],
    netlifyConfigPath: path.resolve(__dirname, '../netlify.toml')
  });
  assert.deepEqual(errors, []);
  for (const from of ['/data/raw-alpha.json', '/data/raw-tca.json', '/data/raw-fornecedor.json', '/data/concorrente.json', '/data/enriquecido.json']) {
    const route = redirects.find((rule) => rule.from === from);
    assert.ok(route, from + ' must have an exact private route');
    assert.deepEqual({ to: route.to, status: route.status, force: route.force },
      { to: '/404.html', status: 404, force: true }, from);
  }
  // Auth scripts rely on static file shadowing of the broad scripts rule.
  for (const url of ['/scripts/auth.js', '/scripts/auth-loader.js', '/scripts/recovery-token.js', '/scripts/identity-modern.js']) {
    assert.ok(require('node:fs').existsSync(path.resolve(__dirname, '..', url.slice(1))));
    const applicable = redirects.filter((rule) => rule.from === url || rule.from === '/scripts/*');
    assert.ok(applicable.every((rule) => !(rule.force && rule.status === 404)), url);
  }
});

const token = 'fixture-only-token-with-at-least-32-characters';
const now = Date.parse('2026-10-18T12:00:00Z');
const product = { id: 'fixture-ps5', nome: 'Fixture Game', plataforma: 'PlayStation 5', precoVendaEUR: 12.99, precoOriginalEUR: 30, imagemFallback: '/assets/fixture.webp', supplierCost: 1, email: 'private@example.invalid' };
const event = (extra = {}) => ({ httpMethod: 'GET', rawUrl: 'https://galaxygame.pt/.netlify/functions/traffic-catalog', headers: { authorization: `Bearer ${token}` }, ...extra });
function setup(options = {}) {
  return require('../netlify/functions/traffic-catalog').createHandler({
    getToken: () => token, loadCatalog: () => [product],
    loadAvailability: () => ({ version: 1, confirmations: {} }),
    readOverrides: async () => ({ version: 1, prices: {} }),
    connectBlobs: () => {}, now: () => now, ...options
  });
}
const confirmed = (extra = {}) => ({ available: true, checkedBy: 'fixture-operator', confirmedAt: '2026-10-18T10:00:00Z', validUntil: '2026-10-19T10:00:00Z', ...extra });
const metadata = (entry) => ({ version: 1, confirmations: { [product.id]: entry } });

test('missing, incorrect and malformed bearer tokens cannot read source', async () => {
  const handler = setup({ loadCatalog: () => { throw new Error('must not read'); } });
  for (const authorization of [undefined, '', 'Bearer wrong', `Basic ${token}`, `Bearer ${token},other`, `Bearer ${token} extra`]) {
    assert.equal((await handler(event({ headers: { authorization } }))).statusCode, 401);
  }
});

test('token configuration fails closed and rotation revokes the previous token', async () => {
  let active = token;
  const handler = setup({ getToken: () => active });
  assert.equal((await handler(event())).statusCode, 200);
  active = `${token}-rotated`;
  assert.equal((await handler(event())).statusCode, 401);
  assert.equal((await handler(event({ headers: { authorization: `Bearer ${active}` } }))).statusCode, 200);
  for (active of ['', 'short', undefined]) assert.equal((await handler(event())).statusCode, 503);
});

test('only GET is supported and headers prevent caching without CORS', async () => {
  const handler = setup();
  for (const httpMethod of ['POST', 'HEAD', 'OPTIONS', 'DELETE']) {
    const response = await handler(event({ httpMethod }));
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.Allow, 'GET');
  }
  const response = await handler(event());
  assert.match(response.headers['cache-control'], /no-store/);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
});

test('HTTPS uses platform raw URL, never spoofable forwarded headers', async () => {
  const handler = setup();
  assert.equal((await handler(event({ rawUrl: 'http://galaxygame.pt/x', headers: { authorization: `Bearer ${token}`, 'x-forwarded-proto': 'https' } }))).statusCode, 403);
  assert.equal((await handler(event({ rawUrl: undefined }))).statusCode, 403);
  assert.equal((await handler(event({ rawUrl: 'http://127.0.0.1/x' }))).statusCode, 403);
  assert.equal((await handler(event({ rawUrl: 'http://127.0.0.1/x' }), { galaxyTrafficLocal: true, clientAddress: '203.0.113.1' })).statusCode, 403);
  for (const rawUrl of ['http://127.1/x', 'http://2130706433/x', 'http://localhost/x', 'http://user@127.0.0.1/x', 'http://127.0.0.1/x#fragment']) {
    assert.equal((await handler(event({ rawUrl }), { galaxyTrafficLocal: true, clientAddress: '127.0.0.1' })).statusCode, 403);
  }
});

test('loopback bypass requires local context and is disabled in Netlify and production', async () => {
  const handler = setup();
  const originalNetlify = process.env.NETLIFY;
  const originalNodeEnv = process.env.NODE_ENV;
  const context = { galaxyTrafficLocal: true, clientAddress: '127.0.0.1' };
  try {
    delete process.env.NETLIFY;
    process.env.NODE_ENV = 'test';
    assert.equal((await handler(event({ rawUrl: 'http://127.0.0.1:3210/x' }), context)).statusCode, 200);
    process.env.NETLIFY = 'true';
    assert.equal((await handler(event({ rawUrl: 'http://127.0.0.1:3210/x' }), context)).statusCode, 403);
    delete process.env.NETLIFY;
    process.env.NODE_ENV = 'production';
    assert.equal((await handler(event({ rawUrl: 'http://127.0.0.1:3210/x' }), context)).statusCode, 403);
  } finally {
    if (originalNetlify === undefined) delete process.env.NETLIFY; else process.env.NETLIFY = originalNetlify;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
  }
});

test('override source always receives strict mode and revised price withdraws a stale promotion', async () => {
  const promo = { confirmed: true, price: 1299, originalPrice: 1999, startsAt: '2026-10-18T00:00:00Z', endsAt: '2026-10-19T00:00:00Z' };
  const response = await setup({ loadAvailability: () => metadata(confirmed({ promotion: promo })), readOverrides: async (options) => {
    assert.deepEqual(options, { strict: true });
    return { prices: { [product.id]: { precoVendaEUR: 15.99 } } };
  } })(event());
  const actual = JSON.parse(response.body).products[0];
  assert.equal(actual.price, 1599);
  assert.equal(actual.promotion, undefined);
});

test('response is complete stable snapshot with explicit whitelist and cents', async () => {
  const handler = setup();
  const first = await handler(event());
  const second = await handler(event({ rawUrl: `${event().rawUrl}?cursor=anything` }));
  assert.equal(first.body, second.body);
  assert.deepEqual(JSON.parse(first.body), { products: [{ externalId: 'fixture-ps5', name: 'Fixture Game', description: '', platform: 'PlayStation 5', price: 1299, currency: 'EUR', available: false, url: 'https://galaxygame.pt/produto?id=fixture-ps5', imageUrl: 'https://galaxygame.pt/assets/fixture.webp' }], hasMore: false });
});

test('canonical contract requires bounded name/platform and sanitized description text', async () => {
  const source = { ...product, descricao: '  <p>Factual <strong>description</strong></p>\u0000  ' };
  const response = await setup({ loadCatalog: () => [source] })(event());
  assert.equal(response.statusCode, 200);
  const actual = JSON.parse(response.body).products[0];
  assert.equal(actual.description, 'Factual description');
  assert.ok(actual.name.length <= 300 && actual.platform.length <= 100 && actual.description.length <= 20000);
  for (const patch of [{ nome: 'n'.repeat(301) }, { plataforma: 'p'.repeat(101) }]) {
    assert.equal((await setup({ loadCatalog: () => [{ ...product, ...patch }] })(event())).statusCode, 503);
  }
  const long = await setup({ loadCatalog: () => [{ ...product, descricao: 'd'.repeat(20001) }] })(event());
  assert.equal(JSON.parse(long.body).products[0].description.length, 20000);
  const nontext = await setup({ loadCatalog: () => [{ ...product, descricao: { private: 'never copy' } }] })(event());
  assert.equal(JSON.parse(nontext.body).products[0].description, '');
});

test('availability needs explicit current confirmation; missing, expired and future confirmations are false', async () => {
  for (const entry of [undefined, {}, confirmed({ available: false }), confirmed({ checkedBy: '' }), confirmed({ validUntil: new Date(now).toISOString() }), confirmed({ confirmedAt: '2026-10-19T10:00:00Z' }), confirmed({ validUntil: 'invalid' })]) {
    const response = await setup({ loadAvailability: () => metadata(entry) })(event());
    assert.equal(JSON.parse(response.body).products[0].available, false);
  }
  const response = await setup({ loadAvailability: () => metadata(confirmed()) })(event());
  assert.equal(JSON.parse(response.body).products[0].available, true);
});

test('promotion requires explicit confirmation, matching sale cents and live window; withdrawal is reflected', async () => {
  const promotion = { confirmed: true, price: 1299, originalPrice: 1999, startsAt: '2026-10-18T00:00:00Z', endsAt: '2026-10-19T00:00:00Z' };
  let entry = confirmed({ promotion });
  const handler = setup({ loadAvailability: () => metadata(entry) });
  assert.deepEqual(JSON.parse((await handler(event())).body).products[0].promotion, { originalPrice: 1999, startsAt: new Date(promotion.startsAt).toISOString(), endsAt: new Date(promotion.endsAt).toISOString() });
  for (const patch of [{ confirmed: false }, { price: 999 }, { originalPrice: 1000 }, { startsAt: '2026-10-19T00:00:00Z' }, { endsAt: '2026-10-18T12:00:00Z' }]) {
    entry = confirmed({ promotion: { ...promotion, ...patch } });
    assert.equal(JSON.parse((await handler(event())).body).products[0].promotion, undefined);
  }
  entry = confirmed();
  assert.equal(JSON.parse((await handler(event())).body).products[0].promotion, undefined);
});

test('promotion timestamps normalize offsets to canonical ISO UTC datetimes', async () => {
  const promotion = { confirmed: true, price: 1299, originalPrice: 1999, startsAt: '2026-10-18T01:00:00+01:00', endsAt: '2026-10-19T01:00:00+01:00' };
  const response = await setup({ loadAvailability: () => metadata(confirmed({ promotion })) })(event());
  assert.deepEqual(JSON.parse(response.body).products[0].promotion, { originalPrice: 1999, startsAt: '2026-10-18T00:00:00.000Z', endsAt: '2026-10-19T00:00:00.000Z' });
});

test('source failures and invalid or oversized snapshots fail closed without leaking error internals', async () => {
  for (const options of [
    { readOverrides: async () => { throw new Error('secret storage detail'); } },
    { readOverrides: async () => ({ prices: { 'fixture-ps5': { precoVendaEUR: 'invalid' } } }) },
    { loadCatalog: () => { throw new Error('secret path'); } },
    { loadAvailability: () => { throw new Error('private metadata'); } },
    { loadCatalog: () => [product, product] },
    { loadCatalog: () => [{ ...product, precoVendaEUR: NaN }] },
    { loadCatalog: () => Array.from({ length: 10001 }, (_, i) => ({ ...product, id: `p${i}` })) },
    { loadCatalog: () => Array.from({ length: 10000 }, (_, i) => ({ ...product, id: `p${i}`, descricao: 'd'.repeat(700) })) }
  ]) {
    const response = await setup(options)(event());
    assert.equal(response.statusCode, 503);
    assert.deepEqual(JSON.parse(response.body), { error: 'catalog_unavailable' });
  }
});

test('actual source and existing price override helper: isolated Blob transport, no live integration', async () => {
  const prices = require('../netlify/functions/_price-overrides');
  const source = require('../data/catalog-lite.json');
  prices._test.setStoreFactory(() => ({ async get() { return { prices: { [source[0].id]: { precoVendaEUR: 31.95, updatedBy: 'private@example.invalid' } } }; } }));
  const original = process.env.GALAXY_TRAFFIC_READ_TOKEN;
  process.env.GALAXY_TRAFFIC_READ_TOKEN = token;
  try {
    const { handler } = require('../netlify/functions/traffic-catalog');
    const response = await handler(event());
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.products.length, source.length);
    assert.equal(body.products.find((p) => p.externalId === source[0].id).price, 3195);
    assert.ok(body.products.every((p) => p.available === false && !p.promotion));
    assert.ok(!response.body.includes('updatedBy'));
    prices._test.setStoreFactory(() => ({ async get() { return { version: 1, prices: { [source[0].id]: { precoVendaEUR: 'invalid' } } }; } }));
    const corrupted = await handler(event());
    assert.equal(corrupted.statusCode, 503);
    assert.deepEqual(JSON.parse(corrupted.body), { error: 'catalog_unavailable' });
    prices._test.setStoreFactory(() => ({ async get() { throw new Error('Blob private failure'); } }));
    assert.equal((await handler(event())).statusCode, 503);
  } finally {
    prices._test.resetStoreFactory();
    if (original === undefined) delete process.env.GALAXY_TRAFFIC_READ_TOKEN; else process.env.GALAXY_TRAFFIC_READ_TOKEN = original;
  }
});

test('local CLI confirmation validates IDs and expiration and supports explicit withdrawals', () => {
  const { updateAvailability } = require('../scripts/traffic-availability');
  let doc = { version: 1, confirmations: {} };
  assert.throws(() => updateAvailability(doc, ['confirm', 'unknown', '--until=2026-10-19T00:00:00Z', '--by=fixture-operator'], [product], now));
  assert.throws(() => updateAvailability(doc, ['confirm', product.id, '--until=2026-10-17T00:00:00Z', '--by=fixture-operator'], [product], now));
  doc = updateAvailability(doc, ['confirm', product.id, '--until=2026-10-19T00:00:00Z', '--by=fixture-operator'], [product], now);
  assert.equal(doc.confirmations[product.id].available, true);
  doc = updateAvailability(doc, ['promotion', product.id, '--price=1299', '--original=1999', '--starts=2026-10-18T00:00:00Z', '--ends=2026-10-19T00:00:00Z'], [product], now);
  assert.equal(doc.confirmations[product.id].promotion.confirmed, true);
  doc = updateAvailability(doc, ['clear-promotion', product.id], [product], now);
  assert.equal(doc.confirmations[product.id].promotion, undefined);
  doc = updateAvailability(doc, ['withdraw', product.id], [product], now);
  assert.equal(doc.confirmations[product.id].available, false);
});

test('module imports never load commercial catalog, orders, admin or payment modules', () => {
  const file = path.resolve(__dirname, '../netlify/functions/traffic-catalog.js');
  const child = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(file)}); const bad=Object.keys(require.cache).filter(p=>/[/\\\\](_commercial-catalog|_orders|admin-catalogo|stripe-webhook|criar-checkout)\\.js$/.test(p)); if(bad.length)process.exit(1);`]);
  assert.equal(child.status, 0, child.stderr.toString());
});
