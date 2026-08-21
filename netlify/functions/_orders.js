const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { connectLambda, getStore } = require("@netlify/blobs");

const AIRTABLE_TABLE = "Pedidos";
const AIRTABLE_API = "https://api.airtable.com/v0";
const ORDER_STORE = "galaxygame-orders";
const AIRTABLE_WRITE_ATTEMPTS = 3;
const WEBHOOK_LEASE_MS = 5 * 60 * 1000;
const AIRTABLE_FIELD_ALIASES = Object.freeze({
  CustomerType: "TipoCliente",
  customerType: "TipoCliente",
  userId: "UserId",
  fornecedor: "Fornecedor",
  supplier: "Fornecedor",
  custoFornecedorBRL: "CustoFornecedorBRL",
  supplierCostBRL: "CustoFornecedorBRL"
});
// The Lambda runtime does not expose the uncached edge URL required by
// Netlify Blobs strong consistency. The default store remains persistent and
// works in every deployed function that reads or updates an order.
const defaultOrdersStoreFactory = () => getStore(ORDER_STORE);
let ordersStoreFactory = defaultOrdersStoreFactory;
let retryDelay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let catalogCache = null;

function configureOrderStorage(event) {
  if (event?.blobs) connectLambda(event);
}

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variavel de ambiente em falta: ${name}`);
  return value;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function escapeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function airtableUrl(path, params = {}) {
  const url = new URL(`${AIRTABLE_API}/${env("AIRTABLE_BASE_ID")}/${encodeURIComponent(path)}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  return url;
}

async function airtableRequest(path, options = {}) {
  const response = await fetch(airtableUrl(path, options.params), {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${env("AIRTABLE_TOKEN")}`,
      "content-type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Airtable respondeu ${response.status}`);
    error.status = response.status;
    error.airtableType = data?.error?.type || null;
    error.airtableBody = data;
    throw error;
  }
  return data;
}

async function listOrdersByFormula(filterByFormula, { maxRecords = 100, sortNewest = true } = {}) {
  const records = [];
  let offset = null;
  do {
    const data = await airtableRequest(AIRTABLE_TABLE, {
      params: {
        pageSize: Math.min(maxRecords, 100),
        offset,
        filterByFormula,
        ...(sortNewest ? { "sort[0][field]": "DataCompra", "sort[0][direction]": "desc" } : {})
      }
    });
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset && records.length < maxRecords);
  return records.slice(0, maxRecords).map(normalizeOrder).filter(isMeaningfulOrder);
}

async function findOrderByStripeSessionId(sessionId) {
  if (!sessionId) return null;
  const formula = `{StripeSessionId}='${escapeFormulaValue(sessionId)}'`;
  const records = await listOrdersByFormula(formula, { maxRecords: 1, sortNewest: false });
  return records[0] || null;
}

async function getOrderById(recordId) {
  if (!/^rec[a-zA-Z0-9]+$/.test(String(recordId || ""))) return null;
  const formula = `RECORD_ID()='${escapeFormulaValue(recordId)}'`;
  const records = await listOrdersByFormula(formula, { maxRecords: 1, sortNewest: false });
  return records[0] || null;
}

async function createOrder(fields) {
  const data = await writeAirtableRecords("POST", [{ fields }]);
  return normalizeOrder(data.records?.[0]);
}

async function upsertOrderByStripeSessionId(fields) {
  if (!fields?.StripeSessionId) throw new Error("StripeSessionId em falta no pedido");
  const data = await writeAirtableRecords("PATCH", [{ fields }], {
    fieldsToMergeOn: ["StripeSessionId"]
  });
  return normalizeOrder(data.records?.[0]);
}

async function updateOrder(recordId, fields) {
  const data = await writeAirtableRecords("PATCH", [{ id: recordId, fields }]);
  return normalizeOrder(data.records?.[0]);
}

async function writeAirtableRecords(method, records, performUpsert) {
  const mutableRecords = records.map((record) => ({
    ...record,
    fields: canonicalizeAirtableFields(record.fields || {})
  }));
  const aliases = { Status: "Estado", Codigo: "Código" };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await airtableRequest(AIRTABLE_TABLE, {
        method,
        body: {
          ...(performUpsert ? { performUpsert } : {}),
          records: mutableRecords
        }
      });
    } catch (error) {
      const field = error.status === 422
        ? error.message.match(/Unknown field name:\s*["']([^"']+)["']/i)?.[1]
        : "";
      const appearsInRecords = field && mutableRecords.some((record) => Object.hasOwn(record.fields, field));
      const alias = aliases[field];
      if (!appearsInRecords || !alias) throw error;

      mutableRecords.forEach((record) => {
        if (!Object.hasOwn(record.fields, field)) return;
        if (!Object.hasOwn(record.fields, alias)) record.fields[alias] = record.fields[field];
        delete record.fields[field];
      });
      console.warn("[orders:airtable-schema] campo incompatível adaptado", {
        field,
        replacement: alias || null
      });
    }
  }
  throw new Error("Nao foi possivel adaptar os campos da tabela Pedidos");
}

function canonicalizeAirtableFields(fields) {
  const canonical = { ...fields };
  Object.entries(AIRTABLE_FIELD_ALIASES).forEach(([source, target]) => {
    if (!Object.hasOwn(canonical, source)) return;
    if (!Object.hasOwn(canonical, target)) canonical[target] = canonical[source];
    delete canonical[source];
  });

  if (Object.hasOwn(canonical, "Fornecedor")) {
    canonical.Fornecedor = normalizeSupplierName(canonical.Fornecedor);
  }
  if (Object.hasOwn(canonical, "CustoFornecedorBRL")) {
    const cost = Number(canonical.CustoFornecedorBRL || 0);
    canonical.CustoFornecedorBRL = Number.isFinite(cost) ? cost : 0;
  }
  if (Object.hasOwn(canonical, "TipoCliente")) canonical.TipoCliente = String(canonical.TipoCliente || "");
  if (Object.hasOwn(canonical, "UserId")) canonical.UserId = String(canonical.UserId || "");
  return canonical;
}

function normalizeSupplierName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "alpha games") return "Alpha Games";
  if (normalized === "tca games") return "TCA Games";
  return "";
}

function normalizeOrder(record) {
  if (!record) return null;
  const fields = record.fields || {};
  const rawCustomerType = String(fields.TipoCliente || fields.CustomerType || "").trim().toLowerCase();
  const isEmailOnly = ["email_only", "apenas email", "so email", "só email"].includes(rawCustomerType);
  const isGuest = isEmailOnly || rawCustomerType === "guest"
    || rawCustomerType === "convidado"
    || (!fields.UserId && String(fields.ClienteNome || "").trim().toLowerCase() === "convidado");
  return {
    id: record.id,
    clienteEmail: fields.ClienteEmail || "",
    clienteNome: fields.ClienteNome || "",
    produto: fields.Produto || "",
    plataforma: fields.Plataforma || "",
    valorPagoEUR: Number(fields.ValorPagoEUR || 0),
    status: fields.Status || fields.Estado || (fields.Codigo || fields["Código"] ? "Enviado" : "Aguardando codigo"),
    codigo: fields.Codigo || fields["Código"] || "",
    imagem: normalizeImageField(fields.ImagemURL || fields.Imagem || fields.Capa),
    dataCompra: fields.DataCompra || "",
    stripeSessionId: fields.StripeSessionId || "",
    fornecedor: fields.Fornecedor || "",
    custoFornecedorBRL: Number(fields.CustoFornecedorBRL || 0),
    linkFornecedor: fields.LinkFornecedor || "",
    tipoCliente: isEmailOnly ? "Apenas email" : (isGuest ? "Convidado" : "Cadastrado"),
    isEmailOnly,
    isGuest,
    userId: fields.UserId || "",
    storageSource: "airtable"
  };
}

function isMeaningfulOrder(order) {
  if (!order) return false;
  return Boolean(
    String(order.clienteEmail || "").trim()
    || String(order.produto || "").trim()
    || String(order.plataforma || "").trim()
    || String(order.stripeSessionId || "").trim()
    || String(order.dataCompra || "").trim()
    || Number(order.valorPagoEUR || 0) > 0
  );
}

function ordersStore() {
  return ordersStoreFactory();
}

function blobOrderKey(sessionId) {
  return `orders/${String(sessionId || "").trim()}.json`;
}

function blobOrderId(sessionId) {
  return `blob_${String(sessionId || "").trim()}`;
}

function normalizeBlobOrder(value) {
  if (!value?.stripeSessionId) return null;
  const rawCustomerType = String(value.tipoCliente || value.customerType || "").trim().toLowerCase();
  const isEmailOnly = value.isEmailOnly === true || ["email_only", "apenas email", "so email", "só email"].includes(rawCustomerType);
  const isGuest = isEmailOnly || value.isGuest === true
    || rawCustomerType === "guest"
    || rawCustomerType === "convidado"
    || (!value.userId && String(value.clienteNome || "").trim().toLowerCase() === "convidado");
  return {
    id: blobOrderId(value.stripeSessionId),
    clienteEmail: String(value.clienteEmail || "").trim().toLowerCase(),
    clienteNome: value.clienteNome || "",
    produto: value.produto || "",
    plataforma: value.plataforma || "",
    valorPagoEUR: Number(value.valorPagoEUR || 0),
    status: value.status || "Aguardando codigo",
    codigo: value.codigo || "",
    imagem: normalizeImageField(value.imagem),
    dataCompra: value.dataCompra || "",
    stripeSessionId: value.stripeSessionId,
    fornecedor: value.fornecedor || "",
    custoFornecedorBRL: Number(value.custoFornecedorBRL || 0),
    linkFornecedor: value.linkFornecedor || "",
    tipoCliente: isEmailOnly ? "Apenas email" : (isGuest ? "Convidado" : "Cadastrado"),
    isEmailOnly,
    isGuest,
    userId: value.userId || "",
    storageSource: "blob"
  };
}

function fieldsToBlobOrder(fields, current = {}) {
  return normalizeBlobOrder({
    ...current,
    clienteEmail: fields.ClienteEmail ?? current.clienteEmail,
    clienteNome: fields.ClienteNome ?? current.clienteNome,
    produto: fields.Produto ?? current.produto,
    plataforma: fields.Plataforma ?? current.plataforma,
    valorPagoEUR: fields.ValorPagoEUR ?? current.valorPagoEUR,
    status: fields.Status ?? current.status,
    codigo: fields.Codigo ?? current.codigo,
    imagem: fields.ImagemURL ?? fields.Imagem ?? current.imagem,
    dataCompra: fields.DataCompra ?? current.dataCompra,
    stripeSessionId: fields.StripeSessionId ?? current.stripeSessionId,
    fornecedor: fields.Fornecedor ?? current.fornecedor,
    custoFornecedorBRL: fields.CustoFornecedorBRL ?? current.custoFornecedorBRL,
    linkFornecedor: fields.LinkFornecedor ?? current.linkFornecedor,
    tipoCliente: fields.TipoCliente ?? fields.CustomerType ?? current.tipoCliente,
    isEmailOnly: fields.TipoCliente === "Apenas email" || fields.CustomerType === "email_only" || current.isEmailOnly,
    isGuest: fields.TipoCliente === "Apenas email" || fields.CustomerType === "email_only" || fields.TipoCliente === "Convidado" || fields.CustomerType === "guest" || current.isGuest,
    userId: fields.UserId ?? current.userId
  });
}

async function getBlobOrderBySessionId(sessionId) {
  if (!sessionId) return null;
  const value = await ordersStore().get(blobOrderKey(sessionId), { type: "json" });
  return normalizeBlobOrder(value);
}

async function upsertBlobOrder(fields, currentOverride) {
  const sessionId = String(fields?.StripeSessionId || "").trim();
  if (!sessionId) throw new Error("StripeSessionId em falta no pedido Blob");
  const current = currentOverride === undefined
    ? await getBlobOrderBySessionId(sessionId)
    : normalizeBlobOrder(currentOverride);
  const order = fieldsToBlobOrder(fields, current || {});
  await ordersStore().setJSON(blobOrderKey(sessionId), order);
  return order;
}

async function listBlobOrders({ email = "", status = "", maxRecords = 100 } = {}) {
  const store = ordersStore();
  const page = await store.list({ prefix: "orders/" });
  const keys = page.blobs.slice(0, 1000).map((blob) => blob.key);
  const values = await Promise.all(keys.map((key) => store.get(key, { type: "json" })));
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return values
    .map(normalizeBlobOrder)
    .filter(Boolean)
    .filter((order) => !normalizedEmail || order.clienteEmail === normalizedEmail)
    .filter((order) => !status || order.status === status)
    .sort((a, b) => new Date(b.dataCompra || 0) - new Date(a.dataCompra || 0))
    .slice(0, maxRecords);
}

function logStorageFallback(operation, error, fields = {}) {
  console.warn(`[orders:${operation}] Airtable indisponivel; a usar Netlify Blobs`, {
    fallback: ORDER_STORE,
    message: error?.message || "erro desconhecido",
    status: error?.status || null,
    airtableType: error?.airtableType || null,
    airtableResponse: error?.airtableBody || null,
    stripeSessionSuffix: String(fields.StripeSessionId || "").slice(-12) || null,
    customerEmail: String(fields.ClienteEmail || "").trim().toLowerCase() || null
  });
}

async function findPersistedOrderByStripeSessionId(sessionId) {
  const blobResult = await Promise.allSettled([getBlobOrderBySessionId(sessionId)]);
  if (blobResult[0].status === "fulfilled" && blobResult[0].value) return blobResult[0].value;
  try {
    return await findOrderByStripeSessionId(sessionId);
  } catch (error) {
    logStorageFallback("find", error);
    if (blobResult[0].status === "rejected") throw blobResult[0].reason;
    return null;
  }
}

async function persistOrder(fields) {
  const [airtable, blob] = await Promise.allSettled([
    retryAirtableWrite(() => upsertOrderByStripeSessionId(fields), fields),
    upsertBlobOrder(fields)
  ]);
  if (airtable.status === "rejected") logStorageFallback("save", airtable.reason, fields);
  if (blob.status === "rejected") {
    console.error("[orders:save] Netlify Blobs falhou", { message: blob.reason?.message || "erro desconhecido" });
  }
  if (airtable.status === "rejected" && blob.status === "rejected") {
    throw new Error(`Nao foi possivel guardar o pedido: ${airtable.reason?.message || blob.reason?.message}`);
  }
  const saved = blob.status === "fulfilled" ? blob.value : airtable.value;
  return {
    ...saved,
    storageState: {
      airtableSaved: airtable.status === "fulfilled",
      blobSaved: blob.status === "fulfilled",
      fallbackUsed: airtable.status === "rejected" && blob.status === "fulfilled",
      airtableError: airtable.status === "rejected" ? serializeOperationalError(airtable.reason) : null,
      blobError: blob.status === "rejected" ? serializeOperationalError(blob.reason) : null
    }
  };
}

async function retryAirtableWrite(operation, fields = {}) {
  let lastError;
  for (let attempt = 1; attempt <= AIRTABLE_WRITE_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const permanentConfigurationError = /Variavel de ambiente em falta/i.test(error?.message || "")
        || [401, 403].includes(Number(error?.status));
      if (attempt >= AIRTABLE_WRITE_ATTEMPTS || permanentConfigurationError) break;
      const delayMs = attempt * 350;
      console.warn("[orders:airtable-retry] tentativa de escrita falhou", {
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
        status: error?.status || null,
        message: error?.message || "erro desconhecido",
        stripeSessionSuffix: String(fields.StripeSessionId || "").slice(-12) || null
      });
      await retryDelay(delayMs);
    }
  }
  throw lastError;
}

function serializeOperationalError(error) {
  return {
    message: String(error?.message || "erro desconhecido").slice(0, 500),
    status: Number(error?.status || 0) || null,
    type: error?.airtableType || null
  };
}

async function listPersistedOrders({ email = "", status = "", maxRecords = 100 } = {}) {
  const formulaParts = [];
  if (email) formulaParts.push(`{ClienteEmail}='${escapeFormulaValue(email)}'`);
  const formula = formulaParts.length > 1 ? `AND(${formulaParts.join(",")})` : formulaParts[0] || "";
  const [airtable, blob] = await Promise.allSettled([
    listOrdersByFormula(formula, { maxRecords }),
    listBlobOrders({ email, status, maxRecords })
  ]);
  if (airtable.status === "rejected") logStorageFallback("list", airtable.reason);
  if (blob.status === "rejected") {
    console.error("[orders:list] Netlify Blobs falhou", {
      message: blob.reason?.message || "erro desconhecido"
    });
  }
  if (airtable.status === "rejected" && blob.status === "rejected") throw blob.reason;

  const orders = new Map();
  if (airtable.status === "fulfilled") {
    airtable.value.forEach((order) => orders.set(order.stripeSessionId || order.id, order));

    // A listagem de Blobs pode demorar a revelar uma chave recém-criada.
    // A leitura direta por sessão é consistente e garante que Minha Conta
    // vê a entrega assim que o email é enviado.
    let directBlobMatches = 0;
    for (const order of airtable.value) {
      if (!order.stripeSessionId) continue;
      try {
        const blobOrder = await getBlobOrderBySessionId(order.stripeSessionId);
        if (!blobOrder) continue;
        const key = order.stripeSessionId || order.id;
        orders.set(key, mergeOrderCopies(orders.get(key), blobOrder));
        directBlobMatches += 1;
      } catch (error) {
        console.error("[orders:list] leitura direta do pedido Blob falhou", {
          sessionSuffix: String(order.stripeSessionId).slice(-8),
          message: error?.message || "erro desconhecido"
        });
      }
    }
    console.info("[orders:list] fontes combinadas", {
      airtable: airtable.value.length,
      blobsListed: blob.status === "fulfilled" ? blob.value.length : 0,
      blobsMatchedDirectly: directBlobMatches
    });
  }
  if (blob.status === "fulfilled") {
    blob.value.forEach((order) => {
      const key = order.stripeSessionId || order.id;
      orders.set(key, mergeOrderCopies(orders.get(key), order));
    });
  }
  return [...orders.values()]
    .map(enrichOrderFromCatalog)
    .filter(isMeaningfulOrder)
    .filter((order) => !status || order.status === status)
    .sort((a, b) => new Date(b.dataCompra || 0) - new Date(a.dataCompra || 0))
    .slice(0, maxRecords);
}

async function getPersistedOrderById(recordId) {
  if (String(recordId || "").startsWith("blob_")) {
    return enrichOrderFromCatalog(await getBlobOrderBySessionId(String(recordId).slice(5)));
  }
  return enrichOrderFromCatalog(await getOrderById(recordId));
}

async function updatePersistedOrder(recordId, fields) {
  if (String(recordId || "").startsWith("blob_")) {
    const sessionId = String(recordId).slice(5);
    const current = await getBlobOrderBySessionId(sessionId);
    if (!current) return null;
    return upsertBlobOrder({ ...fields, StripeSessionId: sessionId });
  }

  const current = await getOrderById(recordId);
  if (!current) return null;

  const airtable = await Promise.allSettled([updateOrder(recordId, fields)]);
  const blob = current.stripeSessionId
    ? await Promise.allSettled([upsertBlobOrder({
        ...fields,
        StripeSessionId: current.stripeSessionId,
        ClienteEmail: current.clienteEmail,
        ClienteNome: current.clienteNome,
        Produto: current.produto,
        Plataforma: current.plataforma,
        ValorPagoEUR: current.valorPagoEUR,
        ImagemURL: current.imagem,
        DataCompra: current.dataCompra,
        Fornecedor: current.fornecedor,
        CustoFornecedorBRL: current.custoFornecedorBRL,
        LinkFornecedor: current.linkFornecedor
      }, {
        ...current,
        stripeSessionId: current.stripeSessionId
      })])
    : [{ status: "rejected", reason: new Error("Pedido sem StripeSessionId") }];

  if (airtable[0].status === "rejected") logStorageFallback("update", airtable[0].reason);
  if (blob[0].status === "rejected") {
    console.warn("[orders:update] copia Blob falhou", { message: blob[0].reason?.message || "erro desconhecido" });
  }
  if (airtable[0].status === "rejected" && blob[0].status === "rejected") {
    throw airtable[0].reason;
  }
  const saved = blob[0].status === "fulfilled" ? blob[0].value : airtable[0].value;
  if (fields.Status !== undefined && saved?.status !== fields.Status) {
    throw new Error("O estado do pedido nao foi confirmado no armazenamento");
  }
  if (fields.Codigo !== undefined && saved?.codigo !== fields.Codigo) {
    throw new Error("Os dados de entrega nao foram confirmados no armazenamento");
  }
  return enrichOrderFromCatalog(saved);
}

function statusPriority(value) {
  const status = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (status.includes("enviado")) return 3;
  if (status.includes("cancelado")) return 2;
  return 1;
}

function mergeOrderCopies(airtableOrder, blobOrder) {
  if (!airtableOrder) return blobOrder;
  if (!blobOrder) return airtableOrder;
  const preferred = statusPriority(blobOrder.status) >= statusPriority(airtableOrder.status) ? blobOrder : airtableOrder;
  const fallback = preferred === blobOrder ? airtableOrder : blobOrder;
  return {
    ...fallback,
    ...preferred,
    clienteEmail: preferred.clienteEmail || fallback.clienteEmail,
    clienteNome: preferred.clienteNome || fallback.clienteNome,
    produto: preferred.produto || fallback.produto,
    plataforma: preferred.plataforma || fallback.plataforma,
    imagem: preferred.imagem || fallback.imagem,
    codigo: preferred.codigo || fallback.codigo,
    stripeSessionId: preferred.stripeSessionId || fallback.stripeSessionId,
    fornecedor: preferred.fornecedor || fallback.fornecedor,
    custoFornecedorBRL: preferred.custoFornecedorBRL || fallback.custoFornecedorBRL,
    linkFornecedor: preferred.linkFornecedor || fallback.linkFornecedor,
    storageSource: "airtable+blob"
  };
}

function catalogNameKey(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(ps4|ps5|playstation\s*4|playstation\s*5|xbox\s*one|xbox\s*series\s*x\|?s?|midia\s*digital|media\s*digital|edicao\s*digital|digital)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function loadOrderCatalog() {
  if (catalogCache) return catalogCache;
  try {
    const file = path.resolve(__dirname, "../../data/catalog-lite.json");
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    catalogCache = Array.isArray(parsed) ? parsed : (parsed.produtos || []);
  } catch (error) {
    console.warn("[orders:catalog] nao foi possivel carregar capas", { message: error.message });
    catalogCache = [];
  }
  return catalogCache;
}

function enrichOrderFromCatalog(order) {
  if (!order || order.imagem || !order.produto) return order;
  const key = catalogNameKey(order.produto);
  if (!key) return order;
  const platformKey = catalogNameKey(order.plataforma);
  const matches = loadOrderCatalog().filter((product) => catalogNameKey(product.nome || product.name) === key);
  const product = matches.find((item) => !platformKey || catalogNameKey(item.plataforma || item.platform).includes(platformKey)) || matches[0];
  if (!product) return order;
  const imagem = normalizeImageField(product.capaSteamGridDB)
    || normalizeImageField(product.screenshots)
    || normalizeImageField(product.imagemFallback || product.imagem || product.image);
  return imagem ? { ...order, imagem } : order;
}

function normalizeImageField(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0]?.url || "";
  return value?.url || "";
}

function getUser(context) {
  return context?.clientContext?.user || null;
}

function getUserEmail(context) {
  const user = getUser(context);
  return String(user?.email || user?.user_metadata?.email || "").trim().toLowerCase();
}

function getUserName(context) {
  const user = getUser(context);
  return user?.user_metadata?.full_name || user?.user_metadata?.name || "";
}

function getUserRoles(context) {
  const user = getUser(context);
  const directRoles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
  const authorizationRoles = Array.isArray(user?.app_metadata?.authorization?.roles)
    ? user.app_metadata.authorization.roles
    : [];
  return [...directRoles, ...authorizationRoles].map((role) => String(role).toLowerCase());
}

function getConfiguredAdminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(/[;,\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function requireAdmin(context) {
  if (!getUser(context)) return json(401, { error: "login_required" });
  const configuredEmails = getConfiguredAdminEmails();
  if (configuredEmails.length) {
    if (!configuredEmails.includes(getUserEmail(context))) return json(403, { error: "admin_required" });
    return null;
  }
  if (!getUserRoles(context).includes("admin")) return json(403, { error: "admin_required" });
  return null;
}

function verifyStripeSignature(event) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  if (!signature) return false;

  const parts = signature.split(",").reduce((result, part) => {
    const separator = part.indexOf("=");
    if (separator === -1) return result;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!result[key]) result[key] = [];
    result[key].push(value);
    return result;
  }, {});
  const timestamp = Number(parts.t?.[0]);
  const signatures = parts.v1 || [];
  if (!Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return false;

  const payload = `${timestamp}.${event.body || ""}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return signatures.some((signatureValue) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signatureValue, "hex"));
    } catch {
      return false;
    }
  });
}

function parseStripeProducts(session) {
  const metadata = session.metadata || {};
  const productFields = [
    metadata.cart,
    metadata.products,
    metadata.items,
    metadata.produtos
  ].filter(Boolean);

  for (const value of productFields) {
    try {
      const parsed = JSON.parse(value);
      const list = Array.isArray(parsed) ? parsed : parsed?.items || [];
      if (Array.isArray(list) && list.length) {
        return {
          produto: list.map((item) => item.nome || item.name || item.produto || item.title).filter(Boolean).join(", "),
          plataforma: Array.from(new Set(list.map((item) => item.plataforma || item.platform).filter(Boolean))).join(", "),
          imagem: list.map((item) => item.imagem || item.image || item.capaSteamGridDB || item.imagemFallback).find(Boolean) || "",
          fornecedor: singleSupplier(list.map((item) => item.fornecedor || item.supplier)),
          custoFornecedorBRL: list.reduce((sum, item) => sum + Number(item.custoFornecedorBRL || item.supplierCostBRL || 0), 0),
          linkFornecedor: list.map((item) => item.linkFornecedor || item.supplierUrl).filter(Boolean).join("\n")
        };
      }
    } catch {
      // Metadata can be plain text; keep trying the next shape.
    }
  }

  return {
    produto: metadata.Produto || metadata.produto || metadata.product || metadata.productName || "Produto GalaxyGame",
    plataforma: metadata.Plataforma || metadata.plataforma || metadata.platform || "",
    imagem: metadata.ImagemURL || metadata.imagem || metadata.image || "",
    fornecedor: normalizeSupplierName(metadata.Fornecedor || metadata.fornecedor || metadata.supplier),
    custoFornecedorBRL: Number(metadata.CustoFornecedorBRL || metadata.supplier_cost_brl || 0),
    linkFornecedor: metadata.LinkFornecedor || metadata.supplier_url || ""
  };
}

async function fetchStripeProducts(session) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !session?.id) return parseStripeProducts(session || {});

  const params = new URLSearchParams({ limit: "100" });
  params.append("expand[]", "data.price.product");
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session.id)}/line_items?${params}`, {
    headers: { authorization: `Bearer ${secret}` }
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Stripe respondeu ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const lines = Array.isArray(data.data) ? data.data : [];
  if (!lines.length) return parseStripeProducts(session);
  const productMetadata = lines.map((line) => line.price?.product?.metadata || {});
  return {
    produto: lines.map((line) => line.description || line.price?.product?.name).filter(Boolean).join(", "),
    plataforma: Array.from(new Set(lines
      .map((line) => line.price?.product?.metadata?.platform)
      .filter(Boolean))).join(", "),
    imagem: lines.map((line) => line.price?.product?.images?.[0]).find(Boolean) || "",
    fornecedor: singleSupplier(productMetadata.map((metadata) => metadata.supplier)),
    custoFornecedorBRL: productMetadata.reduce((sum, metadata) => sum + Number(metadata.supplier_cost_brl || 0), 0),
    linkFornecedor: productMetadata.map((metadata) => metadata.supplier_url).filter(Boolean).join("\n")
  };
}

function singleSupplier(values) {
  const suppliers = Array.from(new Set((values || []).map(normalizeSupplierName).filter(Boolean)));
  return suppliers.length === 1 ? suppliers[0] : "";
}

async function sendCodeEmail(order) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "GalaxyGame <pedidos@galaxygame.pt>",
      to: [order.clienteEmail],
      reply_to: "gamegalaxy26@gmail.com",
      subject: "O teu jogo est\u00e1 pronto! \ud83c\udfae GalaxyGame",
      html: renderCodeEmail(order)
    })
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.message || `Resend respondeu ${response.status}`);
  }
  return data;
}

async function sendOrderConfirmationEmail(order) {
  const siteUrl = publicSiteUrl();
  const safeName = escapeHtml(order.clienteNome || "cliente");
  const product = escapeHtml(order.produto || "Jogo digital GalaxyGame");
  const platform = escapeHtml(order.plataforma || "Consola");
  const accountUrl = escapeHtml(`${siteUrl}/minha-conta.html`);
  const logoUrl = escapeHtml(`${siteUrl}/assets/galaxygame-email-banner.jpg`);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "GalaxyGame <pedidos@galaxygame.pt>",
      to: [order.clienteEmail],
      reply_to: "gamegalaxy26@gmail.com",
      subject: "Recebemos o teu pedido - GalaxyGame",
      html: `<!doctype html><html lang="pt-PT"><body style="margin:0;background:#111116;color:#f7f5fb;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#111116"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="600" cellspacing="0" cellpadding="0" bgcolor="#1c1c22" style="width:100%;max-width:600px;border:1px solid #35343d;border-radius:8px;"><tr><td align="center" bgcolor="#241a32" style="padding:26px;background:#241a32;"><img src="${logoUrl}" width="250" alt="GalaxyGame - Jogos Digitais" style="display:block;max-width:90%;height:auto;border:0;"><h1 style="margin:18px 0 0;color:#fff;font-size:27px;">Pedido confirmado</h1></td></tr><tr><td style="padding:28px;color:#f7f5fb;"><p style="font-size:19px;font-weight:700;">Ola, ${safeName}!</p><p style="color:#cbc8d2;line-height:1.6;">O pagamento foi confirmado e o teu pedido ja aparece em Minha Conta &gt; Meus Pedidos.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#28262f" style="margin:22px 0;border:1px solid #403d48;border-radius:6px;"><tr><td style="padding:18px;"><strong style="display:block;color:#fff;font-size:18px;">${product}</strong><span style="display:block;margin-top:8px;color:#ff8a3d;">${platform}</span><span style="display:block;margin-top:12px;color:#cbc8d2;">Estado: A aguardar preparacao do codigo</span></td></tr></table><p style="color:#cbc8d2;line-height:1.6;">Assim que o codigo ou os dados de acesso forem preparados, ficam disponiveis na tua conta e recebes um novo email.</p><table role="presentation" cellspacing="0" cellpadding="0" align="center"><tr><td bgcolor="#ff6a00" style="border-radius:6px;"><a href="${accountUrl}" style="display:inline-block;padding:14px 24px;color:#171117;font-weight:800;text-decoration:none;">Acompanhar o meu pedido</a></td></tr></table></td></tr><tr><td align="center" style="padding:20px 28px;border-top:1px solid #3a3941;color:#aaa7b1;font-size:12px;line-height:1.6;">Precisas de ajuda? <a href="mailto:gamegalaxy26@gmail.com" style="color:#ff8a3d;">gamegalaxy26@gmail.com</a><br>&copy; 2026 GalaxyGame.</td></tr></table></td></tr></table></body></html>`
    })
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) throw new Error(data?.message || `Resend respondeu ${response.status}`);
  return data;
}

function webhookEventKey(eventId) {
  return `webhook-events/${String(eventId || "").trim()}.json`;
}

async function claimWebhookEvent(eventId, sessionId) {
  if (!/^evt_[A-Za-z0-9_]+$/.test(String(eventId || ""))) throw new Error("Stripe event id invalido");
  const store = ordersStore();
  const key = webhookEventKey(eventId);
  const now = new Date().toISOString();
  const initial = { eventId, sessionId, status: "processing", startedAt: now, updatedAt: now, emailSent: false };
  const created = await store.setJSON(key, initial, { onlyIfNew: true });
  if (created?.modified !== false) return { claimed: true, state: initial };

  let existing;
  let etag = "";
  if (typeof store.getWithMetadata === "function") {
    const result = await store.getWithMetadata(key, { type: "json" });
    existing = result?.data || null;
    etag = result?.etag || "";
  } else {
    existing = await store.get(key, { type: "json" });
  }
  if (!existing) return { claimed: false, inProgress: true, state: initial };
  if (existing.status === "complete") return { claimed: false, duplicate: true, state: existing };

  const age = Date.now() - new Date(existing.updatedAt || existing.startedAt || 0).getTime();
  if (existing.status === "processing" && Number.isFinite(age) && age < WEBHOOK_LEASE_MS) {
    return { claimed: false, inProgress: true, state: existing };
  }

  const retryState = {
    ...existing,
    status: "processing",
    sessionId: sessionId || existing.sessionId,
    startedAt: now,
    updatedAt: now,
    retryCount: Number(existing.retryCount || 0) + 1
  };
  const reclaimed = await store.setJSON(key, retryState, etag ? { onlyIfMatch: etag } : {});
  if (reclaimed?.modified === false) return { claimed: false, inProgress: true, state: existing };
  return { claimed: true, retried: true, state: retryState };
}

async function finishWebhookEvent(eventId, updates = {}) {
  const store = ordersStore();
  const key = webhookEventKey(eventId);
  const current = await store.get(key, { type: "json" }) || { eventId };
  const next = { ...current, ...updates, updatedAt: new Date().toISOString() };
  await store.setJSON(key, next);
  return next;
}

async function sendOperationalAlert({ subject, message, sessionId = "", customerEmail = "" }) {
  const recipients = getConfiguredAdminEmails();
  if (!recipients.length) recipients.push("gamegalaxy26@gmail.com");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "GalaxyGame <pedidos@galaxygame.pt>",
      to: recipients,
      reply_to: "gamegalaxy26@gmail.com",
      subject: `[GalaxyGame] ${String(subject || "Alerta operacional").slice(0, 150)}`,
      html: `<!doctype html><html lang="pt-PT"><body style="margin:0;background:#111116;color:#f7f5fb;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:28px"><h1 style="font-size:22px;color:#ff7a18">Atenção necessária</h1><p style="line-height:1.6">${escapeHtml(message)}</p><p style="color:#bbb">Sessão Stripe: <strong>${escapeHtml(sessionId || "não indicada")}</strong><br>Email do cliente: <strong>${escapeHtml(customerEmail || "não indicado")}</strong></p><p style="color:#bbb">Consulta o painel administrativo e os logs das Functions antes de responder ao cliente.</p></div></body></html>`
    })
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(data?.message || `Resend respondeu ${response.status}`);
  return data;
}

async function listFallbackOrders({ maxRecords = 500 } = {}) {
  const [airtable, blobs] = await Promise.allSettled([
    listOrdersByFormula("", { maxRecords }),
    listBlobOrders({ maxRecords })
  ]);
  if (blobs.status === "rejected") throw blobs.reason;
  const airtableSessions = new Set(airtable.status === "fulfilled"
    ? airtable.value.map((order) => order.stripeSessionId).filter(Boolean)
    : []);
  return blobs.value
    .filter((order) => !airtableSessions.has(order.stripeSessionId))
    .map((order) => ({ ...order, storageSource: "blob-fallback" }));
}

function renderCodeEmail(order) {
  const safeName = escapeHtml(order.clienteNome || "cliente");
  const product = escapeHtml(order.produto || "Jogo digital GalaxyGame");
  const platform = escapeHtml(order.plataforma || "Consola");
  const code = escapeHtml(order.codigo);
  const siteUrl = publicSiteUrl();
  const accountUrl = escapeHtml(`${siteUrl}/minha-conta.html`);
  const logoUrl = escapeHtml(`${siteUrl}/assets/galaxygame-email-banner.jpg`);
  const coverUrl = safeHttpUrl(order.imagem);
  const isPlayStation = /playstation|\bps\s*[45]\b/i.test(order.plataforma || order.produto || "");
  const deliveryTitle = isPlayStation ? "Dados da tua conta partilhada" : "O teu c&oacute;digo Xbox";
  const deliveryIntro = isPlayStation
    ? "Abaixo encontras os dados de acesso. Mant&eacute;m o email e a palavra-passe exatamente como foram enviados."
    : "Copia o c&oacute;digo abaixo exatamente como aparece e resgata-o na tua conta Xbox.";
  const coverCell = coverUrl ? `
    <td width="122" valign="middle" style="width:122px;padding:16px 8px 16px 16px;">
      <img src="${escapeHtml(coverUrl)}" width="104" alt="Capa de ${product}" style="display:block;width:104px;max-width:104px;height:auto;border:0;border-radius:6px;outline:none;text-decoration:none;" />
    </td>` : "";

  return `
<!doctype html>
<html lang="pt-PT">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>O teu jogo est&aacute; pronto - GalaxyGame</title>
  </head>
  <body style="margin:0;padding:0;background-color:#111116;color:#f7f5fb;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#111116" style="width:100%;margin:0;background-color:#111116;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#1c1c22" style="width:100%;max-width:600px;background-color:#1c1c22;border:1px solid #35343d;border-radius:8px;overflow:hidden;">
            <tr>
              <td align="center" bgcolor="#050507" style="padding:0;background-color:#050507;">
                <img src="${logoUrl}" width="600" alt="GalaxyGame - Jogos Digitais" style="display:block;width:100%;max-width:600px;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none;" />
              </td>
            </tr>
            <tr>
              <td align="center" bgcolor="#512b72" style="padding:21px 24px;background-color:#512b72;background-image:linear-gradient(90deg,#512b72 0%,#bd471a 100%);">
                <h1 style="margin:0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:34px;font-weight:800;">O teu jogo est&aacute; pronto! &#127918;</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 8px;color:#f7f5fb;">
                <p style="margin:0 0 12px;color:#ffffff;font-size:20px;line-height:28px;font-weight:700;">Ol&aacute;, ${safeName}!</p>
                <p style="margin:0;color:#cbc8d2;font-size:15px;line-height:24px;">O teu pedido foi preparado. Guarda este email e consulta-o sempre que precisares dos dados de acesso.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#26252d" style="width:100%;background-color:#26252d;border:1px solid #3c3a45;border-radius:7px;">
                  <tr>
                    ${coverCell}
                    <td valign="middle" style="padding:18px 18px 18px ${coverUrl ? "10px" : "18px"};">
                      <p style="margin:0 0 7px;color:#a9a6b2;font-size:12px;line-height:16px;text-transform:uppercase;">O teu jogo</p>
                      <p style="margin:0 0 9px;color:#ffffff;font-size:18px;line-height:24px;font-weight:800;">${product}</p>
                      <p style="margin:0;color:#ff8a3d;font-size:14px;line-height:20px;font-weight:700;">${platform}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#2b1735" style="width:100%;background-color:#2b1735;border:2px solid #ff6a00;border-radius:7px;">
                  <tr>
                    <td align="center" style="padding:21px 14px 23px;">
                      <p style="margin:0 0 7px;color:#ffffff;font-size:17px;line-height:23px;font-weight:800;">${deliveryTitle}</p>
                      <p style="margin:0 auto 16px;max-width:470px;color:#cfc5d7;font-size:12px;line-height:18px;">${deliveryIntro}</p>
                      <div style="margin:0;padding:16px 18px;background-color:#17121d;border:1px solid #74418f;border-radius:6px;color:#ffffff;font-family:'Courier New',Courier,monospace;font-size:${isPlayStation ? "17px" : "25px"};line-height:${isPlayStation ? "27px" : "34px"};font-weight:700;text-align:left;white-space:pre-wrap;word-break:break-word;">${code}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 28px 4px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#ff6a00" style="border-radius:6px;background-color:#ff6a00;">
                      <a href="${accountUrl}" style="display:inline-block;padding:14px 24px;color:#171117;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:18px;font-weight:800;text-decoration:none;">Ver o meu pedido</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px 12px;">
                <h2 style="margin:0 0 15px;color:#ffffff;font-size:19px;line-height:25px;">${isPlayStation ? "Como adicionar a conta e descarregar" : "Como resgatar na Xbox"}</h2>
                ${isPlayStation ? renderPlayStationEmailSteps() : renderXboxEmailSteps()}
                <p style="margin:12px 0 0;color:#aaa7b1;font-size:12px;line-height:19px;">Segue tamb&eacute;m qualquer instru&ccedil;&atilde;o adicional inclu&iacute;da nos dados de entrega. Se precisares de ajuda, fala connosco antes de alterares os dados da conta.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid #3a3941;">
                  <tr>
                    <td align="center" style="padding-top:21px;color:#aaa7b1;">
                      <p style="margin:0 0 8px;font-size:13px;line-height:20px;">Precisas de ajuda? Escreve para <a href="mailto:gamegalaxy26@gmail.com" style="color:#ff8a3d;text-decoration:none;">gamegalaxy26@gmail.com</a></p>
                      <p style="margin:0 0 8px;font-size:12px;line-height:18px;">Este &eacute; um email autom&aacute;tico, mas respondemos sempre que precisares de ajuda.</p>
                      <p style="margin:0;font-size:12px;line-height:18px;">&copy; 2026 GalaxyGame. Todos os direitos reservados.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}

function renderEmailStep(number, text) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 10px;">
      <tr>
        <td width="34" valign="top" style="width:34px;padding:0 10px 0 0;">
          <div style="width:26px;height:26px;border-radius:13px;background-color:#5a3474;color:#ffffff;font-size:13px;line-height:26px;font-weight:800;text-align:center;">${number}</div>
        </td>
        <td valign="middle" style="color:#d4d1da;font-size:14px;line-height:21px;">${escapeHtml(text)}</td>
      </tr>
    </table>`;
}

function renderPlayStationEmailSteps() {
  return [
    "Na PlayStation, escolhe Adicionar utilizador e depois Começar ou Iniciar sessão.",
    "Introduz o email e a palavra-passe enviados na caixa acima.",
    "Abre Biblioteca > Comprados, seleciona o jogo e inicia a transferência.",
    "Quando terminar, volta ao teu utilizador habitual para jogar. Não alteres o email, a palavra-passe nem as definições de segurança da conta partilhada."
  ].map((text, index) => renderEmailStep(index + 1, text)).join("");
}

function renderXboxEmailSteps() {
  return [
    "Inicia sessão na tua conta Xbox e abre a Microsoft Store.",
    "Escolhe Resgatar ou Utilizar um código.",
    "Introduz o código enviado acima exatamente como aparece.",
    "Confirma o resgate, abre a biblioteca e instala o jogo."
  ].map((text, index) => renderEmailStep(index + 1, text)).join("");
}

function publicSiteUrl() {
  const configured = process.env.URL || "https://galaxygame.pt";
  try {
    const url = new URL(configured);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "https://galaxygame.pt";
  }
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = {
  json,
  configureOrderStorage,
  escapeFormulaValue,
  listOrdersByFormula,
  findOrderByStripeSessionId,
  getOrderById,
  createOrder,
  upsertOrderByStripeSessionId,
  updateOrder,
  normalizeOrder,
  isMeaningfulOrder,
  getUserEmail,
  getUserName,
  getUserRoles,
  getConfiguredAdminEmails,
  requireAdmin,
  verifyStripeSignature,
  parseStripeProducts,
  fetchStripeProducts,
  findPersistedOrderByStripeSessionId,
  persistOrder,
  listPersistedOrders,
  getPersistedOrderById,
  updatePersistedOrder,
  sendCodeEmail,
  sendOrderConfirmationEmail,
  sendOperationalAlert,
  claimWebhookEvent,
  finishWebhookEvent,
  listFallbackOrders,
  renderCodeEmail,
  _test: {
    setOrdersStoreFactory(factory) {
      ordersStoreFactory = factory || defaultOrdersStoreFactory;
    },
    setRetryDelay(factory) {
      retryDelay = factory || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    }
  }
};
