# Private Galaxy Traffic catalog

Implementation only. No deployment, production credential, live inventory verification, payment/order modification, or production Blob access is implied by local tests.

`GET https://galaxygame.pt/.netlify/functions/traffic-catalog` requires `Authorization: Bearer <restricted service token>`. Configure **only** `GALAXY_TRAFFIC_READ_TOKEN`, a unique random token of at least 32 characters with no whitespace, in the function environment through the authorized Netlify account. Do not reuse admin credentials. Never put the token in URLs, source, logs, command history, screenshots, or documentation. Rotate the environment value and restart/redeploy the function to revoke the previous token; application code reads the environment each request.

The response is `{ "products": [...], "hasMore": false }`. It always returns a complete snapshot, including unchanged and unavailable products. Cursor parameters are ignored; no cursor is emitted and no pagination/truncation occurs. Stable IDs are the public catalog IDs; output is sorted by ID. Maximum 10,000 products and 5 MiB UTF-8 response; exceeding either fails closed with 503. Keep withdrawn products in the public catalog and explicitly withdraw their confirmation before eventual removal: omission is not a stock or deletion event in Traffic AI.

Each product exposes only `externalId`, `name` (maximum 300 characters), `description` (maximum 20,000 characters), `platform` (maximum 100 characters), integer EUR-cent `price`, `currency: "EUR"`, boolean `available`, the canonical `url`, optional HTTPS `imageUrl`, and optional `promotion`. Supplier costs, competitor data, commercial metadata, orders, PII, admin credentials and price-editor identity never enter the response. Description defaults to an empty string; only approved factual `descricao` text from the public catalog is eligible, with markup/control characters removed and the text bounded. No description is inferred or copied from other sources. The source is **only** `data/catalog-lite.json`, processed by the existing `readPriceOverrides({strict:true})` and `applyPriceOverrides`. The commercial catalog and order/payment helpers are not imported. Blob failures return 503, never stale fallback prices. There are no source writes in the API. Emitted promotion timestamps are normalized to UTC ISO datetimes ending in `Z`.

Status codes: 401 missing/invalid token; 403 authenticated non-HTTPS request; 405 non-GET (including OPTIONS/HEAD); 503 missing/invalid token configuration or unavailable/invalid sources. Errors contain fixed generic codes. Responses are private/no-store, expose no CORS access, and do not log credentials or error internals. HTTPS is checked against the platform-generated `event.rawUrl`, never client `x-forwarded-proto` headers. Do not use an adapter that copies a client-provided URL into this field.

## Explicit availability and offers

`netlify/functions/_data/traffic-availability.json` starts empty: **every real product is unavailable** until an operator independently verifies supply and records confirmation. No public price/original-price field, fixture, or inferred inventory counts as confirmation.

Schema (illustrative fields only): `{"version":1,"confirmations":{"<public-product-id>":{"available":true,"checkedBy":"<non-secret operator reference>","confirmedAt":"<ISO timestamp>","validUntil":"<ISO timestamp>"}}}`. `checkedBy` is private audit metadata; use a non-secret operator reference. A true record requires nonempty `checkedBy`, a confirmation no later than server time, and a future `validUntil`. Unknown, absent, withdrawn, invalid, expired or future-dated records emit `available:false`. Expiry is evaluated for every request.

Use the local CLI only after the factual check, replacing placeholders; these examples are not commands executed in this task:

```text
node scripts/traffic-availability.js confirm <product-id> --until=<future-ISO-timestamp> --by=<operator-reference>
node scripts/traffic-availability.js withdraw <product-id>
node scripts/traffic-availability.js promotion <product-id> --price=<sale-cents> --original=<higher-original-cents> --starts=<ISO-timestamp> --ends=<ISO-timestamp>
node scripts/traffic-availability.js clear-promotion <product-id>
```

The CLI validates IDs against the local public catalog, writes only the fixed private JSON path atomically, and never accepts a custom output path or edits prices. Confirming availability clears previous offers so they require fresh explicit confirmation. Review the JSON diff before deploying. `promotion` requires a currently valid availability confirmation, integer prices and an ordered window ending within `validUntil`. The API emits an offer only when explicit `confirmed:true`, the confirmation is current, the offer window is active, and its approved sale cents equal the **current overridden price**. A changed price, expired window, withdrawal or `clear-promotion` omits the offer immediately in the next deployed snapshot.

The JSON is bundled into the function at build time to avoid Netlify package-path ambiguity. **Local metadata/catalog edits require a reviewed manual deployment to affect the deployed API.** Confirmation expiration still applies without a redeploy. Existing Netlify forced 404 rules protect `/netlify/functions/_data/*`; preserve them. Never move this document into public `data/`.

## Review and manual deployment procedure

1. Review only the private API commit and preserve unrelated dirty changes. Run `npm run test:traffic-api`, `npm run check:traffic-api`, `npm run build:traffic-api`, plus the repository test command. The existing general test script enumerates files; the dedicated API suite runs separately. The bundle check compiles in memory, checks inclusion of private metadata and rejects dependencies on commerce/orders helpers; it does not regenerate the catalog or deploy.
2. With a connected account and explicit deployment authorization, have the operator set the dedicated token via the protected Netlify environment UI, Functions scope, for the intended deploy context. Do not put it into netlify.toml or frontend variables. Environment changes need a new deploy: https://docs.netlify.com/build/functions/environment-variables/. Review function bundle inclusion of both JSON sources and existing private-path 404 protection. Do not expose Blobs/admin credentials to Traffic AI.
3. Have the operator manually deploy a reviewed revision matching the currently approved production source, applying only the API commit to that revision. The local working tree has 16 preexisting modified files: do not accidentally publish those files or an outdated catalog along with this API. A full-site publish can affect the storefront: https://docs.netlify.com/build/functions/configuration/. No deployment command was executed. Then verify unauthorized requests return401, authenticated HTTPS reads return the complete bounded snapshot, no sensitive fields escape, and missing/expired confirmation is false. Inspect current prices against the authorized source. Local isolated tests are not this verification.
4. Configure Traffic AI's canonical Galaxy Traffic contract using the deployed HTTPS endpoint and restricted token. Validate changes to availability, current prices and offer withdrawal in an authorized staging workflow before enabling automation. No publication or conversion/order integration is part of this endpoint.

## Test and local runner hooks

CommonJS exports: `handler(event, context)` and `createHandler({getToken,loadCatalog,loadAvailability,readOverrides,connectBlobs,now})`. Overrides default to actual sources; `readOverrides` is always called with `{strict:true}`. Tests exercise the actual public catalog and existing override implementation using an isolated in-memory Blob transport. This proves local source behavior, **not live Netlify storage credentials or production connectivity**.

For a loopback-only harness, use the real handler or factory with `event.rawUrl = "http://127.0.0.1:<port>/..."` and server-created context `{galaxyTrafficLocal:true,clientAddress:"127.0.0.1"}`. HTTP is allowed only for exact `127.0.0.1`/`[::1]` URL hosts plus loopback peer context, when `NETLIFY` is unset and `NODE_ENV` is not `production`. Never construct that context from request headers or expose the harness on a public interface. The harness may inject isolated price/availability loaders; label those fixtures clearly. Production uses HTTPS and real strict Blob reads.
