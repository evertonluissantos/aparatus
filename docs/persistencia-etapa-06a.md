# Etapa 06A — preparação transacional, sem publicação

## Compatibilidade antes da expansão

Não é seguro aplicar exclusão de intervalos indiscriminadamente às reservas
históricas: profissional, término e status podem ser desconhecidos ou conflitantes.
A expansão proposta acrescenta managedByCore=false (proveniência técnica, não um
fato histórico de atendimento) e uma tabela BookingCommand vazia de idempotência.
Nenhum backfill, referência financeira ou dado de reserva é reescrito.

A exclusão vale somente para managedByCore=true. CHECKs exigem dados completos e
flags consistentes nessas linhas. O legado continua sendo lido conservadoramente
pelo núcleo; a exclusão parcial NÃO protege contra escritores antigos que gravam
managedByCore=false. Publicação depende de migrar todos os escritores e validar
PostgreSQL. Não aplicar esta migração em banco existente nesta etapa.

DDL pode adquirir locks e depende da extensão btree_gist disponível e autorizada.
Sem essa extensão ou sem dados compatíveis, interromper rollout; não retirar a
proteção silenciosamente. As migrações anteriores permanecem intactas.

## Arquitetura preparada

`lib/bookings/postgres.ts` recebe conexão e autoridade como dependências do
servidor, sem importar o singleton lib/prisma ou iniciar consultas no import.
Usa SQL parametrizado pelo protocolo $queryRaw existente. Não depende de delegates
do client expandido. Um teste somente de tipos confirma compatibilidade estrutural
com o Prisma Client atual, sem instanciá-lo.

postgresBookingReader lê profissional, serviço, habilitação, expediente, bloqueios
e reservas por tenant. Limites UTC amplos incluem inícios no dia anterior e todas
as reservas relevantes sem término conhecido; o núcleo filtra os intervalos.
Não há duplicação do cálculo de expediente, fuso ou disponibilidade: a gravação
chama validateBookingRequest da etapa 05 depois de carregar o snapshot.

createCustomerBooking deriva o titular da sessão; não exige membership de cliente.
createStaffBooking exige bookings:manage e cliente já vinculado por reserva da
própria barbearia. Cadastro de novo cliente pela equipe fica para etapa própria.
Nenhum papel global dá bypass. O guard transacional é uma entrada server-only
separada, compartilhando exatamente a matriz da etapa 04. A função pública antiga
de autorização preserva sua assinatura; não aceita uma conexão enviada pelo
navegador. Membership é lida com FOR SHARE na transação, bloqueando revogação
concorrente até o fim da operação. A sessão continua vindo do Better Auth atual.

## Transação e concorrência proposta (não comprovada em PostgreSQL)

1. Validar IDs e identificar ator pela sessão, sem confiar no payload.
2. Abrir READ COMMITTED; bloquear linha de Barbershop com FOR UPDATE.
3. Para equipe, verificar membership/permissão no mesmo SQL transacional.
4. Procurar BookingCommand por tenant+ator+requestKey. Mesmo conteúdo retorna a
   reserva existente; conteúdo diferente falha. Replay não desfaz cancelamento.
5. Recarregar snapshot e executar as regras centrais com relógio do servidor.
6. Inserir Booking CONFIRMED, cancelled=false, snapshots e managedByCore=true.
7. Inserir BookingCommand e confirmar os dois registros no mesmo commit.

Falha propaga para rollback. Não há confirmação após inserção parcial. Um commit
com resposta perdida pode ser retomado pela mesma chave. UUID da solicitação é
fornecido pelo chamador; não é identidade nem permissão. Fingerprint inclui canal,
titular, serviço, profissional e data/hora local. Não se atualiza um comando para
"corrigir" conteúdo; uma solicitação distinta usa chave distinta.

createScheduleBlock usa a mesma linha de barbearia, verifica schedule:write e
recusa sobreposição com reservas ocupantes. A regra de overlap/status vem do
núcleo; término desconhecido exige revisão, não duração inventada. Pausa, ausência
e bloqueio extraordinário seguem o mesmo protocolo. Todos os futuros escritores
de expediente, serviço/duração, profissional, cancelamento e reagendamento também
deverão seguir o protocolo para que o snapshot não seja invalidado concorrentemente.

O lock por estabelecimento é propositalmente conservador e serializa profissionais
diferentes. Pode ser refinado depois de medição, mantendo ordem de locks coerente.
Não resolve escritores antigos, SQL externo ou administradores que ignorem o
protocolo. A exclusão GiST é barreira adicional só para managedByCore=true:
CONFIRMED, COMPLETED e NO_SHOW ocupam; CANCELLED/cancelled=true não ocupam.
CHECKs obrigam as flags de novas reservas protegidas a serem consistentes.

Legado com profissional/término conhecido é consultado; com profissional nulo
ocupa todos, e término desconhecido exige revisão conforme etapa 05. Não há
liberação silenciosa por estar fora do índice parcial. Não houve backfill.

## Migração adicional preparada

20261107150000_booking_transaction_guards acrescenta managedByCore e BookingCommand,
índices únicos de idempotência e referência de reserva, FKs (inclusive tenant da
reserva), CHECK para linhas do núcleo e exclusão GiST com btree_gist.
Não foi aplicada. Não altera scripts de produção nem as migrações 02–04.
Agora há quatro migrações pendentes após a inicial, não três.

DDL não deve ser aplicado enquanto os escritores públicos estiverem ativos sem
estratégia de corte. A flag default=false mantém compatibilidade de inserção,
mas também significa que esses escritores não ganham a garantia nova. Erros SQL
de exclusão, deadlock, timeout e serialização ainda precisam de política de erro/
retry limitada antes de qualquer integração pública; não implementar retry infinito.

## Suíte PostgreSQL executável, mas NÃO executada nesta etapa

`pnpm test:postgres` é separado de pnpm test e requer opt-in explícito e diretório
absoluto de binários PostgreSQL já instalados (recomenda-se versão 14+ e btree_gist
disponível). Não aceita URL, host, banco, senha ou cluster existentes. Não instala
binários nem serviço Windows, não usa Docker e não procura Neon.

O launcher sanitiza o ambiente e rejeita configuração externa de banco/preload.
O provisionador cria seu próprio cluster em diretório temporário exclusivo,
inicializa com usuário sintético e inicia um processo PostgreSQL somente em
127.0.0.1 e porta temporária. Esse provisionamento só ocorre quando o responsável
executa explicitamente o comando futuro; nada foi iniciado nesta etapa.

Antes da primeira conexão: checar arquivos/binários locais, sucesso de startup e
identidade de diretório/porta no postmaster.pid recém-criado. A conexão inicial,
somente nesse cluster novo, confirma data_directory antes de criar papel restrito
e banco cortz_test_<uuid>. A suíte checa endereço/porta/banco/usuário e public vazio
antes de DDL. Não há fallback para DATABASE_URL, .env, config Prisma raiz ou pgpass.
Autenticação trust existe somente nesse cluster temporário sem dados reais; não
é recomendação de configuração para desenvolvimento compartilhado ou produção.

Uma guarda própria permite TCP somente para 127.0.0.1:porta da execução e bloqueia
HTTP(S), fetch, TLS, UDP, DNS comum e subprocessos no processo dos testes. A guarda
mock-only anterior permanece intacta. Essas proteções são contra acidentes de
código confiável, não uma sandbox de segurança para código hostil na máquina.

Após a suíte, pg_ctl para o cluster próprio. Remoção recursiva ocorre apenas após
conferir nonce, caminho absoluto sob o temporário esperado e ausência do pidfile.
Em falha de identificação/stop, arquivos são retidos; nunca remover recurso
preexistente ou um cluster que ainda possa estar executando. Interrupção abrupta
do processo pode deixar recursos temporários para inspeção/limpeza controlada.

### Execução futura (PowerShell, terminal dedicado)

Não executar até disponibilizar os binários e autorizar a validação local. O
terminal não deve herdar DATABASE_URL, PG*, NODE_OPTIONS ou configuração dotenv.
Não copiar credenciais da aplicação nem alterar o .env para realizar o teste.

```powershell
$env:CORTZ_RUN_POSTGRES = 'disposable-local'
$env:CORTZ_POSTGRES_BIN = 'C:\Program Files\PostgreSQL\17\bin'
pnpm test:postgres
```

O caminho é exemplo: informar instalação local real. Não fornecer um banco já
existente. O runner cria o cluster/banco novos e aplica, em ordem: inicial, inbox
Stripe, expansão de agenda, memberships e proteções transacionais. Apenas fixtures
sintéticas são inseridas. Não executa seed nem Prisma migrate.

### Cenários preparados

- Catálogo de constraints após aplicação ordenada; registro antigo antes/depois.
- Unicidade real de evento/sessão/intent/charge Stripe, inclusive INSERTs concorrentes.
- Rollback de evento e de reserva quando a gravação do comando falha.
- Corrida entre duas conexões para mesmo slot; adjacência; exclusão SQL direta.
- Cancelamento preserva reserva e libera intervalo protegido.
- Bloqueio concorrente com reserva: só uma operação pode vencer pelo protocolo.
- Membership de outra barbearia e IDs relacionados cruzados são rejeitados.
- Idempotência simultânea, chave reutilizada com conteúdo distinto e resposta perdida.
- Replay não reativa cancelado; legado incerto não recebe término fictício.
- Inbox real com Stripe fake preserva pagamento sem reserva em REVIEW e repetições.

Esses cenários NÃO passaram em PostgreSQL ainda. Mocks locais adicionais verificam
somente ordem de chamadas, vinculação de parâmetros, snapshots, rejeições e opt-in.

## Prisma Client e limites de integração

O client atual de runtime foi preservado. A suíte usa pg já instalado como ponte
para o protocolo SQL parametrizado; isso prova SQL/locks quando executado, não
compatibilidade real do PrismaPg ou de seu adapter 6.x com client 7.x. Os registros
são lidos via SQL, portanto delegates expandidos não são necessários nesta suíte.

Para validar posteriormente client expandido: copiar o schema para diretório
temporário exclusivo, apontar generator.output para subdiretório desse temporário,
gerar usando configuração offline sem dotenv/URL e importar somente esse client
nos testes autorizados. Conferir que generated/prisma de runtime permanece sem
diff. Não mudar o output do schema principal nem regenerar o runtime antes do
rollout das migrações. Essa geração isolada fica como estratégia, não foi executada.

## Próxima etapa

Disponibilizar PostgreSQL local e executar esta suíte em ambiente descartável,
corrigir apenas os defeitos que ela demonstrar e testar o PrismaPg real em ambiente
igualmente isolado. Não publicar nem conectar às rotas atuais antes de comprovar
as garantias, provisionar memberships legítimas e coordenar o corte do checkout.
