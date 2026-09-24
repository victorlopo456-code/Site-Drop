# Ativação do Supabase

O site funciona com os benefícios padrão enquanto o Supabase não estiver configurado.

## Expiração de pedidos pendentes

Execute `supabase/migrations/20260924010000_expire_unpaid_orders.sql` no SQL Editor. A migration
ativa o Supabase Cron, cancela e oculta pedidos sem pagamento após 48 horas e remove esses registros
após 90 dias. A tarefa roda a cada hora e não depende de um Cron Job da Vercel.

## 1. Criar e configurar o projeto

1. Crie um projeto no Supabase.
2. No SQL Editor, execute todo o conteúdo de
   `supabase/migrations/20260811230000_admin_and_site_benefits.sql`.
3. Copie `.env.example` para `.env.local`.
4. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os valores de
   **Project Settings > API**.
5. Reinicie `npm run dev` após alterar as variáveis.

A Publishable/anon key pode estar no frontend. A segurança das gravações é feita pelas políticas
RLS. Nunca coloque a `service_role` em uma variável `VITE_*`.

## 2. Criar o primeiro administrador

1. Cadastre sua conta em `/entrar`.
2. Confirme o e-mail, se a confirmação estiver habilitada no Supabase Auth.
3. Em **Authentication > Users**, copie o UUID da sua conta.
4. Execute no SQL Editor, substituindo o UUID:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where id = 'UUID-DO-SEU-USUARIO';
```

Depois de entrar novamente, a opção **Gerenciar** aparecerá apenas para essa conta. A rota `/admin`
também valida o perfil, e o PostgreSQL rejeita qualquer gravação que não venha de um administrador.

## 3. Ativar o catálogo de produtos

No SQL Editor, execute também todo o conteúdo de
`supabase/migrations/20260812010000_products_catalog.sql`. A tabela começa vazia; ao abrir o painel
**Gerenciar** com uma conta administradora, o catálogo inicial será enviado automaticamente. Depois
disso, produtos, variações, estoque e promoções passam a ser compartilhados por todos os dispositivos.

Para habilitar o controle manual **Marcar como esgotado** em uma tabela já criada, execute também
`supabase/migrations/20260812030000_product_manual_sold_out.sql` no SQL Editor.

## 4. Ativar o armazenamento das fotos

No SQL Editor, execute todo o conteúdo de
`supabase/migrations/20260812020000_product_images_storage.sql`. A migration cria o bucket público
`product-images`, limita os arquivos a JPG, PNG ou WebP de até 5 MB e permite alterações somente
para administradores. Depois disso, o formulário de produtos exibe o botão **Enviar fotos**.

## 5. Ativar a edição do rodapé e das redes sociais

No SQL Editor, execute todo o conteúdo de
`supabase/migrations/20260812040000_site_footer_settings.sql`. Depois, abra a aba **Rodapé e redes
sociais** no Gerenciador para informar telefone, e-mail, endereço, pagamentos, CNPJ e os links do
Instagram e YouTube.

## 6. Login social (opcional)

Ative Google, Facebook ou Apple em **Authentication > Providers** e cadastre as URLs de callback
exibidas pelo Supabase. Os botões já usam o fluxo OAuth do cliente oficial.

## 7. Ativar pedidos e Mercado Pago

1. No SQL Editor, execute `supabase/migrations/20260812050000_orders_and_payments.sql`.
2. Em `.env.local`, configure `SUPABASE_SERVICE_ROLE_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`,
   `MERCADO_PAGO_WEBHOOK_SECRET` e `SITE_URL`, seguindo os exemplos de `.env.example`.
3. A `service_role` e o Access Token são segredos de backend: nunca use `VITE_` nesses nomes e nunca
   publique seus valores no Git.
4. No Mercado Pago Developers, configure o evento **Pagamentos** em **Webhooks** apontando para
   `https://SEU-DOMINIO/api/mercado-pago/webhook` e copie a assinatura secreta gerada.
5. Comece com credenciais de teste. Troque pelo Access Token de produção somente depois de concluir
   uma compra completa usando a conta compradora de teste.

## 8. Ativar a baixa segura do estoque

No SQL Editor, execute `supabase/migrations/20260812060000_secure_stock_deduction.sql`. Essa migration
faz a baixa do produto ou da variação em uma transação única somente após o Mercado Pago confirmar o
pagamento. Notificações repetidas não descontam o mesmo pedido duas vezes. Se o estoque acabar entre
o checkout e a aprovação, o pedido pago é marcado para revisão administrativa em vez de gerar estoque
negativo.
