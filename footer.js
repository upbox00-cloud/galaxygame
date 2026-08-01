(() => {
  const footer = document.querySelector(".site-footer, .legal-footer");
  if (!footer) return;

  footer.classList.add("enhanced-footer");
  footer.innerHTML = `
    <div class="footer-brand">
      <a class="footer-logo-link" href="index.html" aria-label="GalaxyGame - pagina inicial">
        <img class="footer-logo" src="assets/galaxygame-header-logo.webp" alt="GalaxyGame" loading="lazy">
      </a>
      <p>Jogos digitais para PlayStation 4, PlayStation 5, Xbox One e Xbox Series X|S, com compra clara e apoio pensado para jogadores em Portugal.</p>
    </div>

    <nav class="footer-links" aria-label="Links do rodape">
      <a href="como-funciona.html">Como funciona</a>
      <a href="termos.html">Termos e Condi&ccedil;&otilde;es</a>
      <a href="privacidade.html">Privacidade</a>
      <a href="cookies.html">Cookies</a>
      <a href="reembolsos.html">Entregas e reembolsos</a>
    </nav>

    <section class="footer-trust" aria-label="Selos de confianca">
      <h2>Compra com confian&ccedil;a</h2>
      <div class="trust-seals">
        <span class="trust-seal">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1Zm2 0h6V8a3 3 0 0 0-6 0v2Z"/></svg>
          <span><strong>Pagamento 100% seguro</strong><small>Processado por parceiros de pagamento.</small></span>
        </span>
        <span class="trust-seal">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 3v.4l8 4.6 8-4.6V8l-8 4.6L4 8Z"/></svg>
          <span><strong>Conta GalaxyGame + email</strong><small>Ap&oacute;s confirma&ccedil;&atilde;o do pagamento, entrega em at&eacute; 10 minutos.</small></span>
        </span>
        <span class="trust-seal">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 5v6c0 5-3.3 9.4-8 11-4.7-1.6-8-6-8-11V5l8-3Zm3.7 7.3-4.6 4.6-2-2-1.4 1.4 3.4 3.4 6-6-1.4-1.4Z"/></svg>
          <span><strong>Compra protegida</strong><small>Dados e instru&ccedil;&otilde;es tratados com cuidado.</small></span>
        </span>
        <span class="trust-seal">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>
          <span><strong>Apoio ao cliente</strong><small>Ajuda antes e depois da compra.</small></span>
        </span>
      </div>
    </section>

    <section class="footer-payments" aria-label="Metodos de pagamento aceites">
      <h2>M&eacute;todos de pagamento aceites</h2>
      <!-- Mostrar estes icones apenas se estes metodos estiverem de facto ativados na conta Stripe do site. -->
      <img class="payment-strip" src="assets/payments.webp" alt="M&eacute;todos de pagamento: Visa, Mastercard, Multibanco, MB WAY, PayPal, Klarna, Apple Pay e Google Pay" loading="lazy">
    </section>

    <p class="footer-copy">&copy; 2026 GalaxyGame. Todos os direitos reservados.</p>
  `;
})();
