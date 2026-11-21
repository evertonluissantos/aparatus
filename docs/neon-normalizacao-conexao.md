# URL original do Neon na inspeção somente de leitura

A inspeção aceita a URL original com sslmode=require e channel_binding=require,
em qualquer ordem. Também aceita sslmode=verify-full, com ou sem channel_binding=require.
Somente esses parâmetros são permitidos, sem duplicatas. Outros sslmode, opções
de host/SSL alternativas, fragmentos, localhost, pooler e identidade divergente
continuam recusados. Não é feita descoberta de projetos ou alteração da identidade.

normalizeInspectionConnection trabalha somente em memória: converte a URL em
host/port/database/user/password e configura ssl.rejectUnauthorized=true e
ssl.servername igual ao hostname esperado. connectionString não é enviada ao pg,
evitando que parâmetros de URL substituam as opções TLS explícitas. Não salva
URL normalizada, credenciais ou arquivos .env. Não registra valores de configuração.

O pg instalado (8.16.3, lib/client.js e lib/crypto/sasl.js) só prefere SCRAM PLUS
quando enableChannelBinding=true; sozinho isso não implementa require. A inspeção
usa uma subclasse local com hooks de autenticação para recusar cleartext, MD5,
SCRAM sem PLUS e ReadyForQuery sem verificação SCRAM final. A seleção SASL é
limitada a SCRAM-SHA-256-PLUS. Em falha registra somente CHANNEL_BINDING_REQUIRED.
Esses hooks são internos do pg: revisar ao atualizar o driver. TLS/canal reais
continuam pendentes de validação remota autorizada; testes locais não os comprovam.

## Execução posterior pelo operador

Após autorização específica para conexão, no PowerShell 7 limpo e sem transcrição:

```powershell
$env:CORTZ_ALLOW_NEON_INSPECTION = 'read-only-test-project'
$env:CORTZ_TEST_DATABASE_URL = Read-Host 'URL original do Neon, exclusiva de testes' -MaskInput
$env:CORTZ_TEST_NEON_API_KEY = Read-Host 'API key exclusiva de testes' -MaskInput
try {
  pnpm neon:inspect
} finally {
  Remove-Item Env:CORTZ_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:CORTZ_TEST_NEON_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:CORTZ_ALLOW_NEON_INSPECTION -ErrorAction SilentlyContinue
}
```

Não editar manualmente sslmode/channel_binding. Usar a URL do banco/role de testes
no endpoint DIRETO já cadastrado, sem pooling. Não usar credenciais principais,
.env/.env.local ou DATABASE_URL. Os segredos ficam temporariamente no ambiente
do terminal/processo confiável; não os colar no chat ou gravar transcrição.

As checagens API de projeto/organização/branch/endpoint continuam antes de SQL.
A transação permanece READ ONLY e a consulta continua recusando objetos e
privilégios inadequados. O runner de migrações e sua política de URL não foram
alterados; esta adaptação é exclusiva do comando neon:inspect.

## Validação local

pnpm test: 113 testes por fuso, 226 aprovados no total; URLs fictícias, seleção
SASL simulada e rejeições exercitadas no pg instalado sem conexão. TypeScript,
ESLint e git diff --check aprovados, com avisos informativos de baseline antiga
e LF/CRLF. Nenhum acesso externo, migração ou escrita em banco foi executado.
