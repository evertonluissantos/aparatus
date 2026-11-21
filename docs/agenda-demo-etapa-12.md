# Etapa 12 — agenda administrativa demonstrativa

Atualização etapa 14: atendimentos agora têm clientId da carteira da barbearia.
O formulário permite selecionar cliente existente ou informar novo nome/telefone;
o histórico é derivado da própria agenda. Consulte clientes-demo-etapa-14.md.

Atualização etapa 13: simulações feitas pelo detalhe público demonstrativo são
registradas nesta mesma agenda por barbearia. Consulte
agendamento-publico-demo-etapa-13.md. A persistência e os fluxos reais seguem
inalterados; as referências abaixo à ausência de fluxo público são históricas.

## Testar o fluxo

1. Executar `pnpm dev` e abrir `http://localhost:3000/admin`.
2. Criar barbearia fictícia, serviços ativos e profissionais ativos habilitados.
   Configurar funcionamento e expediente dos profissionais em Horários. Sem esses
   dados não é possível criar atendimentos válidos.
3. Abrir `/admin/agenda`, escolher o dia e filtrar por profissional se desejar.
   A agenda inicia vazia. Navegação anterior/próximo dia e Hoje usam datas civis
   de America/Sao_Paulo, sem depender do fuso do navegador.
4. Novo atendimento: informar nome fictício, serviço, profissional, data e início
   futuro. Não exige checkout, cadastro real de cliente ou publicação da barbearia.
5. Testar outro atendimento no mesmo intervalo/profissional: deve recusar. Horário
   imediatamente após o término é permitido se couber no expediente e não houver
   pausas/bloqueios. Outro profissional pode atender no mesmo instante.
6. Cancelar com confirmação: a linha permanece no histórico e deixa de ocupar
   o horário. Outros impedimentos (pausas, bloqueios, inatividade) continuam válidos.
7. Concluir somente após o término previsto. Para testar no navegador sem longa
   espera, usar serviço fictício de um minuto, início no próximo minuto e aguardar
   o término. A habilitação visual atualiza a cada 30 segundos; a ação sempre
   revalida o instante atual. Não há relógio simulado na interface. Os testes de
   domínio usam relógio explícito para verificar futuro, em andamento e término.
8. Conferir resumo diário (total, confirmados, concluídos, cancelados) e filtro.
   Alterações no catálogo não reescrevem os nomes/duração/preço do histórico.
9. Alternar barbearias para confirmar agendas independentes. Recarregar descarta
   todos os dados demonstrativos. Não inserir nomes ou dados reais de clientes.

## Regras e estado

DemoAppointment guarda barbershopId, IDs do profissional/serviço, nome fictício
do cliente, nomes do profissional/serviço, início/fim UTC, snapshots de duração,
preço e fuso, status e timestamps de criação/cancelamento/conclusão.
CONFIRMED pode virar CANCELLED ou COMPLETED; estados finais não podem ser
reabertos ou convertidos um no outro. Repetir o mesmo estado não altera timestamps.
Não há exclusão ou edição/reagendamento de atendimentos nesta etapa.

Criação deriva a barbearia do contexto local, valida serviços/profissionais ativos
e vínculo, então chama validateBookingRequest de lib/bookings com o snapshot
atual de expediente, pausas, bloqueios e atendimentos locais. Intervalos são
semiabertos: conflitos são por sobreposição, não apenas por início igual.
Cancelados não ocupam horários; concluídos preservam o intervalo histórico.
Início deve ser estritamente futuro; conclusão exige fim previsto <= relógio atual.
Dias anteriores podem ser visualizados; passar o tempo não conclui automaticamente.

O snapshot compartilhado de disponibilidade passou a incluir appointments locais,
inclusive na prévia da etapa 11. Não consulta reservas remotas ou legadas. Alterar
horários/catálogos posteriormente não cancela nem reescreve atendimentos existentes;
novas criações usam a configuração atual e os intervalos registrados.

O provider aplica mutações locais ao último snapshot em memória antes de solicitar
nova renderização, evitando validação de ações consecutivas contra estado antigo.
O formulário também bloqueia submissão repetida. Isso não é uma transação de
banco, isolamento multi-tenant real ou garantia de concorrência entre usuários.

## Preparação para integração futura

As validações e transições estão separadas dos componentes. Horários, status e
snapshots podem ser mapeados ao modelo de reservas, mas nome livre de cliente
NÃO substitui userId/cliente vinculado ao tenant. Na integração real, o servidor
deverá obter sessão, verificar membership/permissão, resolver o cliente correto,
validar relações, aplicar idempotência e reler/validar conflitos na transação do
adaptador PostgreSQL. Nenhum desses endpoints foi ativado ou alterado.

Limites: dados apenas em memória da aba; sem pagamentos, notificações, APIs ou
reserva pública; sem autorização real. Clock e fuso são locais (São Paulo fixo).
Não há validação visual/interativa em navegador nesta entrega. Não há estatísticas
de receita confirmada; preço é somente o snapshot informativo do serviço.

## Arquivos

Criados:
- app/admin/agenda/page.tsx
- app/admin/agenda/_components/agenda-panel.tsx
- app/admin/agenda/_components/appointment-form.tsx
- app/admin/agenda/_lib/appointment.ts
- tests/agenda-demo.test.ts
- docs/agenda-demo-etapa-12.md

Modificados:
- app/admin/_lib/demo-barbershop.ts: coleção vazia de appointments por barbearia.
- app/admin/_components/demo-context.tsx: criação/transições e atualização local
  síncrona do snapshot usado pelas mutações.
- app/admin/horarios/_lib/schedule.ts: snapshot compartilhado inclui agenda local.
- app/admin/horarios/_components/availability-preview.tsx: aviso atualizado.
- app/admin/page.tsx: Agenda identificada como funcional/interativa.
- app/admin/[section]/page.tsx: remove prévia, substituída pela rota específica.
- docs/horarios-demo-etapa-11.md: nota de evolução.

## Validação local

- `pnpm exec tsx --test tests/agenda-demo.test.ts tests/schedule-demo.test.ts tests/professionals-demo.test.ts tests/onboarding-demo.test.ts tests/services-demo.test.ts tests/public-demo-catalog.test.ts`:
  27 testes aprovados. Sete testes da agenda cobrem conflitos, adjacência, duração,
  pausas, bloqueios, cancelamento, inatividade, datas passadas, transições, histórico,
  snapshots, isolamento e datas civis.
- Sete testes da agenda executados explicitamente em UTC e America/Sao_Paulo:
  aprovados em ambos os fusos.
- pnpm test: 230 testes existentes aprovados, runner inalterado.
- TypeScript sem emissão/sem incremental e ESLint: aprovados. O lint inicialmente
  apontou atualização redundante de relógio no callback; removida, mantendo o
  relógio periódico e a validação temporal na ação. Apenas aviso informativo de
  baseline-browser-mapping antigo permaneceu.
- git diff --check: aprovado; avisos LF/CRLF preexistentes.
- Build e teste visual/interativo em navegador não executados.

Sem novas dependências, Neon, migrações, schema Prisma alterado, Stripe, ações
antigas de reserva, reservas públicas ou runner Neon. Sem commit/push/deploy.
Alterações anteriores preservadas. Aguardar autorização para a próxima etapa.
