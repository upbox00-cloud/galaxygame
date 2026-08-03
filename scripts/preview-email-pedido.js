const fs = require("node:fs");
const path = require("node:path");
const { renderCodeEmail } = require("../netlify/functions/_orders");

process.env.URL ||= "https://galaxygamestore-pt.netlify.app";

const previewOrder = {
  clienteNome: "Joana Martins",
  produto: "Grand Theft Auto VI - Edição Digital",
  plataforma: "PlayStation 5",
  codigo: "GG26-DEMO-7X9P-K4LM",
  imagem: `${process.env.URL.replace(/\/$/, "")}/assets/gta-vi-original.webp`
};

const outputDirectory = path.resolve(__dirname, "..", "debug");
const outputFile = path.join(outputDirectory, "email-entrega-preview.html");
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputFile, renderCodeEmail(previewOrder), "utf8");

console.log(`Preview criado em: ${outputFile}`);
console.log("Este comando nao envia emails nem contacta servicos externos.");
