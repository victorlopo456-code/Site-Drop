# Auditoria do site DROP — 03/10/2026

Foram revisados o código da aplicação, as migrations do Supabase, as dependências, as páginas públicas em produção e os endpoints acessíveis sem autenticação. As correções da aplicação foram enviadas à branch `main` no commit `202434d` e publicadas em https://drop-skate-shop.vercel.app, deployment `dpl_H9wQaMYianqwdZQj96DgX78tePQE` (READY).

**Migration aplicada pelo usuário no SQL Editor do Supabase**, com execução bem-sucedida informada nesta sessão. As verificações posteriores no banco real confirmaram: tabela `order_admin_notes` disponível (HTTP 200), nenhum pedido com `admin_notes` preenchido no campo antigo (contagem exata 0) e acesso anônimo às notas privadas recusado (HTTP 401, código `42501`). O arquivo aplicado é `supabase/migrations/20261003010000_audit_access_controls.sql`.

O painel publicado passa a usar a tabela privada de notas sem exigir novo deploy. Os testes de policies, triggers e reservas concorrentes passaram anteriormente em PostgreSQL temporário; essas regras não foram reexercitadas com contas reais ou alterações de pedidos em produção.

## Falhas confirmadas e correções preparadas

| Prioridade | Falha | Correção e evidência |
| --- | --- | --- |
| Alta | Administrador com sessão sem segundo fator podia ler e atualizar solicitações de devolução nas policies antigas. | As policies agora usam `is_admin()`, que exige `aal2`. Reprodução e bloqueio testados em PostgreSQL temporário. |
| Alta | Notas internas dos pedidos ficavam na tabela `orders`, legível pelo próprio cliente. | Migration transfere as notas para `order_admin_notes`, com RLS que exige admin e MFA, e limpa o campo antigo. Painel passa a ler e salvar nessa tabela privada. Testes confirmam preservação das notas e bloqueio para clientes/admin sem MFA. |
| Alta | Atualizações de pagamentos não protegiam adequadamente pedidos aprovados/reembolsados. Confirmações repetidas podiam resetar um pedido enviado para “em preparação”. A sincronização do retorno não restaurava o estoque em reembolsos. | Proteção compartilhada contra regressão de estado e troca de pagamento confirmado; atualização do andamento só nos estados iniciais; restauração idempotente em reembolsos; trigger protege transições concorrentes. Testes de estados e triggers passaram. |
| Média | Cliente podia inserir uma avaliação com `status='approved'` e transferir uma avaliação para produto não comprado. | Inserção exige `pending`; trigger impede mudança de identidade/produto/autor. As duas brechas foram reproduzidas antes da migration e bloqueadas depois. |
| Média | Cliente podia enviar uma solicitação de devolução já aprovada, com resposta administrativa. | Inserção exige `requested` e resposta administrativa vazia. Reprodução e bloqueio testados. |
| Média | Limites de cupons consideravam somente pedidos pagos e podiam ser ultrapassados criando múltiplos checkouts antes de pagar. Erros nas consultas de contagem eram ignorados. | Trigger reserva usos em pedidos pendentes por até 48 horas e serializa inserções pelo cupom. Erros de contagem passam a bloquear a validação. Testados limite reservado e liberação após cancelamento. |
| Média | Parte dos limites contra abuso usava identificadores enviados pelo navegador, que o próprio solicitante podia trocar. Validação pública de cupons não tinha limite. | Limite adicional baseado no IP fornecido pela Vercel, armazenado como HMAC; limites para validação de cupom, frete, analytics, recuperação de carrinho e avisos de estoque. |
| Média | Recuperação de carrinho aceitava nomes e preços enviados pelo solicitante para mensagens da loja. | Itens passam a ser reconstruídos a partir do catálogo; usuário autenticado usa seu e-mail validado pela autenticação. |
| Média | Verificação financeira não recusava explicitamente valores ausentes/não finitos e aceitava divergência de até um centavo. | Validação exige valor finito, moeda BRL, pedido correspondente e igualdade em centavos. Testes passaram. |
| Funcional | Promoções agendadas eram recalculadas no navegador, enquanto checkout e frete liam o preço armazenado, potencialmente desatualizado. | Cálculo compartilhado de preços no catálogo, checkout e cotação de frete. Carrinho acompanha atualizações de preço. Testes cobrem início e término de promoção. |
| Funcional | Aplicar o desconto proporcional e arredondar cada preço unitário podia alterar o desconto final em compras com muitas unidades. | Distribuição em centavos, com divisão dos itens enviados ao Mercado Pago quando necessário. Testes confirmam total exato e frete integral. |
| Funcional | Webhook retornava 500 para JSON `null`; timestamps em milissegundos eram tratados como segundos. Limite de corpo era verificado após leitura completa. | JSON estruturalmente inválido é recusado; assinatura aceita segundos e milissegundos mantendo proteção contra replay; leitura limita bytes enquanto recebe o corpo, também no upload administrativo. |
| Funcional | A prévia local procurava `dist/server/server.js`, mas o projeto gera a saída da Vercel, retornando 500. A CSP estrita das alterações locais bloqueava estilos de notificações e janelas. | Prévia usa a função e os arquivos estáticos do build real. CSP permite hashes exatos dos estilos de Sonner/Vaul e fornece nonce às janelas Radix, sem liberar estilos arbitrários. |

A prioridade representa o impacto observado no código e nos testes locais, não uma pontuação CVSS nem evidência de exploração real.

## Verificações realizadas

- Após a publicação do commit `202434d`, as **20 verificações de páginas em produção** passaram em desktop/celular, sem erros de JavaScript, imagens quebradas ou largura excedente. O carrinho também passou nas duas larguras. A primeira rodada sofreu timeouts e erros de conexão HTTP/2 no navegador local; a repetição com HTTP/1.1 passou nas mesmas rotas. Isso não demonstra ausência de problemas HTTP/2 em outros ambientes.

- `npm audit --json --package-lock-only`: **0 vulnerabilidades conhecidas** no lockfile auditado. Isso não comprova ausência de vulnerabilidades ainda não catalogadas.
- Versões instaladas sincronizadas com o lockfile: `@tanstack/react-start@1.168.60` e `@tanstack/start-server-core@1.169.39`.
- **7 testes automatizados** de preços, pagamentos, assinaturas, limites de corpo e cálculo exato de cupons passaram.
- **21 verificações SQL** em PGlite/PostgreSQL temporário passaram, incluindo cinco reproduções das policies antigas e a validação da migration real. O bootstrap simula as funções de autenticação do Supabase e usuários distintos; não acessa o banco real.
- **8 testes dos endpoints compilados** passaram: JSON inválido/null, corpo excessivo, identificador inválido, pagamento sem assinatura, upload sem sessão e tarefas sem segredo. Credenciais falsas e bloqueio de `fetch` garantem que os testes não acessam serviços externos. Todas as respostas verificadas tinham `no-store` e CSP.
- **20 verificações no navegador em produção**: 10 páginas em desktop (1366 px) e celular (390 px), sem erros de JavaScript registrados, imagens quebradas ou largura excedendo a tela. Páginas: início, produtos, promoções, login, admin sem login, checkout sem login, conta sem login, contato, privacidade e trocas/devoluções.
- **20 verificações adicionais no navegador sobre o build corrigido local** passaram nas mesmas páginas e larguras, sem erros de JavaScript, bloqueios de estilos, imagens quebradas ou largura excedendo a tela. As ações de abrir carrinho, adicionar, aumentar, diminuir e remover itens também passaram em desktop e celular.
- **12 rotas HTTP** em produção responderam 200, incluindo robots, sitemap e service worker. Páginas HTML tinham CSP; login, admin, conta e checkout tinham `Cache-Control: no-store`.
- Consultas com a chave pública, sem usuário, a 10 tabelas privadas não retornaram registros. Algumas tabelas recusaram a consulta com erro de permissão; outras retornaram lista vazia. Lista vazia isoladamente não comprova todas as regras de acesso.
- Após a publicação, os dois endpoints de tarefas agendadas recusaram chamadas sem segredo com HTTP 401. O webhook recusou pagamento sem assinatura com 401 e passou a responder 400 para JSON `null`, corrigindo o erro 500 anterior.
- `.env.local` não está versionado; apenas `.env.example` aparece entre arquivos de ambiente rastreados. Busca de padrões comuns de chaves privadas/tokens em `src`, `public` e `supabase` não encontrou correspondências.
- `.vercelignore` agora exclui explicitamente arquivos de ambiente, configurações locais sensíveis, diretórios temporários do Supabase e artefatos gerados dos uploads de código.
- TypeScript, build local e compilação de produção na Vercel passaram após as correções.
- O lint completo tinha pendências preexistentes de formatação e avisos de React. A auditoria não reformata indiscriminadamente arquivos fora das correções. Os arquivos alterados foram formatados.
- Lint direcionado aos arquivos das correções passou sem erros; `cart.tsx` mantém um aviso preexistente sobre Fast Refresh.

Para repetir os testes locais: `node --test tests/security.test.mjs`, `npm run build`, `node tests/built-endpoints.mjs` e `npm run preview`. Os testes SQL usam `@electric-sql/pglite`; a variável `PGLITE_MODULE_PATH` pode apontar para uma instalação isolada dessa ferramenta, seguida de `node tests/database-security.mjs`.

## Aplicação das correções

1. Fazer backup do banco e revisar a migration `supabase/migrations/20261003010000_audit_access_controls.sql`.
2. Aplicar a migration em ambiente de teste e validar com cliente, outro cliente e administrador com/sem MFA.
3. Publicar a aplicação e aplicar a migration de forma coordenada. A nova tabela de notas é necessária para salvar notas internas no painel; a migration bloqueia gravações de notas no campo antigo. Evitar uso administrativo desse campo durante a troca de versão.
4. Validar em sandbox do Mercado Pago uma compra com promoção e cupom, repetição de webhook, reembolso e retorno de pagamento. Conferir preço dos produtos, desconto, frete, status, estoque e notas internas.
5. Repetir os testes de produção após a atualização. As novas proteções de banco só estarão ativas após a migration.

O novo limite de cupons reserva usos durante pedidos pendentes, por até 48 horas; cancelamentos e falhas liberam a reserva. Compras cujo total final seja zero são recusadas antes de criar o pedido no Mercado Pago e precisam de um fluxo específico caso a loja deseje aceitá-las.

## Limites desta auditoria

Não houve compra, cobrança, reembolso, envio de e-mail, criação de usuários ou alteração de dados reais como parte dos testes. Não foi exercitado o painel com credenciais reais, nem feita uma transação completa no sandbox do Mercado Pago. A revisão das policies usa as migrations do repositório; não foi extraída a configuração integral do banco em produção. Testes com navegador consultam páginas e podem disparar as métricas e sincronizações anônimas que a própria aplicação faz ao navegar.

Inscrições anônimas em avisos por e-mail continuam possíveis; o limite por IP reduz abuso, mas não verifica que o solicitante controla o endereço informado. Verificação de e-mail/duplo opt-in e proteção adicional contra bots são melhorias restantes para esses fluxos. Não foi realizada auditoria de conformidade legal, nem análise de infraestrutura externa ao projeto.

Não é possível afirmar que todo o site está livre de falhas a partir destas verificações.

## Referências técnicas

- [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): restrições de acesso por linha.
- [Supabase — privilégios por coluna](https://supabase.com/docs/guides/database/postgres/column-level-security): uma policy de linha não esconde as colunas internas da mesma linha.
- [Mercado Pago — assinatura de webhook](https://www.mercadopago.com.br/developers/en/docs/mp-point/notifications): formato da assinatura e exemplo de timestamp em milissegundos.
- [Vercel — headers de requisição](https://vercel.com/docs/headers/request-headers): origem dos headers de IP usados na proteção contra abuso.
