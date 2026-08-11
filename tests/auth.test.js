const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const authSource = fs.readFileSync(path.join(root, "scripts", "auth.js"), "utf8");
const recoverySource = fs.readFileSync(path.join(root, "scripts", "recovery-token.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("auth initialization and controls are idempotent", () => {
  assert.match(authSource, /if \(window\.__GalaxyGameAuthReady\) return;/);
  assert.match(authSource, /controls\.dataset\.authEnhanced === "true"/);
  assert.match(authSource, /button\.innerHTML = `\$\{userIconSvg\}/);
  assert.doesNotMatch(authSource, /insertAdjacentHTML|appendChild\(userIcon/);
});

test("hidden auth states cannot be overridden by icon display styles", () => {
  assert.match(stylesSource, /\.auth-controls \[hidden\][\s\S]*display: none !important;/);
  assert.match(stylesSource, /\.auth-user\[hidden\]/);
  assert.match(stylesSource, /\.auth-dropdown\[hidden\]/);
});

test("account menu is controlled only by click and closes both dropdown types", () => {
  assert.match(authSource, /\[data-auth-dropdown\], \[data-auth-login-dropdown\]/);
  assert.match(authSource, /toggleDropdown\(button, dropdown\)/);
  assert.doesNotMatch(authSource, /pointerenter|pointerleave/);
});

test("mobile return from Identity restores interactions and refreshes the user", () => {
  assert.match(authSource, /identity\.on\("close", finishIdentityModal\)/);
  assert.match(authSource, /window\.addEventListener\("pageshow"/);
  assert.match(authSource, /identity\.currentUser\?\.\(\)/);
  assert.match(authSource, /refreshPersistedSession\(currentUser\)/);
  assert.match(authSource, /visibilitychange/);
  assert.match(stylesSource, /\.site-header \.header-actions[\s\S]*pointer-events: auto !important;/);
  assert.match(stylesSource, /\.site-header \.auth-user-button[\s\S]*touch-action: manipulation;/);
});

test("saved sessions are refreshed without storing customer passwords", () => {
  assert.match(authSource, /identity\.refresh\(\)/);
  assert.match(authSource, /refreshPersistedSession\(user, true\)/);
  assert.match(authSource, /autocomplete", "username"/);
  assert.match(authSource, /"current-password"/);
  assert.doesNotMatch(authSource, /localStorage\.setItem\([^\n]*(password|senha)/i);
});

test("login handler restaura a página diretamente, sem depender só do evento close", () => {
  // O widget do Netlify Identity nem sempre dispara "close" depois de um
  // login bem sucedido (o modal já se fecha sozinho e identity.close() vira
  // um no-op), o que deixava overflow/position do body presos e a página
  // inteira sem responder a cliques. O handler de "login" tem de chamar
  // restorePageInteractions() diretamente, sem depender só do listener de "close".
  const loginHandlerMatch = authSource.match(/identity\.on\("login", \(user\) => \{[\s\S]*?\n {2}\}\);/);
  assert.ok(loginHandlerMatch, "handler de login não encontrado");
  const loginHandler = loginHandlerMatch[0];
  assert.match(loginHandler, /finishIdentityModal\(\);/);
});

test("restorePageInteractions limpa overflow, position, width e pointer-events do body/html", () => {
  const fnMatch = authSource.match(/function restorePageInteractions\(\)[\s\S]*?\n {2}\}/);
  assert.ok(fnMatch, "restorePageInteractions não encontrada");
  const fn = fnMatch[0];
  ["overflow", "position", "width", "pointer-events"].forEach((prop) => {
    assert.match(fn, new RegExp(`removeProperty\\("${prop}"\\)`), `deveria remover a propriedade "${prop}"`);
  });
});

test("stale Identity overlay is removed after login and mobile return", () => {
  assert.match(authSource, /querySelectorAll\("\.netlify-identity-widget"\)/);
  assert.match(authSource, /identityModalOpen = false/);
  assert.match(authSource, /finishIdentityModal\(\)/);
  assert.match(authSource, /window\.setTimeout\(restorePageInteractions, 600\)/);
  assert.match(authSource, /"height", "touch-action", "pointer-events"/);
});

test("password recovery token is preserved before Identity initializes", () => {
  assert.match(recoverySource, /get\("recovery_token"\)/);
  assert.match(recoverySource, /sessionStorage\.setItem\("galaxygame_recovery_token", token\)/);
  assert.match(recoverySource, /history\.replaceState/);
});

test("password recovery validates the token and updates only the password", () => {
  assert.match(authSource, /mountPasswordRecovery\(recoveryToken\)/);
  assert.match(authSource, /GalaxyGameIdentity\.recoverPassword\(token, password\)/);
  assert.match(authSource, /identity\.gotrue\.login\(recoveredUser\.email, password, true\)/);
  assert.match(authSource, /falha ao recuperar conta e guardar nova palavra-passe/);
  assert.match(stylesSource, /\.password-recovery-overlay[\s\S]*z-index: 5000;/);
});

test("all primary pages load the cache-busted auth script once", () => {
  const pages = [
    "index.html",
    "catalogo.html",
    "produto.html",
    "carrinho.html",
    "minha-conta.html",
    "painel-pedidos.html"
  ];

  pages.forEach((page) => {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const matches = html.match(/scripts\/auth\.js\?v=20260811-1/g) || [];
    assert.equal(matches.length, 1, `${page} deve carregar auth.js exatamente uma vez`);
    assert.equal(
      (html.match(/scripts\/identity-modern\.js\?v=20260809-1/g) || []).length,
      1,
      `${page} deve carregar o cliente moderno do Netlify Identity`
    );
    assert.equal(
      (html.match(/scripts\/recovery-token\.js\?v=20260808-1/g) || []).length,
      1,
      `${page} deve preservar o recovery token antes do widget`
    );
  });
});
