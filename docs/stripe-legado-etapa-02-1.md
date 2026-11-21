# Etapa 02.1 — validação PostgreSQL pendente de ambiente

## Resultado da inspeção

Não foi confirmado PostgreSQL local descartável disponível. Não foram encontrados
psql, postgres, initdb ou pg_ctl no PATH; serviços com nome contendo postgres;
processos postgres/pg_ctl; ou instalações em C:\Program Files\PostgreSQL,
C:\Program Files (x86)\PostgreSQL, C:\PostgreSQL e C:\pgsql.
Isso não prova ausência absoluta de uma instalação em outro local.
A consulta de processos via CIM recebeu acesso negado; a consulta alternativa
Get-Process não encontrou processos PostgreSQL visíveis. Não houve conexão TCP
de teste, tentativa de autenticação ou consulta a qualquer banco.

Os testes dependentes de PostgreSQL foram interrompidos. Nenhum serviço foi
instalado/iniciado, nenhum banco foi criado e nenhuma migração foi aplicada.
Não se criou uma conexão alternativa. Credenciais, .env e destinos Neon não
foram consultados. As alterações locais das etapas anteriores foram preservadas.

## Revisão estática da migração

`prisma/migrations/20261107120000_legacy_stripe_inbox/migration.sql` contém apenas
criação de três tabelas e seus índices/constraints. Não contém ALTER de tabelas
anteriores, DROP, backfill ou DML sobre reservas existentes.

- LegacyStripeEvent: PK id; CHECK de status e entregas positivas; índice de fila.
- LegacyStripeAttempt: PK id; FK eventId com RESTRICT; CHECK de resultado; índice.
- LegacyStripeOperation: PK sessionId; UNIQUE nullable paymentIntentId e chargeId;
  FK bookingId com RESTRICT; CHECKs de status, valor e vínculo obrigatório para
  LINKED; índices de situação/data e bookingId.

Booking e stripeChargeId não recebem alteração de dados ou unicidade nova.
As tabelas novas começam vazias; não pressupõem que existam referências financeiras
históricas. Contudo, Booking precisa existir para a FK: no banco descartável será
necessário aplicar primeiro a migração inicial do projeto. Não usar seed.

Os IDs de tentativas são gerados pela aplicação; o SQL não define UUID default
no servidor. Isso corresponde ao uso atual do store. O cliente gerado não foi
atualizado; o store usa SQL parametrizado via APIs existentes do Prisma. Revisão
estática não comprova a execução da migração, os tipos retornados pelo adapter,
o cast do advisory lock, constraints nem comportamento concorrente.

Não foi identificado defeito que justifique alterar a migração sem validação.
SQL, schema e código de produção permaneceram intactos nesta etapa.

## Preparação posterior — pelo responsável pelo ambiente

1. Disponibilizar os binários PostgreSQL locais e informar seu diretório e versão.
   Não usar Docker nem instalar serviços automaticamente para executar esta etapa.
2. Preparar um cluster exclusivo para testes, sem dados reais, em diretório novo
   e identificável. Usar porta própria, por exemplo 55432, e escutar apenas em
   127.0.0.1. Não reaproveitar cluster/banco de desenvolvimento ou credenciais reais.
3. Criar usuário sintético restrito e banco novo `cortz_test_<identificador_unico>`,
   sem privilégios/associações com outros bancos da máquina. Documentar quais
   recursos foram criados para permitir limpeza limitada a eles.
4. Fornecer configuração exclusiva TEST_DATABASE_URL para o futuro runner, nunca
   copiar o .env. Não passar pelo prisma.config.ts atual: ele carrega dotenv e usa
   DATABASE_URL. O cliente de integração deve receber a conexão explicitamente,
   sem fallback para DATABASE_URL, PGHOST, PGSERVICE ou outros defaults libpq.
5. Antes de conectar, validar protocolo PostgreSQL, host literal 127.0.0.1, porta
   exclusiva, usuário de teste e nome exato recém-criado. Rejeitar parâmetros de
   URL adicionais, hosts remotos, Neon, Unix sockets e nomes genéricos de aplicação.
   Só nome contendo "test" ou host localhost não comprovam isolamento.
6. Confirmar por inspeção do provisionamento a origem descartável. A primeira
   conexão autorizada deve conferir servidor local, banco/usuário esperados e
   ausência de tabelas de aplicação antes de qualquer DDL. Falhar fechado se
   houver divergência; não reutilizar banco já existente para tentar novamente.
7. Somente então aplicar a migração inicial e a migração do inbox nesse banco,
   com dados fictícios e Stripe mockado. Não usar Prisma CLI com a configuração
   atual. O executor dedicado de integração ainda precisa ser preparado/revisado
   quando esse ambiente estiver disponível; pnpm test continua sem banco.

Não incluir senha real em documentação, comandos compartilhados ou logs.
Parar e limpar somente os recursos descartáveis comprovadamente criados para
essa execução, após conferir caminhos absolutos e identidade do cluster/banco.
Não executar limpeza recursiva sobre caminho calculado sem validação.

## Matriz de integração a executar após confirmação do ambiente

Todos os cenários abaixo estão NÃO EXECUTADOS, não aprovados por mocks.

| Cenário | Evidência exigida em PostgreSQL |
|---|---|
| Aplicação da migração | Três tabelas, PKs, UNIQUEs, CHECKs, FKs e índices presentes no catálogo |
| Compatibilidade | Fixtures antigas inseridas antes do inbox continuam byte a byte equivalentes nos campos de negócio; referência Stripe preservada |
| Sessão repetida | INSERT direto concorrente/repetido não deixa duas linhas com a mesma sessão |
| Intent/cobrança repetidos | Referências não nulas repetidas são rejeitadas; ausência de referência continua permitida |
| Integridade | FK inexistente, status inválido, valor negativo e LINKED sem bookingId são rejeitados |
| Evento repetido | Store real e processador com Stripe mockado deixam uma operação, entregas/tentativas rastreáveis |
| Dois eventos de uma sessão | Duas conexões e transações independentes convergem para a mesma operação |
| Concorrência financeira | Sessões diferentes disputando o mesmo intent/charge não duplicam o efeito |
| Rollback | Falha entre saveOperation e finish desfaz a operação e conclusão; tentativa registra falha recuperável |
| Resposta perdida | Falha após commit, seguida de replay, não cria efeito financeiro adicional |
| Ordem invertida | Snapshot antigo não rebaixa operação já vinculada; WAITING pode avançar com evento posterior |
| Sem reserva | Fato financeiro e motivo persistem em REVIEW, sem reserva nova |
| Reprocessamento | FAILED/RECEIVED podem ser retomados; REVIEW exige decisão explícita; histórico permanece |
| Locks e falhas | FOR UPDATE/advisory lock funcionam; falha concorrente não rebaixa sucesso |

O runner deverá manter chamadas Stripe/autenticação mockadas e permitir rede
somente para o endereço/porta PostgreSQL descartável autorizado. A guarda
mock-only existente não será enfraquecida para isso: integração exige processo
e configuração próprios. Não existe teste de integração real executado nesta etapa.

## Limite para publicação e próxima etapa

O webhook continua sem autorização para publicação isolada com checkout antigo
ativo. Dependência da migração, ausência de validação PostgreSQL, recuperação
operacional e bloqueio de criação automática seguem pendentes.

Antes da Etapa 03 (estabilização do núcleo), concluir esta validação assim que o
ambiente estiver disponível. A futura etapa deve centralizar disponibilidade,
intervalos, fuso, cancelamento/reagendamento e garantias concorrentes; não iniciar
Pix, assinaturas, deploy ou corte comercial como parte desta verificação.
