# Etapa 22 — aplicação isolada com Prisma Migrate (preparada, NÃO executada)

> Atualização local da Etapa 24: executorRole configurada como cortz_test_migrator e schema engine 7.1.0 localizado no pnpm. Os bloqueios de role indefinida/engine não localizado descritos no histórico abaixo foram resolvidos localmente; ver a atualização ao final. Nenhuma operação remota foi realizada.

## Comando futuro

```powershell
pnpm neon:migrate:deploy
```

Não executar agora. O executor está deliberadamente indefinido em `tests/neon/migration-executor.json` (`executorRole: null`). O schema engine Windows também não foi localizado pelo caminho verificado na instalação atual. Não houve instalação, conexão, geração de client, migração, alteração de role ou configuração de segredos.

## Arquivos e reutilização

Criados:
- `tests/neon/migrate-deploy.mjs`: invocação fixa da CLI local com ambiente sanitizado e sem repassar stdout/stderr potencialmente sensível.
- `tests/neon/migrate.config.mjs`: config Prisma isolada, sem dotenv/seed/shadow DB; só fornece datasource depois de verificar o destino.
- `tests/neon/migrate-policy.mjs`: escopo fixo, consentimento, URL estrita, verificações API/SQL somente de leitura e validação do histórico.
- `tests/neon/migration-executor.json`: role futura explicitamente não configurada.
- `tests/neon-migrate-deploy.test.mjs` e este documento.

Modificados somente package.json (comando) e tests/core.test.mjs (inclusão dos testes offline). Não foram alterados schema, SQLs, runner remoto existente, inspeção original, UI, autenticação, Stripe ou regras de reservas. Sem novas dependências, serviços, bancos ou branches.

Reutiliza verifyNeonIdentity, normalizeInspectionConnection, inspectionClientClass e inspectMigrationCatalog. Não adapta a suíte de integração para aplicar migrations nem cria um segundo mecanismo de histórico. A execução real e o ledger são do Prisma Migrate existente.

## Sete arquivos revisados

1. 20260531182517_init: estrutura básica, Better Auth, barbearias, serviços e reservas.
2. 20261107120000_legacy_stripe_inbox: persistência Stripe legado, sem ativar checkout.
3. 20261107130000_booking_model_expansion: profissionais, habilitações, horários, bloqueios e campos de reservas.
4. 20261107140000_tenant_authorization: memberships, papéis e GlobalAdmin.
5. 20261107150000_booking_transaction_guards: checks, exclusão GiST, btree_gist e BookingCommand.
6. 20261107160000_single_owner: índice parcial OWNER, incluindo inativos; aborto explícito se houver conflito.
7. 20261107170000_saas_persistence: publicação, slug, status, clientes e evolução de referências históricas.

A sequência é compatível em princípio com execução de SQL pelo Prisma Migrate. As duas últimas têm BEGIN/COMMIT explícitos; não foram modificadas. Não há teste desta execução no PostgreSQL nesta etapa. Migrations posteriores exigem os objetos das anteriores, e a inicial não deve ser repetida se já estiver aplicada. Não há geração de novas migrations.

## Histórico e bloqueios de reaplicação

Prisma migrate deploy aplica pendências e registra `_prisma_migrations` (nome, checksum e estados). Não usa fixtures, reset ou shadow database e não gera Prisma Client. Referência oficial: https://docs.prisma.io/docs/cli/migrate/deploy . Ele não detecta todo drift manual; o preflight também não é um diff completo de schema.

Antes de fornecer o datasource, o preflight:
- Exige exatamente os sete diretórios locais revisados e usa caminhos absolutos para schema/migrations do repositório.
- Recusa entradas de histórico desconhecidas, checksum divergente, falhas/incompletos, duplicidade de sucesso, índices inválidos ou constraints não validadas.
- Exige que migrations aplicadas formem um prefixo da sequência local, sem lacunas.
- Recusa tabelas conhecidas sem histórico e estrutura preexistente com a inicial pendente. Não marca nada como aplicado automaticamente.
- Recusa schemas/relações fora do escopo esperado, inclusive sobras de suítes cortz_run_*, para evitar confundir aplicação em public com ensaio em schema temporário.
- Recusa conflitos OWNER/slug detectados e exige revisão humana de drift/estado não explicado pela inspeção.

Se não houver histórico e o schema de aplicação estiver vazio (com btree_gist previamente instalado), a sequência começa pela inicial. Em banco estruturado sem histórico, interromper e preparar plano de baseline separado após comparar o DDL real. Não usar resolve --applied apenas para passar uma checagem.

## Identidade e segurança

O escopo está fixado em orange-rice-48468127 / org-plain-frog-58714601 / br-small-surf-b694suzd / ep-odd-recipe-b69bpw0c / banco cortz_test_integration, no hostname direto já aprovado. Qualquer alteração desses identificadores locais é recusada. A allowlist deve conter somente o projeto de testes e manter sparkling-union-52245638 na denylist. O projeto principal nunca é consultado.

A configuração isolada verifica novamente a API Neon antes de criar a conexão PostgreSQL e antes de entregar a URL ao Prisma. Reutiliza a compatibilidade documentada de parent_id omitido em roots; branch com pai ou metadados incompatíveis continua bloqueada. Endpoint, branch, organização e projeto devem coincidir. Não há fallback para outro projeto.

O preflight SQL abre REPEATABLE READ READ ONLY, confirma current_database/current_user/session_user, atributos e memberships, faz consultas SELECT e encerra com ROLLBACK. Nenhuma escrita de preflight. A conexão do Prisma só será possível depois disso. Não há criação automática de banco pelo caminho preparado: um banco inexistente falha na conexão prévia e a role não pode ter CREATEDB.

O caminho preparado aceita apenas migrate deploy, com config explícita. A CLI recebe ambiente sanitizado, não DATABASE_URL, DIRECT_URL, variáveis PG, dotenv, NODE_OPTIONS ou overrides Prisma. Não altera `.env` da aplicação. O launcher não repassa saída crua da CLI, URLs, SQL, logs de banco, valores secretos ou exceções; emite status/códigos seguros. Não há logs persistentes de credenciais.

A autorização assinada da suíte remota antiga não é reutilizada: ela autoriza testes em schema descartável, finalidade diferente. Este caminho exige consentimentos específicos de aplicação, role executora local previamente aprovada e verificação efetiva da identidade. Não há nova infraestrutura de chaves/assinaturas.

## Configuração necessária, SOMENTE após autorização

1. Revisar e preencher apenas executorRole no arquivo de configuração, com uma role dedicada já autorizada. Nomes de roles são dados não secretos. Não usar cortz_test_inspector nem cortz_test_runner; ambos são recusados como executores por este caminho.
2. Configurar localmente, sem chat/Git/logs:
   - CORTZ_ALLOW_TEST_MIGRATIONS: project ID de testes exato (orange-rice-48468127).
   - CORTZ_EXECUTE_TEST_MIGRATIONS: apply-reviewed-migrations, consentimento separado de inspeção/testes.
   - CORTZ_MIGRATION_DATABASE_URL: URL exclusiva da role executora, endpoint direto, banco exato.
   - CORTZ_TEST_NEON_API_KEY: chave com acesso somente ao projeto de testes.
3. A URL do motor nativo deve ter exatamente sslmode=require, sslaccept=strict e schema=public. Host/porta/banco/usuário devem coincidir com o escopo. Não passar opções adicionais, pooler, outro schema ou parâmetros para ignorar certificados. Referência TLS Prisma: https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql . O schema engine de Migrate é distinto do driver PrismaPg usado pela aplicação.
4. Não converter silenciosamente channel_binding=require para outra política: essa URL é recusada, pois a equivalência do parâmetro no motor nativo não foi comprovada. A URL de inspeção permanece independente e inalterada. A conexão pg de preflight usa verificação explícita de certificado/hostname.
5. Garantir o schema engine nativo Windows da instalação local do Prisma. O launcher recusa engine ausente ou plataforma diferente; não instala nem baixa binários. Preparar essa dependência separadamente, com autorização, se necessário.

Não basta usar a URL da role de inspeção: ela continuará exclusivamente de leitura.

## Role e btree_gist

A role executora deve possuir LOGIN, CONNECT no banco, USAGE e CREATE no schema public e ownership das tabelas públicas já existentes (incluindo o ledger), porque GRANT ALL por si só não permite ALTER TABLE. O preflight recusa tabelas públicas pertencentes a outra role, sem tentar transferir ownership. Para banco de aplicação vazio, ela será proprietária dos objetos que criar.

Os cinco atributos administrativos devem ser false e memberships devem ser zero. Não necessita CREATEROLE, CREATEDB, REPLICATION ou BYPASSRLS; não conceder neon_superuser ou pg_read_all_data. Nenhum grant ou alteração de role está incluído nesta etapa.

Para manter esses privilégios mínimos, o caminho exige btree_gist JÁ instalado no schema public. A migração preserva CREATE EXTENSION IF NOT EXISTS. Instalação da extensão, se ainda ausente, deve ser feita pelo operador apropriado em operação separada e especificamente autorizada, sem ampliar a role migradora ou retirar a exclusão GiST. O estado remoto dessa extensão não foi verificado nesta etapa.

## Plano mínimo de execução e recuperação

Antes: obter o relatório completo da inspeção, resolver conflitos ou baseline pendente, validar papel/ownership, extensão, binário e URL, definir recuperação verificável do banco de testes e revisar possíveis locks. Manter janela sem outros writers/DDL, mudanças de endpoint ou permissões. Os locks do Prisma não impedem SQL externo arbitrário.

Executar somente após aprovação explícita usando o comando acima. Nada de fixtures ou importação dos dados demonstrativos. O sucesso do DDL não ativa login, catálogo persistente ou reservas reais.

Depois: usar pnpm neon:inspect:migrations com a URL de cortz_test_inspector, conferir sete migrations aplicadas e checksums, constraints, índices, unicidade OWNER e FKs de tenant. A leitura do ledger recém-criado pode exigir grant SELECT específico pelo proprietário, sob autorização separada. Testar concorrência, rollback e compatibilidade do novo client em etapa autorizada própria; não confundir aplicação com teste de integração.

Em falha ou timeout: parar; não repetir automaticamente. Verificar histórico e catálogo em leitura. Migrations concluídas permanecem registradas; uma execução interrompida pode ter alterações parciais, especialmente nas migrations sem transação explícita. Não apagar ledger, executar reset, DROP, db push ou resolve automaticamente. Comparar objetos reais e migration antes de propor reparo/restore, com nova autorização. A recuperação não consiste em presumir rollback global das sete migrations.

## Provas locais e limites

Testes usam apenas fixtures e mocks sob o guard existente que bloqueia rede. Cobrem configuração/consentimento, projeto/branch/endpoint/banco incorretos, roles proibidas, TLS, ordem API antes de SQL, transação READ ONLY/ROLLBACK, privilégios, extensão e histórico. Não houve execução de Prisma Migrate, conexão ao Neon ou alteração remota.

O carregamento da config pela CLI e o motor nativo contra PostgreSQL ainda dependem de verificação futura autorizada; testes de sintaxe e mocks não comprovam essa integração. Identidade, privilégios e condições atuais do banco não foram reconfirmados nesta etapa. O diretório de guias Next.js não é relevante para estes arquivos: não há alteração Next/UI.

Resultados locais: pnpm test aprovado (142 casos por fuso UTC/São Paulo, 284 execuções); pnpm test:schema aprovado pelo config offline; TypeScript sem emissão, ESLint, node --check dos três módulos e git diff --check aprovados. Avisos existentes: baseline-browser-mapping desatualizado e LF/CRLF. Nenhum comando migrate deploy foi executado, nem mesmo como ensaio. O comando futuro permanece bloqueado pela configuração incompleta e dependência nativa não localizada.

## Etapa 24 — configuração local finalizada

Arquivos desta etapa: tests/neon/migration-executor.json, tests/neon/local-prisma-engine.mjs (novo helper, não outro runner), tests/neon/migrate-deploy.mjs, tests/neon/migrate.config.mjs, tests/neon-migrate-deploy.test.mjs e este documento. Nenhum SQL, schema, package.json ou runner de integração foi alterado.

### Causa e correção do engine

O executável já existia em node_modules/.pnpm/@prisma+engines@7.1.0/node_modules/@prisma/engines/schema-engine-windows.exe. A resolução Node a partir do pacote prisma não alcançava esse pacote nesta disposição local de node_modules. Portanto, não se tratava de ausência do binário.

O helper tenta a resolução normal e, se ela falhar, usa apenas a localização pnpm da versão exata declarada nas dependências do Prisma instalado. Confere nome/versão do pacote, presença do executável e commit exigido por @prisma/engines-version; não escolhe arbitrariamente outra versão no cache. O binário 6.18.0 também existe e não é aceito como substituto.

O launcher executa somente --version antes da aplicação e compara com schema-engine-cli ab635e6b9d606fa5c8fb8b1a7f909c3c3c1c98ba. Fixa o caminho no PRISMA_SCHEMA_ENGINE_BINARY do processo filho. O config aceita esse único override interno apenas depois de conferir o caminho exato do helper e o marcador do launcher. Overrides externos continuam recusados no processo pai; os outros PRISMA_* também continuam recusados no config. Não houve download, instalação, cópia de engine, mudança de dependência ou alteração em node_modules.

### Verificação das migrações e configuração

A função de descoberta de diretórios do Prisma Migrate 7.1.0 instalado foi executada isoladamente em VM, com apenas leitura de arquivos e paths disponíveis. Reconheceu, na ordem: inicial 20260531182517 e seis migrações 20261107120000, 130000, 140000, 150000, 160000 e 170000, todas com migration.sql legível. Esse ensaio não executa a CLI de deploy/status, não recebe datasource e não prova execução do DDL.

O config explícito continua sem dotenv, seed, fixtures ou shadow DB. O loader instalado de configuração do Prisma também declara dotenv:false; o prisma.config.ts da aplicação não é usado pelo comando preparado. O engine não recebe URL ou credenciais durante a verificação local de versão.

Os testes mantêm a recusa de banco com objetos desconhecidos, tabelas sem baseline, histórico fora de ordem/desconhecido/falho/divergente, índices inválidos, privilégios indevidos e extensão fora de public. O perfil agora exige cortz_test_migrator, exclusivamente no caminho de migração; não altera as roles de inspeção ou da suíte.

### Bloqueios que permanecem

A configuração local da role não comprova seu estado remoto. As confirmações sobre role e btree_gist 1.8 em public foram fornecidas pelo operador e não foram reconfirmadas por conexão nesta etapa. O próximo acesso continuará exigindo os dois consentimentos, API key de testes e CORTZ_MIGRATION_DATABASE_URL da role migradora, com parâmetros TLS estritos especificados acima. O preflight de API/SQL será obrigatório antes do Prisma receber a URL.

Ainda são necessários autorização explícita para executar, revisão do relatório do banco e recuperação previamente definida. A aplicação real, o carregamento do config dentro da CLI de deploy e os resultados das sete migrations no PostgreSQL não foram executados/testados aqui. Nenhuma confirmação local autoriza ignorar erros de identidade, TLS, permissão ou histórico.

Comando permanece pnpm neon:migrate:deploy, apenas para futura execução autorizada. Não o executei nesta etapa.

Resultados da Etapa 24: 144 testes por fuso (288 execuções) aprovados; schema Prisma offline, TypeScript sem emissão, ESLint, node --check e git diff --check aprovados. SHA-256 antes/depois confirmou as sete migrações sem nenhuma alteração. Avisos não bloqueantes existentes: baseline-browser-mapping e LF/CRLF.
