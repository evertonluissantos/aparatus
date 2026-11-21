# Etapa 06B.7 — procedimento somente de leitura, ainda não executado

Atualização: a inspeção agora aceita a URL original sslmode=require com
channel_binding=require, normalizando TLS apenas em memória. Consulte
neon-normalizacao-conexao.md; a exigência histórica de somente verify-full abaixo
foi substituída por esse procedimento, mantendo validação de certificado/hostname.

Comando separado: `pnpm neon:inspect`. NÃO executar antes de autorização específica
para as conexões externas desta inspeção. Não usa assinatura, geração de chave,
Prisma, migrações, seeds ou runner remoto. O trust store continua sem chave pública.

## Escopo e ordem

1. Exigir CORTZ_ALLOW_NEON_INSPECTION=read-only-test-project. Recusar DATABASE_URL,
   TEST_DATABASE_URL, PG*, NODE_OPTIONS, configurações dotenv e override TLS.
2. Ler identidade local e listas fixas; exigir somente o projeto de testes na
   allowlist, organização esperada e o projeto principal explicitamente proibido.
3. Validar URL direta contra host, database e role cadastrados, porta 5432,
   certificado/hostname verificados, somente sslmode=verify-full.
4. Fazer exclusivamente GET, sem redirects, nos três caminhos da API:
   /projects/orange-rice-48468127
   /projects/orange-rice-48468127/branches/br-small-surf-b694suzd
   /projects/orange-rice-48468127/endpoints/ep-odd-recipe-b69bpw0c
   Comparar os IDs, project.org_id, branch.project_id/parent_id e endpoint
   project_id/branch_id/host/type. parent_id deve ser explicitamente null e type
   read_write. Campos ausentes são inconclusivos e interrompem antes do PostgreSQL.
   O contrato real da API continua não comprovado; não inferir independência se
   a API omitir parent_id. Não consultar o projeto principal ou listar projetos.
5. Só depois, conectar exclusivamente ao endpoint validado. Bloquear outras redes,
   subprocessos e HTTP pela guarda PostgreSQL existente. Startup define
   default_transaction_read_only=on; abrir REPEATABLE READ READ ONLY com timeouts.
6. Consultar catálogos: banco, usuário da sessão e corrente, modo read-only,
   superuser/CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS, memberships (todas recusadas)
   e permissão CREATE no banco (necessária para schema futuro).
7. Contar os mesmos grupos de objetos conservadores da política atual: schemas
   extras, relações de todos os tipos, funções, tipos, operadores, collations,
   extensões diferentes de plpgsql, FDWs/servers, publicações e large objects.
   Qualquer presença impede aprovação. pgx é tratado como schema de usuário.
8. ROLLBACK e encerrar conexão. Sem advisory locks, CREATE, DROP, INSERT, UPDATE,
   DELETE, TRUNCATE ou operações de limpeza. Não há relatório automático em disco,
   alteração de trust store ou autorização emitida. Saída somente resultado fixo,
   sem URLs, API responses, credenciais ou stack de driver.

## Credenciais e execução futura pelo operador

Usar somente credenciais criadas exclusivamente no projeto de testes. Preferir
API key limitada à leitura dos metadados desse projeto, conforme escopos realmente
disponíveis na conta. A aplicação faz só GET; isso não reduz permissões de uma
chave ampla. Não reutilizar senha, token ou connection string da aplicação.

Após autorização específica, em PowerShell 7 limpo, sem transcrição:

```powershell
$env:CORTZ_ALLOW_NEON_INSPECTION = 'read-only-test-project'
$env:CORTZ_TEST_DATABASE_URL = Read-Host 'URL direta SOMENTE de testes, sslmode=verify-full' -MaskInput
$env:CORTZ_TEST_NEON_API_KEY = Read-Host 'API key exclusiva de testes' -MaskInput
try {
  pnpm neon:inspect
} finally {
  Remove-Item Env:CORTZ_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:CORTZ_TEST_NEON_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:CORTZ_ALLOW_NEON_INSPECTION -ErrorAction SilentlyContinue
}
```

Não colar segredos no chat, argumentos literais do terminal ou repositório.
Não carregar .env/.env.local. Variáveis vivem temporariamente no processo; usar
terminal confiável e encerrar depois. Não definir CORTZ_EXECUTE_REMOTE_TESTS.

## Limites e interpretação

Identificadores locais são expectativas, não prova: a aprovação depende da API e
das consultas reais. Esta etapa apenas preparou o comando; nenhuma dessas fontes
foi acessada. Ausência de dados nos catálogos é uma fotografia da transação; não
prova ausência de escritores futuros ou exclusividade administrativa. O snapshot
da API e o snapshot SQL não são uma transação distribuída. Uma aprovação não é
autorização de migração e não substitui as guardas do runner na hora de executar.

CREATE no banco é consultado, nunca exercido. Instalação de btree_gist, DDL, locks,
PrismaPg e permissões suficientes para migrações não são comprovados por leitura.
Extensões/roles gerenciadas Neon podem causar recusa conservadora; revisar a
evidência sem relaxar automaticamente a política. READ ONLY é proteção de sessão,
não uma role incapaz de escrita. Nenhuma alteração durável é solicitada; conectar
pode ativar compute e gerar logs administrativos normais do provedor.

Se a verificação falhar, não gerar manifesto declarando isolamento. Revisar
separadamente a causa, sem imprimir dados sensíveis ou executar correções no banco.
