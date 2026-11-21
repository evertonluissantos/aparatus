# Etapa 03 — expansão do modelo de agendamentos

## Escopo e compatibilidade

Somente expansão do schema e preparação de SQL. Nenhum banco foi acessado e
nenhuma migração ou geração de client foi executada. Não houve mudança em ações,
APIs, autenticação, Stripe, checkout, cancelamento ou componentes públicos.
As migrações anteriores, inclusive inbox Stripe, permanecem intactas.

`Booking.date` continua sendo o início como instante TIMESTAMPTZ. Seus IDs, FKs,
cancelled, cancelledAt e stripeChargeId não mudam. Todos os novos campos nas
entidades antigas são opcionais, sem DEFAULT nem backfill. Escritores antigos
podem continuar omitindo-os. NULL indica desconhecimento, não um valor estimado.
O único DEFAULT novo é active=true em profissionais novos; nenhum profissional
é inserido pela migração. IDs de novos modelos continuam gerados pelo Prisma
(@default(uuid())), sem exigir extensão UUID no PostgreSQL.

## Modelos e campos

| Entidade | Evolução |
|---|---|
| Barbershop | timeZone opcional e relações de profissionais, expediente e bloqueios |
| BarbershopService | durationMinutes opcional, positivo quando informado; chave composta de referência por estabelecimento |
| Professional | ID, barbearia obrigatória, nome, active; sem inferir vínculo com proprietário ou User |
| ProfessionalService | Associação entre profissional e serviço, com FKs compostas que exigem a mesma barbearia |
| WorkingHours | Escopo barbearia/profissional, weekday, início/fim em minutos civis |
| ScheduleBlock | Escopo barbearia/profissional, início/fim como instantes, tipo e motivo opcional |
| Booking | professionalId, endsAt, status, priceInCentsSnapshot, durationMinutesSnapshot, timeZoneSnapshot e cancellationReason opcionais |

BookingStatus permite CONFIRMED, CANCELLED, COMPLETED e NO_SHOW. Não possui
DEFAULT: não se presume que reservas antigas foram atendidas ou confirmadas.
O status antigo continua sendo interpretado pelo código atual. Futuras gravações
precisarão compatibilizar status/cancelled/cancelledAt antes de adotar o novo
campo como fonte de verdade; um campo novo isolado não corrige essa inconsistência.

ScheduleBlockKind permite BREAK, ABSENCE e EXTRAORDINARY. `reason` é texto opcional
e não deve conter dados sensíveis desnecessários. Inativar profissional não deve
apagar suas reservas ou habilitações históricas; política de operação futura.

## Expediente, pausas e fuso

WorkingHours usa weekday 0=domingo até 6=sábado, startMinute inclusivo e endMinute
exclusivo, entre 0 e 1440. Exemplo: 09h–12h e 13h–18h são duas janelas, com pausa
recorrente entre elas. Virada de dia é dividida em duas janelas de dias distintos.
CHECKs garantem dia válido e 0 <= início < fim <= 1440. Não há DEFAULT de expediente.

professionalId nulo significa regra da barbearia inteira; preenchido significa
regra individual. FKs compostas impedem referenciar profissional de outra
barbearia. O algoritmo futuro usará a interseção das janelas da barbearia e do
profissional, removerá bloqueios e verificará a duração completa. Ausência de
configuração não deve ser interpretada automaticamente como horário livre.
Janelas sobrepostas/duplicadas ainda dependem de validação futura; não se criou
algoritmo de disponibilidade nesta etapa.

ScheduleBlock representa pausa pontual, ausência ou bloqueio extraordinário como
[startsAt, endsAt), com fim posterior ao início. Bloqueio sem profissional afeta
todo o estabelecimento. Não há exclusão automática de reservas já existentes.

timeZone deve futuramente receber identificador IANA validado no servidor, por
exemplo America/Sao_Paulo quando confirmado pelo estabelecimento. Não recebe
DEFAULT, pois não há evidência de que todas as barbearias existentes usem esse fuso.
O banco armazena texto; sua validade IANA NÃO é garantida por este schema.

Expediente é hora civil no fuso da barbearia, não hora UTC. Reservas e bloqueios
são instantes. Consultas futuras deverão converter início do dia local e início
do próximo dia para instantes; tratar ambiguidade/inexistência no horário de verão.
timeZoneSnapshot preservará o contexto acordado de novas reservas, quando o núcleo
passar a gravá-lo. Alterar timeZone não deve deslocar Booking.date/endsAt já salvos.
A interpretação atual das datas não mudou e seus defeitos continuam caracterizados.

## Integridade preparada e limites

- Duração do serviço e snapshot: NULL ou inteiro positivo.
- Preço histórico: NULL ou inteiro não negativo, em centavos; zero é permitido.
- Término: NULL ou posterior a Booking.date.
- FKs novas com ON DELETE RESTRICT; sem exclusões em cascata.
- Booking profissional/barbearia e habilitações profissional/serviço usam FKs
  compostas para impedir vínculo cruzado nesses relacionamentos novos.
- Índices de reservas por barbearia/data, barbearia/profissional/data e usuário/data;
  índices de expediente e bloqueio por estabelecimento/profissional.

Isso não implementa autorização multi-tenant. Também não endurece a FK antiga
Booking.serviceId para garantir pertencimento à mesma barbearia: essa mudança
precisa de inspeção de dados futura. Nem garante que toda reserva tenha um
ProfessionalService habilitado, que preço/duração sejam imutáveis ou que endsAt
seja coerente com o snapshot; essas regras caberão ao núcleo e a um endurecimento
posterior. IDs e barbershopId serão tratados como imutáveis nas operações futuras.

Não foi adicionada exclusão de intervalos. Após dados e escritores estabilizados,
usar exclusão GiST por profissional e tstzrange(date, endsAt, '[)'), com política
explícita de estados que ocupam capacidade. [09h,10h) e [10h,11h) são adjacentes,
não conflitantes. Uma UNIQUE apenas no início não resolve sobreposição.

Antes dessa constraint: revisar conflitos, reservas futuras sem profissional/fim,
status desconhecidos e dados de duração. Não excluir silenciosamente reservas
desconhecidas da proteção. Conferir suporte a btree_gist no PostgreSQL descartável.
As operações de reserva e bloqueio precisarão também de protocolo transacional
compartilhado: uma exclusão só em Booking não protege contra outra tabela.

## Backfill futuro, separado da expansão

1. Obter evidências de fuso, duração atual de cada serviço e profissionais reais;
   cadastrar/configurar explicitamente, sem criar placeholders fictícios.
2. Vincular reservas futuras ao profissional apenas quando identificável. Não
   presumir proprietário como responsável nem distribuição automática.
3. Preencher preço/duração históricos apenas com evidência daquela contratação.
   Preço/duração atuais não comprovam passado. Desconhecidos continuam NULL.
4. Derivar endsAt somente quando houver duração confiável. Não usar 30 minutos
   como histórico presumido nem recalcular reservas ao editar um serviço.
5. Analisar cancelled/cancelledAt por consistência antes de mapear CANCELLED.
   Passagem do horário não comprova COMPLETED nem NO_SHOW. Criar tarefa separada
   para política de classificação e registro de proveniência das correções.
6. Revisar conflitos e sincronizar todos os escritores com o novo núcleo antes
   de NOT NULL seletivos, checks cruzados e constraints de exclusão.

Backfill será idempotente, rastreável e em lotes, após autorização e ensaio em
base descartável. Nenhum desses passos foi executado ou automatizado agora.

## Validação e operação

`pnpm test` mantém as caracterizações e regressões existentes em dois fusos.
Nenhuma regra pura de negócio foi introduzida: as novas regras são declarações
de schema/CHECK SQL. Não se duplicou validação SQL em helpers só para gerar testes.
Positividade, FKs e intervalos precisam de testes PostgreSQL reais, ainda pendentes.

`pnpm test:schema` usa o runner sanitizado e a mesma guarda de rede/subprocessos
bloqueados. O CLI instalado executa apenas validate, com config explícita
`tests/prisma-offline.config.ts`: sem URL, dotenv, seed ou configuração de migrações.
Não usa prisma.config.ts existente. Não gera client nem conecta a banco.

O client gerado atual permanece intacto; TypeScript verifica a aplicação atual,
mas não certifica tipos regenerados dos novos modelos. Geração/validação desses
tipos e aplicação das migrações ficam para etapa autorizada.

Riscos: DDL e índices podem adquirir locks e consumir tempo/espaço; CHECKs de
tabelas antigas podem exigir varredura, embora os campos novos comecem nulos.
Schema válido não comprova SQL executável nem custos de migração. Ensaio futuro
deve aplicar baseline, inbox Stripe e esta expansão em sequência; comparar dados
antigos, testar FKs entre tenants, NULLs legados, CHECKs e rollback. Migrações
anteriores não devem ser reescritas e não haverá deploy isolado desta expansão.

Próxima tarefa: autorização por estabelecimento e preparação do núcleo que
consumirá esses modelos, mantendo a validação PostgreSQL 02.1 como pendência
bloqueadora de publicação. Não antecipar painel, checkout, Pix ou assinaturas.
