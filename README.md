# GalaxyGame

Projeto inicial de loja de jogos digitais inspirado no layout enviado, com catalogo focado apenas em PlayStation 4, PlayStation 5, Xbox One e Xbox Series.

## Como abrir

Execute o projeto num servidor local ou publique-o no Netlify. Algumas funcionalidades, como o Netlify Identity, precisam do site publicado para funcionar completamente.

## Estrutura

- `index.html`: conteudo da pagina
- `styles.css`: visual responsivo
- `script.js`: listas de jogos e filtro de plataforma
- `assets/hero-console-store.png`: banner criado para o projeto

## Netlify Identity

O widget e a integracao de autenticação ja estao incluidos no projeto, mas o servico precisa ser ativado manualmente depois do deploy:

1. Abra o site no painel do Netlify.
2. Aceda a `Site configuration` (ou `Site settings`) > `Identity`.
3. Selecione `Enable Identity`.
4. Em `Registration preferences`, escolha se qualquer cliente pode criar conta ou se os registos exigem convite.
5. Confirme os modelos de email de confirmacao, recuperacao de palavra-passe e convite.
6. Em `External providers`, pode ativar Google ou outros fornecedores. Alguns fornecedores podem pedir um Client ID e Client Secret criados no respetivo painel.
7. Confirme que o URL publicado e os URLs de redirecionamento autorizados estao corretos.

## Pagamentos e gestao de pedidos

O fluxo de pedidos usa Stripe Checkout, Airtable, Netlify Identity e Resend:

1. O cliente inicia sessao e finaliza o carrinho no Stripe.
2. O webhook assinado cria o pedido na tabela `Pedidos` do Airtable sem duplicar o `StripeSessionId`.
3. Um administrador abre `painel-pedidos.html`, cola o codigo e marca o pedido como enviado.
4. O codigo passa a aparecer em `Minha Conta > Meus Pedidos` e segue por email atraves do Resend.

Os precos enviados ao Stripe sao sempre lidos de `data/catalog-lite.json` no servidor. Valores enviados pelo navegador nao sao aceites como fonte de verdade.

### Variaveis de ambiente

Configure em `Site configuration > Environment variables` no Netlify e aplique-as a Functions/Runtime:

- `AIRTABLE_TOKEN`: token pessoal com acesso de leitura e escrita a base de pedidos.
- `AIRTABLE_BASE_ID`: ID da base que contem a tabela `Pedidos`.
- `ADMIN_EMAILS`: emails autorizados a abrir o painel, separados por virgula.
- `RESEND_API_KEY`: chave do Resend usada apenas pela Function de email.
- `RESEND_FROM_EMAIL`: remetente verificado, por exemplo `GalaxyGame <pedidos@galaxygame.pt>`.
- `STRIPE_SECRET_KEY`: chave secreta Stripe usada para criar Checkout Sessions e consultar os produtos pagos.
- `STRIPE_WEBHOOK_SECRET`: segredo de assinatura `whsec_...` criado pelo endpoint do webhook.
- `TEST_ORDER_EMAIL`: apenas local e opcional; email que recebe o pedido criado por `npm run testar:pedido`.

Depois de alterar variaveis no Netlify, inicie um novo deploy. Nunca coloque valores reais em `.env.example`, HTML ou JavaScript do navegador.

### Airtable

A tabela deve chamar-se `Pedidos` e conter os campos `ClienteEmail`, `ClienteNome`, `Produto`, `Plataforma`, `ValorPagoEUR`, `Status`, `Codigo`, `DataCompra` e `StripeSessionId`. O campo `Status` deve aceitar `Aguardando codigo`, `Enviado` e `Cancelado`. Use texto longo para `Codigo`, porque este campo tambem pode guardar dados de uma conta e instrucoes de acesso. Para manter no Airtable o retrato comercial do pedido, adicione tambem `Fornecedor` (texto), `CustoFornecedorBRL` (numero/moeda) e `LinkFornecedor` (URL). Mesmo sem estes campos opcionais, a copia persistente do pedido no Netlify Blobs conserva esta informacao.

### Fornecedores e preco concorrente

A Alpha Games e importada automaticamente pelo scraper. Quando a pagina anuncia desconto Pix, `precoPixBRL` passa a ser o custo usado; o preco sem Pix fica guardado separadamente para auditoria. Os custos manuais da TCA Games e os precos do concorrente ficam em `netlify/functions/_data/produtos-comerciais.json`, indexados pelo mesmo `id` do catalogo.

Para adicionar a TCA a outro produto, crie a entrada `fornecedores.tca` com `nome`, `custoPixBRL` e `url`. O campo opcional `precoConcorrenteEUR` define a referencia manual em euros. Ao executar `npm run gerar:precos`, o motor compara os custos Pix validos da Alpha e da TCA, escolhe sempre o menor e atualiza o catalogo comercial privado usado pelo checkout e pelo painel administrativo.

### Webhook Stripe

No Stripe Workbench/Developers, crie um endpoint para:

`https://SEU-DOMINIO/.netlify/functions/stripe-webhook`

Selecione os eventos `checkout.session.completed` e `checkout.session.async_payment_succeeded`. Copie o signing secret do endpoint para `STRIPE_WEBHOOK_SECRET`. O webhook recusa eventos quando este segredo nao esta configurado ou quando a assinatura tem mais de cinco minutos.

Os meios de pagamento apresentados ao cliente sao controlados pela configuracao do Stripe. Ative apenas os meios que estejam disponiveis para a conta e para Portugal.

O Checkout desativa o Adaptive Pricing para apresentar e cobrar sempre em EUR. Por defeito, solicita Cartao (incluindo Apple Pay e Google Pay quando elegiveis), Link, MB WAY, Multibanco, Klarna e PayPal. Ative estes meios em `Stripe Dashboard > Settings > Payment methods`; o Stripe mostra apenas os que forem elegiveis para a conta, o valor e o dispositivo do cliente. A lista pode ser ajustada com `STRIPE_PAYMENT_METHOD_TYPES`. Scalapay esta em private preview e nao aceita atualmente contas comerciais sediadas em Portugal, por isso nao faz parte da configuracao predefinida.

### Administrador

O painel esta disponivel em `/admin` e em `painel-pedidos.html`. Quando nao existe uma sessao, a pagina envia o utilizador para o login e regressa ao painel depois da autenticacao.

Configure `ADMIN_EMAILS` no Netlify com o email confirmado do proprietario, por exemplo `proprietario@example.com`. Quando esta variavel existe, apenas os emails dessa lista sao aceites pelas Functions administrativas. Se a variavel estiver vazia, o sistema usa como alternativa a role `admin` de `app_metadata.roles`, que o cliente nao pode editar. Depois de alterar o email ou a role, termine a sessao e volte a entrar para renovar o JWT.

O painel permite pesquisar, filtrar, cancelar, reabrir e entregar pedidos. Ao enviar, a Function guarda `Codigo`, muda `Status` para `Enviado`, envia o email pelo Resend e disponibiliza os mesmos dados em `Minha Conta > Meus Pedidos`. Nenhuma chave do Airtable ou Resend e enviada ao navegador.

### Resend

Adicione `galaxygame.pt` em `Domains` no Resend, publique no DNS todos os registos fornecidos e aguarde o estado `Verified`. Depois configure `RESEND_FROM_EMAIL` com um endereco desse dominio. Enquanto o dominio nao estiver verificado, o envio com `pedidos@galaxygame.pt` pode ser recusado.

### Pedido de teste

Crie um `.env` local com `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` e, opcionalmente, `TEST_ORDER_EMAIL`. Depois execute:

```powershell
npm run testar:pedido
```

O script cria um pedido pendente com um `StripeSessionId` iniciado por `test_`. Use somente uma base de teste ou apague o registo quando terminar.

Para visualizar o email sem enviar nada, execute:

```powershell
npm run preview:email
```

Abra `debug/email-entrega-preview.html` no navegador. O ficheiro usa dados ficticios e nao contacta Resend, Airtable ou Stripe.

## Assistente virtual de vendas

A assistente usa a API Google Gemini atraves de `netlify/functions/chat-ia.js`. A chave nunca e enviada para o navegador: fica apenas nas variaveis de ambiente do Netlify. A funcao pesquisa primeiro os catalogos locais e envia ao modelo somente os produtos relevantes para a pergunta.

### Configuracao local

1. Instale as dependencias com `npm install`.
2. Crie um ficheiro `.env` local a partir de `.env.example`.
3. Defina `GEMINI_API_KEY` no `.env`. Nunca publique nem envie esta chave para o Git.
4. Inicie o ambiente do Netlify com `npm run dev`.
5. Abra `http://localhost:8890`.

Abrir os HTML diretamente ou usar apenas o Live Server nao executa a Netlify Function. Nesse caso, o widget aparece, mas nao consegue obter respostas da API.

### Configuracao no Netlify

1. No painel do site, abra `Site configuration` > `Environment variables`.
2. Crie a variavel `GEMINI_API_KEY` e cole uma chave criada no Google AI Studio.
3. Restrinja o acesso a chave conforme as opcoes disponiveis na conta e nunca a coloque em JavaScript do frontend.
4. Volte a fazer deploy para a funcao receber a nova variavel.

O modelo predefinido e `gemini-3.5-flash-lite`, com fallback configurado e limites de historico e resposta para controlar custos. Opcionalmente, pode definir `GEMINI_MODEL` no painel do Netlify sem alterar o codigo.

### Seguranca e limites

- Cada mensagem aceita no maximo 1200 caracteres e o servidor usa apenas as 8 mensagens mais recentes.
- Existe um limite basico de 12 pedidos por IP a cada 10 minutos. Como e um limite em memoria por instancia serverless, um site com trafego elevado deve substitui-lo por Netlify Blobs, Redis ou outro armazenamento partilhado.
- Existe tambem um teto local de 500 chamadas validas por dia em cada instancia da Function. Este contador reinicia diariamente e sempre que a instancia e recriada ou o site recebe um novo deploy; nao representa um limite global rigoroso entre varias instancias.
- A conversa fica apenas no `sessionStorage` do navegador e desaparece ao terminar a sessao. Nao se deve enviar palavras-passe, dados bancarios ou outros dados sensiveis.
- O checkout atual ainda nao esta ligado a um processador de pagamento; a assistente foi instruida a comunicar isso sem inventar metodos disponiveis.

Execute os testes locais com `npm test`.
