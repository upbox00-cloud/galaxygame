/*
 * Landing page temporária do GTA VI (produto.html?id=gta-vi-ps5).
 *
 * Desativar (restaura o layout clássico, sem apagar código):
 *   enabled: false
 * version: 5 -> V5 (polimento); 4 -> V4 (direção de arte); 3 -> V3 (Vice City); 2 -> V2 (3D + scroll); 1 -> V1 (sem Three.js).
 * Testes rápidos sem editar este ficheiro:
 *   produto.html?id=gta-vi-ps5&landing=0   -> força layout clássico
 *   produto.html?id=gta-vi-ps5&landing=v1   -> força V1
 *   produto.html?id=gta-vi-ps5&landing=v2   -> força V2
 *   produto.html?id=gta-vi-ps5&landing=lite -> força versão leve (sem Lenis/tilt/parallax)
 *
 * offerConfirmed: true  -> CTAs acionam o checkout existente (criar-checkout valida o preço no servidor).
 * offerConfirmed: false -> CTAs passam a "Consultar disponibilidade" (abre o chat) e não iniciam compra.
 * Nota: o servidor (criar-checkout) não lê esta flag; ela só controla esta landing.
 */
window.GALAXY_LANDING_GTA6 = {
  enabled: true,
  version: 5,
  fallbackReleased: "2026-11-19", // espelha produto.js (fallbackProducts); a landing aparece já, antes do catálogo carregar
  productId: "gta-vi-ps5",
  offerConfirmed: true,
  fallbackPriceEUR: 57.99
};
