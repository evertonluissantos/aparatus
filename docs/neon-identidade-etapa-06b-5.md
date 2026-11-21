# Etapa 06B.5 — identidade cadastrada, execução bloqueada

Os IDs foram fornecidos pelo operador, sem consulta ao Neon. project-identity.json
registra exatamente projeto, organização, branch, endpoint, hostname, banco e role
de testes informados. O trust store permite apenas orange-rice-48468127 e proíbe
sparkling-union-52245638. A branch principal br-floral-shape-ac0l1t95 não é usada:
o bloqueio é de todo o projeto principal, não somente de sua branch.

publicKeyPem permanece null: não é uma chave placeholder aceita; createPublicKey
recusa essa entrada. Nenhuma autorização ou par de chaves foi gerado nesta etapa.
keyId reutiliza o Endpoint ID fornecido como rótulo local da chave; não é outro
identificador Neon. authorizationId será um UUID local gerado a cada preparação.

## Preparação local posterior, pelo responsável pela assinatura

1. Confirmar manualmente que a branch indicada é independente (parent_id nulo),
   o banco é exclusivo e vazio e a role atende às restrições da 06B.3. IDs não
   comprovam esses fatos. O script não os verifica remotamente.
2. Criar um diretório privado, novo para esta autorização, FORA do repositório,
   preferencialmente fora de sincronização em nuvem. Restringir a ACL Windows ao
   responsável. mode 0600 do Node não substitui a ACL no Windows.
3. Em PowerShell 7 limpo, sem transcrição, executar os comandos abaixo. O caminho
   é informado interativamente, não é um identificador remoto inventado.

```powershell
$signingDirectory = Read-Host 'Caminho absoluto do diretório privado já criado fora do repositorio'
$env:CORTZ_AUTHORIZATION_PASSPHRASE = Read-Host 'Senha forte exclusiva da chave (minimo 16 caracteres)' -MaskInput
$env:CORTZ_CONFIRM_SIGNING_SCOPE = 'orange-rice-48468127'
try {
  node tests/neon/prepare-authorization.mjs $signingDirectory
} finally {
  Remove-Item Env:CORTZ_AUTHORIZATION_PASSPHRASE -ErrorAction SilentlyContinue
  Remove-Item Env:CORTZ_CONFIRM_SIGNING_SCOPE -ErrorAction SilentlyContinue
}
```

O consentimento de assinatura atesta os fatos do passo 1 e autoriza incluir as
permissões de schema/extensão no manifesto. Não equivale ao consentimento remoto.
Senha fica temporariamente no ambiente do processo: executar em terminal confiável
e dedicado. Não colar segredos no chat ou registrar o terminal.

O script bloqueia rede/subprocessos, usa somente Node e verifica a assinatura pelo
contrato existente antes de gravar. Cria private-key.pem cifrado AES-256-CBC/PKCS8,
public-key.pem e authorization.json com validade de uma hora. Não sobrescreve
arquivos existentes, não altera o trust store e não imprime material de chave.
Falha parcial pode deixar arquivos locais cifrados; revisar manualmente e usar
outro diretório novo. Não existe limpeza remota ou geração de credenciais Neon.

4. Revisar a chave pública e copiar SOMENTE o conteúdo de public-key.pem para
   publicKeyPem da entrada existente em tests/neon/trusted-projects.json,
   preservando PEM e quebras de linha como string JSON. Não copiar private-key.pem.
   Não adicionar outros projetos ou alterar as listas. A chave privada permanece
   exclusivamente com o responsável. Gerar novamente cria outra chave, exigindo
   novo cadastro revisado; guardar autorizações antigas não renova seu prazo.
5. Na etapa posterior, fornecer as cinco variáveis da 06B.3 via terminal dedicado:
   CORTZ_ALLOW_REMOTE_TESTS=neon-disposable; CORTZ_TEST_PROJECT_ID igual ao projeto
   permitido; CORTZ_NEON_AUTHORIZATION_FILE com caminho absoluto de authorization.json;
   CORTZ_TEST_DATABASE_URL e CORTZ_TEST_NEON_API_KEY somente de testes, por entrada
   oculta/gerenciador de segredos. Não usar .env, DATABASE_URL ou PG*. URL direta
   com apenas sslmode=verify-full; não inventar senha/token para completar validação.
   Nenhuma dessas variáveis ou modo remoto foi configurado nesta etapa.
6. Executar pnpm test:neon somente após o preenchimento real para pré-validação
   offline. Não executar pnpm test:neon:remote nem definir CORTZ_EXECUTE_REMOTE_TESTS
   sem nova autorização específica.

## Pendências para conexão futura

Assinatura e cadastro da chave pública; credenciais exclusivas; pré-validação
offline completa; autorização específica de execução. API/organização/branch raiz,
TLS, memberships da role, extensões, banco vazio, migrações e PrismaPg ainda não
foram comprovados remotamente. O script não transforma declarações em evidência.

## Validação local desta entrega

- pnpm test executado duas vezes: 107 testes por fuso, 214 por execução, sem falhas.
- TypeScript sem emissão/sem incremental: aprovado.
- ESLint do script novo: aprovado, apenas aviso de baseline-browser-mapping antigo.
- git diff --check: aprovado; avisos de normalização LF/CRLF no workspace.
- Sintaxe do script conferida; geração real de chave/assinatura NÃO executada.
- Nenhuma conexão, migração, variável remota ou credencial real configurada.
- Alterações preexistentes preservadas. Nenhuma dependência adicionada.

Arquivos desta etapa: tests/neon/trusted-projects.json (modificado),
tests/neon/project-identity.json, tests/neon/prepare-authorization.mjs e este
relatório (criados). Os scripts do runner e o contrato de verificação permanecem
inalterados. Próximo passo é o responsável preparar a assinatura e cadastrar a
chave pública; a execução remota continua exigindo outra autorização.
