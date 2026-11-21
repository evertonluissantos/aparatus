# Etapa 09 — cadastro e catálogo público demonstrativo

Atualização etapa 13: detalhes de barbearias criadas/publicadas nesta aba agora
permitem simular agendamento na agenda local. Exemplos fixos continuam somente
para consulta. Consulte agendamento-publico-demo-etapa-13.md; reservas reais/legadas
permanecem separadas e não foram alteradas.

## Testar o fluxo completo

1. Executar `pnpm dev`; abrir `http://localhost:3000/admin/onboarding`.
2. Informar dados fictícios e, opcionalmente, escolher foto JPG/PNG/WebP de até
   2 MB. A capa é lida/decodificada localmente, sem upload. Existe capa ilustrativa
   padrão. Formato inválido mantém a capa anterior e mostra erro; durante a leitura
   a criação fica desabilitada.
3. Criar barbearia demo. Ela nasce em RASCUNHO e não aparece no catálogo público.
4. Na confirmação, clicar em Publicar demonstração. O mesmo controle existe em
   `/admin/configuracoes`, para a barbearia selecionada. Pode retirar a publicação.
5. Clicar em Ver catálogo para navegar até `/` SEM recarregar ou abrir outra aba.
   A barbearia aparece em card reutilizado do catálogo existente, com nome/capa/
   endereço e rótulo de publicação local. Não há popularidade ou recomendação.
6. Clicar no card para abrir `/demo/barbearias/<id>`. A página mostra capa,
   informações e somente serviços ativos da mesma barbearia, sem botão de reserva.
7. Voltar pela Área de gestão demo, alternar barbearia e verificar catálogos
   separados. Editar/desativar serviços se reflete no detalhe público daquela
   barbearia. Retirar a publicação oculta card e detalhes; acessar o link antigo
   mostra indisponibilidade sem exibir informações do rascunho.

## Fonte e regra de publicação

A página inicial deixou de consultar Prisma e usa um seletor de catálogo local.
Os dez nomes/endereços/imagens fictícios do seed original foram copiados como
fixtures de exemplos fixos; o seed NÃO é importado/executado. Serviços originais
de exemplo também foram copiados, com duração demonstrativa de 30 minutos.
As imagens remotas desses exemplos continuam nos mesmos URLs utfs.io; visualizá-las
pode requisitar esse provedor de imagens, sem acesso ao banco.

Novos cadastros só entram na seleção pública quando published=true, após ação
explícita do operador. Publicação valida os dados locais e preserva as demais
barbearias. O catálogo lista exemplos fixos e publicações locais sem ranking.
Cards receberam um contrato mínimo de apresentação e destino opcional; o destino
legado padrão permanece para os outros consumidores do componente.

DemoProvider foi elevado do layout administrativo para o layout raiz, preservando
estado nas navegações internas entre admin, catálogo e detalhes. Não há banco,
localStorage, cookies ou sincronização. Recarregar, fechar ou abrir outra aba perde
os cadastros locais. Exemplos fixos continuam disponíveis após recarregar.

## Limites

Não existe publicação real na internet, upload, autenticação nova, membership,
assinatura ou autorização multi-tenant. Não inserir dados ou fotos reais/sensíveis.
Compartilhar a URL de um cadastro temporário não transmite seu estado a outra aba
ou pessoa. ID desconhecido, rascunho e retirado mostram indisponibilidade no cliente.
No futuro, visibilidade, propriedade dos serviços e autorização para publicar
devem ser verificadas no servidor, nunca derivadas somente deste estado local.

As rotas legadas `/barbershops`, `/barbershops/[id]` e `/bookings`, o Header legado,
autenticação, ações de reserva e Stripe foram preservados. Não foram executados
nesta etapa. O catálogo demonstrativo usa header próprio sem hooks de sessão,
links para reservas ou pré-carregamento dessas rotas. Não afirmar que o restante
da aplicação antiga está livre de dependências de banco.

## Arquivos

Criados: app/_lib/demo-catalog.ts; app/_components/demo-catalog.tsx;
app/_components/demo-barbershop-page.tsx; app/demo/barbearias/[id]/page.tsx;
app/admin/_components/cover-input.tsx; app/admin/_components/publication-controls.tsx;
tests/public-demo-catalog.test.ts; este documento.

Modificados: app/page.tsx; app/layout.tsx; app/_components/barbershop-item.tsx;
app/admin/layout.tsx; app/admin/_lib/demo-barbershop.ts;
app/admin/_components/demo-context.tsx; app/admin/_components/section-preview.tsx;
app/admin/onboarding/page.tsx. Documentos das etapas anteriores receberam nota
referenciando o novo escopo de estado e publicação.

## Validação

- `pnpm exec tsx --test tests/onboarding-demo.test.ts tests/services-demo.test.ts tests/public-demo-catalog.test.ts`:
  11 testes aprovados, incluindo rascunho/publicação/retirada, exemplos preservados,
  separação dos serviços, imagens e validação antes da publicação.
- `pnpm test`: 230 testes existentes aprovados.
- TypeScript sem emissão e ESLint dos arquivos envolvidos: aprovados; aviso
  informativo de baseline-browser-mapping antigo.
- git diff --check: aprovado, com avisos LF/CRLF preexistentes.
- Não houve build ou verificação visual/interativa em navegador.

Nenhuma dependência adicionada, conexão Neon, migração ou alteração de Prisma,
autenticação/permissões, Stripe ou reservas. Nenhum commit/push/deploy.
