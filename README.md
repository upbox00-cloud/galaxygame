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

O historico de pedidos ainda nao esta ligado ao Stripe. A pagina `minha-conta.html` mostra apenas os dados de identidade e um estado vazio em "Meus Pedidos".

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

O modelo predefinido e `gemini-2.5-flash`, com historico e tamanho de resposta limitados para controlar custos. Opcionalmente, pode definir `GEMINI_MODEL` no painel do Netlify sem alterar o codigo.

### Seguranca e limites

- Cada mensagem aceita no maximo 1200 caracteres e o servidor usa apenas as 8 mensagens mais recentes.
- Existe um limite basico de 12 pedidos por IP a cada 10 minutos. Como e um limite em memoria por instancia serverless, um site com trafego elevado deve substitui-lo por Netlify Blobs, Redis ou outro armazenamento partilhado.
- Existe tambem um teto local de 500 chamadas validas por dia em cada instancia da Function. Este contador reinicia diariamente e sempre que a instancia e recriada ou o site recebe um novo deploy; nao representa um limite global rigoroso entre varias instancias.
- A conversa fica apenas no `sessionStorage` do navegador e desaparece ao terminar a sessao. Nao se deve enviar palavras-passe, dados bancarios ou outros dados sensiveis.
- O checkout atual ainda nao esta ligado a um processador de pagamento; a assistente foi instruida a comunicar isso sem inventar metodos disponiveis.

Execute os testes locais com `npm test`.
