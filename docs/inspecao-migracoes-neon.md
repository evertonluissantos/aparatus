# Inspeção de migrações Neon — somente leitura

No terminal integrado do Cursor, na raiz do projeto e com as três variáveis exclusivas de testes já configuradas, executar posteriormente:

```powershell
pnpm neon:inspect:migrations
```

O consentimento esperado continua sendo `CORTZ_ALLOW_NEON_INSPECTION=read-only-test-project`. A conexão vem somente de `CORTZ_TEST_DATABASE_URL`, e a API usa somente `CORTZ_TEST_NEON_API_KEY`. Não colar valores no chat ou armazená-los no repositório. O comando não carrega dotenv nem usa a configuração Prisma da aplicação. Variáveis implícitas de conexão/TLS/preload continuam sendo rejeitadas.

## Reutilização e preservação

`neon:inspect` mantém o comando anterior e sua verificação de banco vazio, inclusive a exigência de CREATE e rejeição de objetos existentes. O novo script package chama o MESMO entry point com `--migrations`; não há outro runner de migrações, provisionamento, assinatura ou limpeza.

Ambos os modos usam os mesmos arquivos de identidade/allowlist, consentimento, normalização da URL, verificações API de projeto/organização/branch/endpoint, TLS com certificado e hostname verificados e channel binding quando exigido. A verificação API ocorre antes de conectar ao PostgreSQL. A identidade de banco/role efetiva, transação READ ONLY e restrições de privilégio são verificadas antes de consultar os catálogos da aplicação.

O novo modo dispensa apenas a exigência de banco vazio e a obrigação de ter CREATE, pois leitura de catálogo não requer escrita. Não relaxa identidade ou TLS. A transação continua REPEATABLE READ READ ONLY, com opções de sessão somente-leitura, timeouts e ROLLBACK ao finalizar.

Destino permitido permanece orange-rice-48468127, branch br-small-surf-b694suzd, endpoint ep-odd-recipe-b69bpw0c, banco cortz_test_integration e role cortz_test_runner. Projeto sparkling-union-52245638 continua proibido pelo mecanismo existente. Divergências, erros TLS/API/permissão ou estruturas inacessíveis interrompem a inspeção, sem fallback ou concessão de privilégios.

## Resultado

- Consulta relações, colunas, índices e constraints por catálogo.
- Lista somente nomes esperados vindos do schema e migrações LOCAIS, presença de colunas, nomes conhecidos de índices/constraints, contagens e objetos inválidos/não validados. Não imprime definições SQL, defaults ou nomes arbitrários do banco, pois podem conter informações sensíveis.
- Consulta `_prisma_migrations` apenas se existir como tabela e possuir as colunas necessárias. Não seleciona logs, IDs ou dados pessoais.
- Mostra as seis migrações preparadas mais a inicial como applied, pending, failed_or_incomplete, checksum_mismatch ou history_inconsistent. Entradas desconhecidas são apenas contadas. Tentativas revertidas não contam como aplicadas.
- Compara checksum com bytes dos arquivos locais. Diferença requer revisão, inclusive de finais de linha; não determina automaticamente a causa nem autoriza reparar histórico.
- Se o histórico estiver ausente, informa absent, sem inferir que o banco está vazio ou que nenhuma alteração foi feita manualmente. Histórico sem colunas suficientes é incompatible_structure. Mesmo histórico aparentemente completo não prova equivalência de todos os tipos, expressões de índices ou constraints: o inventário não é uma ferramenta de diff de schema.
- Verifica btree_gist instalado e disponível no servidor. Disponibilidade não comprova permissão para instalar; nenhuma extensão é criada.
- Conta grupos de OWNER duplicados, incluindo inativos, somente se tabela e colunas necessárias existirem. Não imprime usuários, vínculos ou barbearias envolvidos.
- Conta grupos de slug duplicado não nulo somente se tabela/coluna existirem. Não imprime os slugs.

A leitura de histórico e diagnósticos de registros fica limitada a public e schemas no padrão cortz_run_<32 hex> do runner existente. Outros schemas e relações não reconhecidas são apenas contados e informados como não inspecionados, sem revelar seus nomes ou executar consultas dinâmicas neles. Views, tabelas estrangeiras e materialized views não são aceitas como tabelas para os diagnósticos. Eventual estrutura fora desse escopo exige revisão, não fallback.

Falhas usam o diagnóstico sanitizado já existente; mensagens, causas, stacks, URLs e respostas externas não são exibidas. Se houver erro posterior à emissão do relatório, inclusive no ROLLBACK/desconexão, considerar a execução malsucedida: o marcador final de sucesso não será emitido.

## Arquivos

- package.json: novo comando; comando anterior preservado.
- tests/neon/inspect-readonly.mjs: ramo opcional de leitura de catálogos existentes.
- tests/neon/migration-catalog.mjs: consultas SELECT e projeção segura do relatório, sem conexão própria.
- tests/neon-migration-inspection.test.mjs e tests/core.test.mjs: testes incorporados ao runner offline existente, com rede bloqueada.
- Este documento.

Nenhuma inspeção remota foi executada nesta solicitação. Testes usam respostas fictícias de cliente SQL sob o bloqueio de rede existente. Não comprovam o estado real do banco ou a aplicação de qualquer migração.

Validação local: pnpm test aprovado (131 casos em cada fuso, 262 execuções), TypeScript sem emissão aprovado, ESLint aprovado, node --check aprovado e git diff --check aprovado. Avisos existentes de baseline-browser-mapping e LF/CRLF não bloquearam as verificações. A ausência de colunas visíveis em information_schema também pode resultar de permissões insuficientes; incompatible_structure não comprova por si só a causa.

## Correção pontual: parent_id omitido

O OpenAPI público do Neon define parent_id em Branch como propriedade opcional, fora da lista required: https://github.com/neondatabase/neon-api-python/blob/main/v2.json (components/schemas/Branch). A documentação de branches descreve roots como branches sem pai: https://neon.com/docs/manage/branches . Foram consultados apenas documentos públicos, sem credenciais, chamadas à API de projetos ou conexão SQL.

A validação anterior exigia a presença da propriedade com valor null para aceitar independência. Isso recusava o formato legítimo de resposta com a propriedade omitida. A causa local do erro informado foi essa exigência; não foi verificada a resposta remota completa nem confirmado o tipo efetivo da branch nesta correção.

Apenas neon:inspect:migrations habilita a compatibilidade de leitura com parent_id omitido, depois de conferir id e project_id. Não preenche nem inventa campos. parent_id presente como string continua indicando branch filha e é recusado; undefined explícito, vazio e outros tipos inválidos continuam recusados. A ausência de parent_id acompanhada de parent_lsn ou parent_timestamp permanece ambígua e bloqueada. Ausência/divergência de identidade também permanece bloqueada. A validação de endpoint, banco, role, TLS e READ ONLY não foi alterada.

O modo neon:inspect de banco vazio e o runner assinado de migrações preservam a exigência estrita anterior, sem ativar essa opção. Identificadores locais e proibição do projeto principal não foram modificados.

Testes locais passaram para root com parent_id nulo/omitido, metadados contraditórios, parent explícito/inválido e divergências de projeto, organização, branch e endpoint. pnpm test: 133 casos por fuso, 266 execuções aprovadas. Nenhuma nova inspeção remota foi executada. O comando de leitura pode ser repetido pelo operador, com as variáveis e consentimento já configurados; isso não garante que verificações posteriores de API, TLS ou permissões passarão.
