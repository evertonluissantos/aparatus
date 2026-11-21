# Etapa 06B.3 — correções locais, sem conexão

## Comandos separados

- `pnpm test:neon`: somente pré-validação offline. Instala bloqueios de rede,
  DNS, sockets, HTTP, TLS e subprocessos antes de ler configuração. Não importa
  pg, Prisma, runner remoto ou suíte PostgreSQL. Não carrega arquivos .env.
- `pnpm test:neon:remote`: runner anterior, separado e NÃO executado nesta etapa.
  Exige adicionalmente CORTZ_EXECUTE_REMOTE_TESTS=execute-approved-neon-run.
  Esse consentimento deve ser fornecido somente após autorização específica.

A pré-validação exige as mesmas cinco variáveis documentadas na 06B.1; verifica
formato da URL, chave pública Ed25519 cadastrada, assinatura, prazo máximo de 24h,
escopo exato e listas permitidas/proibidas sem interseção. A API key é exigida como
configuração completa, mas sua validade não é comprovada offline. Saída contém
somente sucesso genérico ou código de erro; nunca valores, URL, payload ou stack.
O trust store continua vazio: não há inicialização automática nem confiança inicial
implícita. É necessário cadastrar deliberadamente chave pública e IDs revisados.

## Correções

O filtro de namespaces usa regex `!~ '^pg_'`: o underscore é literal e pgx é
considerado namespace de usuário. Relações de todos os tipos, funções, tipos,
operadores, collations, schemas extras, foreign servers/wrappers, publicações e
large objects impedem considerar o banco vazio. Extensões diferentes de plpgsql
continuam recusadas. Memberships de roles são recusadas, inclusive NOINHERIT,
pois SET ROLE também pode conceder privilégios; nenhum privilégio foi relaxado.
São verificações conservadoras, não uma auditoria de todos os objetos possíveis
ou uma barreira contra administradores externos e escritas fora do protocolo.

Os testes de catálogos são simulados: verificam a consulta e a decisão antes de
DDL, mas não executam SQL nem comprovam o comportamento de PostgreSQL real.

## Procedimento mínimo e checklist

1. Pelo responsável, conferir IDs não secretos do projeto exclusivo, organização,
   branch independente e endpoint direto; obter o ID principal de registros já
   conhecidos, sem acessar o projeto principal, e incluí-lo em forbiddenProjectIds.
2. Revisar o trust store fixo e inserir chave pública, organização, projeto permitido
   e projeto principal proibido. Chave privada permanece fora do repositório.
3. Preparar autorização assinada conforme payload/envelope da 06B.1, prazo <=24h,
   com os IDs, host, banco vazio e role exclusivos aprovados. Não incluir segredos.
4. Em terminal limpo, fornecer as cinco variáveis explicitamente por mecanismo
   seguro; nenhuma senha, URL ou API key deve ser colada no chat. Não usar .env,
   DATABASE_URL, PG*, NODE_OPTIONS ou overrides TLS. Executar `pnpm test:neon`.
5. Rever o resultado local. Sucesso NÃO autoriza conexão nem comprova identidade
   remota, senha, permissões, TLS, banco vazio, migrações ou PrismaPg.
6. Solicitar autorização específica antes de definir o consentimento adicional
   de execução e executar `pnpm test:neon:remote` na próxima etapa.

### Verificações remotas ainda pendentes

- Campos reais API project.org_id, branch.project_id/parent_id e endpoint: os
  contratos estritos foram preservados, sem inventar respostas. Ausência bloqueia.
  A disponibilidade de branch raiz independente deve ser comprovada, não presumida.
- Memberships podem existir em roles gerenciadas Neon; a política conservadora pode
  impedir o runner. Revisar evidências antes de aceitar qualquer role herdada.
- Bancos novos podem trazer extensões gerenciadas. Não há evidência local sobre
  quais; a allowlist não foi ampliada. btree_gist e permissões permanecem pendentes.
- URL aceita somente sslmode=verify-full, sem pooler ou parâmetros adicionais.
  O pg recebe rejectUnauthorized:true e servername explícito. Cadeia de confiança,
  certificado, DNS e compatibilidade do serviço exigem execução autorizada futura.
- TLS, queries de catálogo, locks, constraints, migrações e PrismaPg continuam não
  comprovados. Nenhuma consulta ou migração foi realizada nesta etapa.

## Complexidade e recomendação

Para uso individual, uma assinatura feita e verificada pela mesma pessoa não
constitui aprovação independente. Manter chaves, assinaturas e validade acrescenta
custo operacional; também não impede um operador de editar código e trust store.
Recomendo discutir numa etapa própria um manifesto local revisado, IDs fixos de
projeto permitido/proibido, vínculo verificado pela API, credenciais exclusivas e
consentimento explícito imediatamente antes da escrita. Isso pode substituir a
assinatura se não houver segundo aprovador real. Nenhuma proteção foi removida
agora. O modo offline valida os arquivos locais, não a veracidade dos IDs fornecidos.

O bloqueio JavaScript reduz acidentes; não é sandbox contra código malicioso,
addons nativos ou código pré-carregado. Usar processo/terminal limpo continua
necessário. O runner remoto retém schema para inspeção e nunca faz DROP remoto.

## Resultados locais desta etapa

- pnpm test, duas execuções: 107 testes aprovados por fuso (UTC e
  America/Sao_Paulo), 214 por execução; nenhuma falha.
- pnpm test:neon com configuração integralmente fictícia: recusa esperada
  PROJECT_NOT_TRUSTED pelo trust store vazio, sem conexão. Saída sem segredos.
- TypeScript sem emissão e sem incremental: aprovado.
- ESLint dos seis módulos alterados/criados: aprovado; somente aviso informativo
  preexistente de baseline-browser-mapping desatualizado; nada foi instalado.
- git diff --check: aprovado, com avisos de normalização LF/CRLF do workspace.
- Nenhum serviço real, migração, banco, API Neon ou Stripe foi acessado.

Arquivos desta etapa: package.json; tests/neon/identity.mjs, run.mjs,
remote-run.mjs (cópia do runner remoto anterior com consentimento adicional),
preflight.mjs e offline-guard.mjs; tests/neon-safety.test.mjs; tests/README.md;
docs/neon-isolado-etapa-06b-1.md e este relatório. Nenhuma dependência adicionada.
As alterações anteriores foram preservadas.
