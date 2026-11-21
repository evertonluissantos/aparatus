# Restauração implementada da interface pública

## Fonte recuperada e alterações indevidas

Comparação feita com git show HEAD:app/page.tsx e
git show HEAD:app/_components/barbershop-item.tsx, no HEAD 284e691. O histórico
de app/page.tsx aponta a composição pública em dc3caca; BookingItem foi localizado
no histórico em 782f16b. Nenhum reset, clean, checkout ou restauração global ocorreu.

A integração demonstrativa havia substituído o cabeçalho por logotipo textual e
atalho administrativo, retirado busca/filtros originais, banner e rodapé, removido
Recomendados/Populares e usado uma grade de cards. O card havia perdido min-width
290px, mudado os tokens de cor dos textos e acrescentado quebras de palavras.
Isso foi corrigido nos arquivos, não apenas diagnosticado.

## O que voltou

DemoCatalog, chamado por app/page.tsx, agora contém a composição original:
Header → PageContainer → SearchInput → QuickSearchButtons → banner original →
seções Recomendados/Populares → Footer. Foram reutilizados os componentes
existentes, incluindo logotipo, tema, menu e rodapé. Header, SidebarMenu, Footer,
ui/page, globals.css, fontes e banner.png não foram modificados nesta correção.

Cada seção usa PageSection, PageSectionTitle e PageSectionScroller originais.
O scroller continua com flex gap-4 overflow-x-auto e scrollbar oculta. Os cards
são filhos diretos desse flex: nenhum grid ou lista vertical substitui carrosséis.
BarbershopItem recuperou exatamente as classes visuais do Git: mínimo 200px de
altura, 290px de largura, rounded-xl, imagem fill/object-cover, gradiente e textos
text-background com tamanhos/pesos originais. Mantidas apenas adaptações de dados:
href opcional, tipo mínimo do card e suporte à foto local data URI.

O banner é o mesmo public/banner.png, com a mensagem fotográfica Agende nos
melhores, sem edição, recorte ou novo texto sobreposto. O JSX mantém h-auto w-full,
sizes=100vw e o espaçamento original do PageContainer.

O card compacto foi recuperado do JSX de BookingItem: Card, Badge, avatar, nome
do serviço/barbearia e coluna lateral de mês/dia/hora, com as classes originais.
Não foi importada a ação antiga de cancelamento/reembolso. O card é mostrado
quando há um próximo agendamento público demonstrativo confirmado, criado nesta
aba; cancelados e passados são omitidos. Não foi inventada uma reserva para ocupar
esse espaço. O HEAD da home não renderizava BookingItem; seu componente visual
foi reutilizado para atender ao requisito explícito de conservar o card compacto.

## Integração preservada e diferenças necessárias

Recomendados/Populares contêm somente seleções fixas dos exemplos fictícios,
ordenadas como a home original (nome crescente/decrescente). São rótulos
demonstrativos, não rankings comprovados. Novos estabelecimentos publicados
aparecem em um terceiro carrossel com os mesmos cards, sem receber classificação.
Uma nota curta nos tokens tipográficos existentes informa o caráter temporário.
Não foi mantido o grande hero textual nem o painel de aviso colorido do redesign.

Busca e filtros reaproveitam exatamente o JSX e classes originais. Um parâmetro
opcional searchPath permite usar /demo/barbearias para a fonte local; o padrão
/barbershops dos consumidores legados permanece intacto. A nova rota de busca
local inclui nomes e serviços ativos e usa carrossel, sem banco. O header/menu
original conserva o comportamento de autenticação existente: nada foi simulado,
substituído ou executado. As rotas legadas não foram acessadas nesta tarefa.

Cadastro/publicação, serviços, profissionais, horários, agenda, agendamento público
e clientes das etapas 07–14 permanecem implementados. Nenhuma tela administrativa
foi redesenhada. O provider recebeu somente IDs dos comprovantes públicos criados
nesta aba, necessários ao card compacto; a fonte dos atendimentos continua sendo
a agenda existente, sem histórico duplicado ou consulta remota.

DemoCatalogHeader passou a reutilizar Header também nos detalhes públicos.
O atalho Área de gestão demo e o botão administrativo Conferir agenda demo da
confirmação pública foram removidos. A confirmação do cliente e o registro na
agenda continuam funcionando. Para conferir, o operador acessa /admin diretamente,
seleciona a barbearia e o dia na agenda. Nenhum acesso administrativo foi acrescentado
à home ou ao menu público.

Pontos para uma etapa futura: entrada própria de proprietários pode direcionar
à rota /admin existente; o acesso global do Studio Notreve deverá ser separado.
São apenas pontos de conexão identificados, sem links novos, autenticação,
papéis, assinatura ou painel global implementados nesta correção.

## Arquivos efetivamente alterados/criados nesta correção

Alterados:
- app/_components/demo-catalog.tsx — composição original da home e header público.
- app/_components/barbershop-item.tsx — classes visuais originais restauradas.
- app/_components/search-input.tsx — destino opcional, sem alteração visual.
- app/_components/quick-search-buttons.tsx — destino opcional, sem alteração visual.
- app/_components/public-demo-booking.tsx — remoção do atalho administrativo público.
- app/_lib/demo-catalog.ts — seleções de exemplos, busca e próximo comprovante.
- app/admin/_components/demo-context.tsx — IDs de comprovantes públicos locais.

Criados:
- app/_components/demo-confirmed-booking.tsx — JSX compacto recuperado do original.
- app/demo/barbearias/page.tsx — busca na fonte demonstrativa.
- tests/public-ui-restoration.test.ts — regressões de dados e contrato estrutural.
- docs/restauracao-interface-publica.md — este relatório.

## Validação e limites

- 41 testes demonstrativos aprovados, incluindo os 38 anteriores e três novos
  testes de classificação, busca, comprovante e estrutura visual/carrosséis.
- pnpm test: 230 testes existentes aprovados, sem alteração do runner.
- TypeScript sem emissão/sem incremental aprovado.
- ESLint aprovado; aviso informativo de baseline-browser-mapping antigo.
- git diff --check aprovado; avisos LF/CRLF existentes no workspace.
- Sem navegador ou Figma nesta tarefa, conforme solicitado. Não houve validação
  visual, comparação pixel a pixel ou alegação de equivalência visual por screenshot.
  A restauração foi verificada pelo JSX/classes do Git e testes estruturais.

Diferenças remanescentes: fonte local temporária, nota demonstrativa, terceiro
carrossel para novas publicações, busca local e card compacto condicional ao
comprovante demonstrativo real desta aba. Dados/imagens de exemplos podem diferir
dos registros do banco, que não foi consultado. Não há agendamento fictício fixo
para imitar uma tela autenticada com reservas reais.

Sem Neon, migrações, Prisma, Stripe ou reservas legadas alterados. Autenticação e
permissões intactas. Sem commit/push/deploy. Todo o trabalho anterior foi preservado.
