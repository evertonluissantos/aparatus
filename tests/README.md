# Base de testes — etapa 1

Execute `pnpm test` ou `pnpm test:unit` na raiz. Requer Node 22 e as dependências
já instaladas. Nenhuma dependência nova, instalação, migração ou gateway é usado.
O runner executa a mesma suíte em UTC e America/Sao_Paulo, em processos separados.
Não execute os arquivos diretamente: a guarda recusa ambiente não sanitizado.

Etapa 06B.3: `pnpm test:neon` é exclusivamente offline. O modo remoto separado
agora é `pnpm test:neon:remote`, com consentimento adicional; consulte
`docs/neon-runner-etapa-06b-3.md`. O modo remoto não foi executado nesta
preparação. Exige autorização assinada, trust store revisado, verificação API e
banco vazio no projeto exclusivo de testes. Nenhuma URL da aplicação é aceita
como fallback. Ver `docs/neon-isolado-etapa-06b-1.md` antes de configurar/executar.
`neon-safety.test.mjs` testa apenas as decisões locais de segurança com fakes;
os testes PostgreSQL reais continuam em `tests/postgres/suite.mjs`.

Etapa 06A: `booking-persistence.test.mjs` cobre o protocolo do adaptador com mocks.
`pnpm test:postgres` é uma suíte SEPARADA, não executada por pnpm test. Requer
opt-in e binários PostgreSQL locais; cria seu próprio cluster temporário e não
aceita banco/URL existentes. Ver `docs/persistencia-etapa-06a.md` antes de executar.
Os testes reais preparados não foram executados sem esse ambiente disponível.

A etapa 05 acrescenta `bookings.test.mjs` para regras puras de agenda/fuso e
contratos da fachada com leitor/autorização simulados. O carregador resolve somente
imports relativos allowlisted em `lib/bookings/`, mantendo uma instância por módulo
em cada grafo. Não libera imports genéricos nem acessa persistência de produção.
Ver `docs/nucleo-agendamentos-etapa-05.md` para a política de legado e concorrência.

A etapa 04 acrescenta `authorization.test.mjs`: sessões e consultas SQL são
simuladas para verificar papéis, isolamento e tentativas de escalada. Os guards
novos não foram conectados às rotas antigas. Consultar `docs/autorizacao-etapa-04.md`
para a matriz de permissões e os limites da validação com mocks.

Na etapa 03, `pnpm test:schema` também valida estaticamente o schema Prisma usando
o CLI já instalado, com a mesma guarda e ambiente sanitizado. Usa configuração
explícita sem datasource/URL ou dotenv em `prisma-offline.config.ts`; não usa a
configuração raiz, não gera client e não executa migrações. Não comprova CHECKs
SQL ou integridade PostgreSQL em execução.

## Isolamento

`run.mjs` inicia um processo com uma lista permitida de variáveis operacionais;
não herda DATABASE_URL, credenciais, NODE_OPTIONS ou configuração dotenv. Não lê
`.env`. `guard.mjs` recusa variáveis inesperadas e bloqueia fetch, WebSocket,
HTTP(S), conexão TCP/TLS, UDP, resolução DNS comum e subprocessos.

`load-production.mjs` transpila apenas arquivos explicitamente permitidos em memória,
sem emitir artefatos. Seus imports passam por uma lista fechada: Zod e date-fns
reais; Prisma, autenticação, Stripe e partes do Next substituídos por mocks.
Imports não declarados falham antes de carregar módulos reais. lib/prisma.ts,
Better Auth, Stripe SDK e suas credenciais não são carregados. Os únicos valores
Stripe do contexto são marcadores fictícios, incapazes de autenticar.

Esses bloqueios previnem I/O acidental; node:vm e monkey patches não constituem
uma sandbox de segurança para executar código hostil. Mantenha imports de testes
revisados e fechados; uma futura biblioteca de I/O exige revisão do isolamento.

## O que está sendo caracterizado

Os callbacks e schemas atuais são executados, sem copiar as regras de negócio.
O wrapper de next-safe-action é simulado: aplica o schema e chama o callback;
returnValidationErrors lança um erro observável. Não reproduz transporte,
serialização ou formato de retorno do framework. NextResponse é simulado.

Testes com `known defect` passam quando o defeito atual está presente. Isso NÃO
aprova o comportamento: ao corrigir a produção em outra etapa, devem ser trocados
pelos contratos corretos, não mantidos como requisitos permanentes.

Demonstram: cancelados bloqueando a agenda, aceitação de data passada, duas
inserções após leituras concorrentes vazias, efeito financeiro anterior a falha
do banco. A duplicação do webhook caracterizada na etapa 01 foi substituída por
testes de regressão do inbox na etapa 02 (ver `legacy-stripe.test.mjs`). A concorrência é uma
intercalação determinística com mocks, não prova de comportamento PostgreSQL.
O teste de data caracteriza a conversão usada pelo chat e a consulta da ação;
não chama o modelo de IA. A assinatura Stripe não é validada criptograficamente.

Não há lógica isolada de intervalos/duração/profissional na produção atual para
testar. Não foi criada uma implementação paralela só para tornar esse teste
possível. Componentes React, OAuth, checkout e transporte das ações não são
exercitados. Fixtures são sintéticas e locais, sem copiar dados reais.

## Contratos futuros (não implementados)

- Uma única reserva por profissional para intervalos conflitantes; adjacentes
  permitidos. Duração, expediente, pausas, bloqueios e fuso devem ser respeitados.
- Reservas canceladas liberam capacidade; passado não é aceito.
- Reagendamento malsucedido preserva o intervalo original.
- Agendamento público e chat não dependem de checkout; ambos usam o mesmo núcleo.
- Webhooks repetidos/atrasados não repetem efeitos nem forçam conflito de agenda;
  falhas intermediárias permitem recuperação sem perder histórico financeiro.
- Somente administrador global autorizado confirma mensalidades Pix; repetição
  não duplica confirmação/período. Proprietário não ativa a própria assinatura.
- Cada estabelecimento acessa apenas seus dados privados. Informações públicas
  publicadas são exceção intencional, não permissão administrativa.

## Integração PostgreSQL — autorização e runner separado

As etapas 01–05 não possuíam executor de integração. A etapa 06A preparou o runner
isolado descrito acima; ele continua sem execução nesta máquina. Não usar o .env
ou um banco já existente. Após disponibilizar os binários e autorizar a execução:

1. Provisionar PostgreSQL descartável local, sem rede/credenciais de produção,
   com usuário restrito e nome exclusivo por execução (`cortz_test_<id>`).
2. Usar TEST_DATABASE_URL explícita, sem fallback para DATABASE_URL. Validar
   protocolo, host local, nome e usuário de teste; rejeitar configuração ambígua.
3. Aplicar migrações somente nesse banco descartável; confirmar isolamento antes
   de cada operação destrutiva. Nunca reaproveitar o banco existente.
4. Testar concorrência com conexões independentes, constraints de sobreposição,
   cancelamento, bloqueio concorrente e compatibilidade de migração com legado.
5. Manter Stripe/autenticação externos mockados. Remover apenas recursos criados
   pela execução, após conferir identidade. A suíte unitária continua sem banco.
