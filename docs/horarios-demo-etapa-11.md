# Etapa 11 — horários e disponibilidade demonstrativos

Atualização etapa 12: a prévia agora considera também os atendimentos da agenda
administrativa local, respeitando intervalos e ignorando cancelados. O snapshot
não usa mais bookings=[] quando há atendimentos demonstrativos. Consulte
agenda-demo-etapa-12.md. Reservas reais/legadas continuam sem consulta ou alteração.

## Testar no navegador

1. Executar `pnpm dev` e abrir `http://localhost:3000/admin`.
2. Criar uma barbearia fictícia e pelo menos um profissional ativo, associado
   a um serviço ativo. Abrir Horários (`/admin/horarios`), também acessível nos
   cards dos profissionais. Nenhuma consulta ao banco é necessária para esse fluxo.
3. No seletor, escolher a barbearia. Os sete dias começam fechados, sem assumir
   um expediente real. Marcar dias abertos, ajustar início/fim e adicionar períodos
   ou pausas. Aplicar horários demo. O resumo mostra somente configurações aplicadas.
4. Escolher cada profissional e configurar sua semana. Dias sem funcionamento
   da barbearia não podem ser abertos para o profissional. Sem configuração
   individual, não existem sugestões de horário. Profissionais inativos podem
   manter/configurar seus dados, mas não aparecem na seleção elegível da prévia.
5. Adicionar bloqueios para toda a barbearia ou para um profissional: dias inteiros
   ou período com data/hora, tipo e motivo. Folgas, férias, feriados e pausas
   pontuais usam esse mesmo formulário. Para alterar um bloqueio, remover e recriar.
6. Na prévia, escolher serviço, profissional e data futura, então Calcular prévia.
   Conferir duração e desaparecimento das sugestões que atravessam pausas/bloqueios.
   Não há botões de reserva. Os inícios são sugeridos a cada 30 minutos.
7. Alternar barbearias: configuração, bloqueios e expedientes permanecem separados.
   Trocar de barbearia/escopo descarta rascunhos não aplicados. Recarregar a página
   descarta todo o contexto demonstrativo, como nas etapas anteriores.

Exemplo: barbearia 09:00–18:00, pausa 12:00–13:00; profissional 10:00–17:00,
pausa 15:00–15:30. Um serviço de 60 minutos pode começar às 11:00, mas não às
11:30, pois atravessaria a pausa. Um feriado de dia inteiro elimina as sugestões
naquela data, sem apagar a semana configurada.

## Regras

- Dias possuem zero ou mais períodos de funcionamento e pausas recorrentes.
  Sem períodos significa fechado/não trabalha. Ranges são locais e usam fim
  exclusivo; intervalos adjacentes são aceitos, sobrepostos no mesmo grupo não.
- Início deve preceder o fim; pausas precisam caber em um período aberto, sem
  sobreposição entre si. Horários semanais vão de 00:00 a 23:59. Turnos atravessando
  a meia-noite e funcionamento contínuo de 24h não são suportados nesta interface.
- Expediente individual deve caber nos períodos abertos da barbearia. Pausas do
  estabelecimento são herdadas no cálculo, mesmo sem repetição na semana individual.
- Reduzir/fechar o funcionamento é recusado se invalidar expediente já configurado,
  inclusive de profissional inativo. O erro indica nome/dia: ajustar primeiro o
  expediente individual. Não existe truncamento/apagamento silencioso desses dados.
- Bloqueios no mesmo escopo não podem se sobrepor. Global e individual podem
  coincidir (por exemplo, férias abrangendo um feriado); ambos reduzem a prévia.
  Bloqueios não precisam caber no expediente, pois férias abrangem dias fechados.
- Datas de dia inteiro são inclusivas no formulário e convertidas para instantes
  com fim exclusivo à meia-noite do dia seguinte. Todos os horários usam
  America/Sao_Paulo explicitamente, sem depender do fuso do computador.
- Profissional ativo, serviço ativo e associação na mesma barbearia são necessários
  para elegibilidade. Elegibilidade não implica disponibilidade: expediente,
  pausas, bloqueios, duração e horário futuro também são considerados.

## Reutilização e modelo

lib/bookings não foi alterado. Foram reutilizados overlaps, contains,
requireInterval, localTimeToInstant, parseLocalDate e calculateAvailability, todos
sem inicializar persistência ou importar o adaptador PostgreSQL.

DemoBarbershop.schedule contém shopWeek, professionalWeeks e blocks, apenas em
memória. demoWorkingHours converte períodos após pausas em linhas compatíveis
com WorkingHours (barbershopId, professionalId, weekday, startMinute, endMinute).
Bloqueios guardam id/barbershopId/professionalId, início/fim UTC, kind e reason,
preparados para ScheduleBlock. Pausas semanais viram janelas separadas; não são
criadas como ocorrências infinitas de bloqueios por data.

A prévia passa bookings=[] ao núcleo: ela NÃO lê reservas reais, NÃO considera
concorrência e NÃO garante vagas. Resultado é uma fotografia do momento do cálculo;
alterar o contexto aplicado ou a seleção exige recalcular. O resumo semanal não
inclui bloqueios por data, explicitados na lista e na prévia.

Não existe autorização multi-tenant real aqui. A organização local por IDs não
substitui validação de sessão, membership, tenant e relacionamentos no servidor.
Não há API, gravação de reservas, storage ou persistência. Fuso fixo de São Paulo;
conversões de horários locais ambíguos/inexistentes são recusadas pelo núcleo.

## Arquivos

Criados:
- app/admin/horarios/page.tsx
- app/admin/horarios/_lib/schedule.ts
- app/admin/horarios/_components/schedule-panel.tsx
- app/admin/horarios/_components/weekly-editor.tsx
- app/admin/horarios/_components/block-editor.tsx
- app/admin/horarios/_components/availability-preview.tsx
- tests/schedule-demo.test.ts
- docs/horarios-demo-etapa-11.md

Modificados:
- app/admin/_lib/demo-barbershop.ts: inicia configuração vazia por barbearia.
- app/admin/_components/demo-context.tsx: aplicar semana/adicionar/remover bloqueios.
- app/admin/_components/admin-shell.tsx e app/admin/page.tsx: navegação de Horários.
- app/admin/profissionais/_components/professionals-panel.tsx: link para Horários.
- app/admin/profissionais/_components/professional-form.tsx: instrução atualizada.
- docs/profissionais-demo-etapa-10.md: nota de evolução da funcionalidade.

## Validação

- Testes demonstrativos (schedule, professionals, onboarding, services e public
  catalog): 20 aprovados, incluindo cinco testes de horários com múltiplos cenários.
- Cinco testes de horários executados também explicitamente em UTC e
  America/Sao_Paulo: aprovados em ambos os fusos.
- pnpm test: 230 testes existentes aprovados; runner inalterado.
- TypeScript sem emissão/sem incremental e ESLint: aprovados. Aviso informativo
  de baseline-browser-mapping desatualizado, sem instalar dependências.
- git diff --check: aprovado; avisos de normalização LF/CRLF preexistentes.
- Build e verificação visual/interativa em navegador não executados.

Sem Neon, migrações, alteração do schema Prisma, Stripe, autenticação/permissões,
reservas públicas ou runner Neon. Nenhuma dependência, commit, push ou deploy.
Alterações anteriores preservadas. Aguardar autorização antes da próxima etapa.
