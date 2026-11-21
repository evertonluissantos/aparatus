# Etapa 05 — núcleo de regras isolado

## Escopo

Nenhuma rota/ação antiga foi substituída. Não há adaptador de banco, escrita,
migração, backfill ou regeneração de Prisma Client nesta etapa. Stripe, checkout,
autenticação existente e o client de runtime foram preservados. O núcleo não é
uma operação definitiva de criação e não está conectado à aplicação pública.

## Organização

| Arquivo em lib/bookings | Responsabilidade |
|---|---|
| types.ts | DTOs mínimos, snapshot, candidato e contratos de leitura/transação |
| rules.ts | Duração, instantes, intervalos, sobreposição, contenção, passado e estados |
| timezone.ts | Data/hora civil e conversão explícita com Intl/IANA |
| availability.ts | Única implementação das regras de disponibilidade e validação |
| core.ts | Fachada server-only com contratos separados para público, cliente e equipe |

O snapshot é fornecido por um leitor confiável do servidor, não pelo navegador.
Funções puras não importam Prisma. O contrato reproduz campos relevantes do schema
expandido, mas não depende de delegates ainda indisponíveis no client atual.
IDs, fuso, serviço, profissional, habilitação e todos os registros fornecidos
devem pertencer à barbearia solicitada; inconsistências falham sem fallback.

## Regras implementadas

- Duração inteira positiva em minutos. Sem fallback para 30 minutos quando NULL.
- Término = início + duração real em minutos; overflow/instante inválido é rejeitado.
- Intervalos [início, fim); adjacência é permitida. Sobreposição considera ambos
  os extremos, inclusive contenção e durações diferentes.
- Início deve ser estritamente posterior ao relógio explícito do servidor. O
  relógio injetável é dependência confiável para testes, não parâmetro do cliente.
- Expediente disponível = união das janelas da barbearia INTERSECT união das
  janelas do profissional. Janelas adjacentes/sobrepostas são normalizadas.
- Falta de expediente em qualquer escopo ou dia significa ausência de horários.
- Pausas recorrentes são lacunas entre janelas; pausa pontual, ausência e bloqueio
  extraordinário são intervalos de indisponibilidade. Escopo nulo afeta toda a loja.
- Serviço completo deve caber numa janela. Não atravessa pausa ou limite de janela.
- Janelas semanais são minutos locais de 0 a 1440; travessia de meia-noite precisa
  ser dividida em dias distintos. Serviços atravessando dias não são oferecidos
  por este contrato inicial de disponibilidade diária.
- Grade pública padrão de 30 minutos, ancorada à meia-noite local, é apresentação:
  não é duração fixa de serviço nem regra de conflito. A validação aceita outro
  minuto local válido dentro da janela. stepMinutes da função pura é configurável.

## Estados e legado

CANCELLED não ocupa; cancelled=true sem status também não ocupa. CONFIRMED,
COMPLETED e NO_SHOW representam ocupação do intervalo. Nada é convertido para
COMPLETED por passagem do tempo. Flag antiga cancelled=true junto de status ativo
explícito é inconsistência que exige revisão. Status desconhecido é rejeitado.

Status NULL com cancelled falso/nulo é conservadoramente ocupado, sem inventar
um status histórico. Profissional NULL ocupa todos os profissionais daquela loja
no intervalo conhecido. Outro profissional identificado não impede o escolhido.

Término NULL de reserva não cancelada, com início anterior ao fim do dia pedido,
gera LEGACY_DATA_REQUIRES_REVIEW. Isso inclui registros antigos: sem limite final
não se prova que estejam fora do intervalo. Não se atribui duração presumida nem
se ignora histórico para liberar agenda. O novo núcleo pode ficar indisponível
até revisão desses registros; é intencional e ele continua isolado das rotas atuais.

## Fuso e horário de verão

Fuso é obrigatório e explícito; sem DEFAULT de servidor. Identificador válido
no Intl/IANA (ou UTC); offsets textuais como +03:00 são rejeitados. Dados IANA
dependem da versão de ICU/Node instalada, que precisa ser mantida atualizada.
Datas civis aceitas: YYYY-MM-DD, de 1900 a 9999; hora de início: HH:mm 00:00–23:59.
1440 só representa o limite final de uma janela, no início do próximo dia.

O resolvedor observa offsets horários em ±48h do dia e testa candidatos por
round-trip de todos os componentes civis, incluindo segundos. Não depende de
Date.parse de strings locais nem do TZ do processo. Zero candidatos gera
NONEXISTENT_LOCAL_TIME; mais de um, AMBIGUOUS_LOCAL_TIME. Não escolhe ocorrência
"mais cedo"/"mais tarde" silenciosamente. Suporta offsets fracionários observados,
transições de meia hora e salto de dia nos casos cobertos pelos testes.

Na listagem, inícios ambíguos/inexistentes são omitidos; na solicitação explícita,
são rejeitados com código próprio. Limite de expediente ambíguo/inexistente exige
revisão da configuração (erro), não normalização automática. Duração é tempo
decorrido: o término é um instante único mesmo atravessando mudança de offset.

## Autorização e privacidade

- getPublicAvailability: sem login/membership; retorna somente inícios e términos
  ISO. Não expõe IDs de reservas, clientes, motivos de bloqueio ou fatos financeiros.
- validateCustomerRequest: exige identidade pela sessão, não membership. Identidade
  enviada no payload é ignorada. Retorna candidato, nunca confirmação ou cobrança.
- validateStaffRequest: exige bookings:manage na barbearia antes da leitura.
- getCustomerBooking: passa userId da sessão e barbearia ao leitor; revalida o
  resultado e recusa reserva alheia, inclusive se o leitor estiver incorreto.
- getStaffBooking: exige bookings:read e revalida tenant/ID retornados.
- Administrador global não recebe bypass: contratos privados usam propriedade
  do cliente ou membership; papel global não é consultado para ampliar acesso.

O leitor recebe somente os campos de escopo selecionados pelo núcleo. Contextos,
leitor, relógio e escolha de método devem vir de código do servidor, nunca do
navegador. A projeção privada também omite referências Stripe e dados financeiros.
Os guards reais da etapa 04 permanecem intactos; testes da fachada os simulam e
os testes de autorização anteriores continuam exercitando sua implementação.

## Contrato do futuro adaptador e concorrência

loadAvailability deve buscar entidades/atribuições pelo tenant e IDs, incluir
expediente da loja e do profissional e todos os bloqueios/reservas relevantes.
Ocupações que começam no dia anterior e atravessam o dia solicitado não podem
ser esquecidas. Reservas com término NULL potencialmente relevantes também
precisam ser incluídas; filtrar só data de início dentro do dia seria inseguro.
Snapshots são internos e não podem ser aceitos prontos de uma requisição.

findCustomerBooking deve filtrar userId+barbershopId+bookingId; findStaffBooking
filtra tenant+ID após guard. As revalidações de saída não autorizam consultas
globais nem carregamento irrestrito de perfis e históricos pelos adaptadores.

TransactionalBookingReader prepara lockSchedule e recarregamento no mesmo
contexto. Ainda não existe implementação de lock, INSERT, transação, idempotência
de criação ou exclusão SQL. Duas chamadas ao núcleo podem validar o mesmo slot;
isso NÃO prova que duas reservas poderão ser gravadas com segurança.

Etapa futura: sessão/tenant e permissões revalidados, locks compartilhados por
agenda/bloqueios, snapshot recarregado e regras executadas dentro da mesma
transação; constraints de intervalo e idempotência como barreira final. O candidato
de validação anterior não é token de autorização nem retenção de horário.

## Testes e integração futura

Testes novos usam a guarda existente sem banco/rede, mesmos casos em UTC e
America/Sao_Paulo. Cobrem adjacência, conflitos, duração, janelas, pausas, falta de
expediente, cancelamento, ocupação histórica, legado incerto, passado, acesso
cruzado, privacidade e autorização. Casos IANA incluem New York, São Paulo
histórico, Kathmandu, Lord Howe e Apia. Não substituem teste de PostgreSQL ou
validação de todas as transições possíveis da base IANA.

Migrações 02–04 e PostgreSQL descartável continuam pendentes; client expandido
não foi ativado. Antes de conectar qualquer rota: validar migrações, tratar
legado incerto, implementar adaptador transacional, validar concorrência real,
planejar corte do checkout e manter inbox Stripe seguro. Nenhuma rota antiga
foi migrada só para fazer seus defeitos conhecidos desaparecerem dos testes.

Próxima tarefa recomendada: validar persistência/constraints no PostgreSQL
descartável e preparar o adaptador transacional sobre este núcleo, sem publicar
uma criação concorrente baseada apenas em checagens em memória.
