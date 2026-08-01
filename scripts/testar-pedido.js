const fs = require("fs");
const path = require("path");

loadLocalEnv();

const AIRTABLE_TABLE = "Pedidos";
const AIRTABLE_API = "https://api.airtable.com/v0";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Define ${name} no ambiente ou num ficheiro .env local antes de testar.`);
  }
  return value;
}

async function main() {
  const token = requiredEnv("AIRTABLE_TOKEN");
  const baseId = requiredEnv("AIRTABLE_BASE_ID");
  const now = new Date();
  const sampleEmail = process.env.TEST_ORDER_EMAIL || "gamegalaxy26@gmail.com";

  const response = await fetch(`${AIRTABLE_API}/${baseId}/${encodeURIComponent(AIRTABLE_TABLE)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      records: [{
        fields: {
          ClienteEmail: sampleEmail,
          ClienteNome: "Cliente Teste",
          Produto: "Pedido teste GalaxyGame",
          Plataforma: "PlayStation 5",
          ValorPagoEUR: 9.99,
          Status: "Aguardando codigo",
          Codigo: "",
          DataCompra: now.toISOString(),
          StripeSessionId: `test_${now.getTime()}`
        }
      }]
    })
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.error?.message || `Airtable respondeu ${response.status}`);
  }

  console.log("Pedido teste criado no Airtable:");
  console.log(`- ID: ${data.records?.[0]?.id}`);
  console.log(`- ClienteEmail: ${sampleEmail}`);
  console.log("- Status: Aguardando codigo");
}

function loadLocalEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

main().catch((error) => {
  console.error("[Teste pedido]", error.message);
  process.exitCode = 1;
});
