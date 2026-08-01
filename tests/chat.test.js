const test = require("node:test");
const assert = require("node:assert/strict");
const { _test } = require("../netlify/functions/chat");
const { handler } = require("../netlify/functions/chat");

const catalog = [
  { id: "a-ps5", nome: "Jogo A - PS5 Mídia Digital", plataforma: "PlayStation 5", precoVendaEUR: 29.99, precoOriginalEUR: 59.99, genres: ["Action"], added: 900 },
  { id: "a-xbox", nome: "Jogo A Xbox Series", plataforma: "Xbox Series", precoVendaEUR: 19.99, precoOriginalEUR: 39.99, genres: ["Action"], added: 800 },
  { id: "b-ps5", nome: "Jogo B", plataforma: "PlayStation 5", precoVendaEUR: 45, precoOriginalEUR: 50, genres: ["RPG"], added: 100 }
];

test("valida e limita o histórico", () => {
  assert.equal(_test.validateMessages([{ role: "user", content: "Olá" }]).messages.length, 1);
  assert.ok(_test.validateMessages([{ role: "assistant", content: "Olá" }]).error);
  assert.ok(_test.validateMessages([{ role: "user", content: "x".repeat(1201) }]).error);
});

test("filtra por plataforma e orçamento", () => {
  const result = _test.searchProducts(catalog, "Quero um jogo para PS5 até 30 euros");
  assert.deepEqual(result.map((item) => item.id), ["a-ps5"]);
});

test("não expõe campos internos do produto", () => {
  const publicItem = _test.publicProduct({ ...catalog[0], margemReal: "50%", custoFornecedorEUR: 10 });
  assert.equal(publicItem.margemReal, undefined);
  assert.equal(publicItem.custoFornecedorEUR, undefined);
  assert.equal(publicItem.url, "produto.html?id=a-ps5");
});

test("a função rejeita pedidos inválidos sem chamar a API", async () => {
  const wrongMethod = await handler({ httpMethod: "GET", headers: {} });
  assert.equal(wrongMethod.statusCode, 405);
  const emptyChat = await handler({ httpMethod: "POST", headers: {}, body: "{}" });
  assert.equal(emptyChat.statusCode, 400);
});

test("converte o histórico para os papéis esperados pelo Gemini", () => {
  const contents = _test.toGeminiContents([
    { role: "user", content: "Olá" },
    { role: "assistant", content: "Como posso ajudar?" }
  ]);
  assert.deepEqual(contents, [
    { role: "user", parts: [{ text: "Olá" }] },
    { role: "model", parts: [{ text: "Como posso ajudar?" }] }
  ]);
});
