# Etapa 06B.1 — runner Neon preparado, não executado

## Estado

Não houve chamada HTTP real, conexão PostgreSQL, geração de client, migração,
criação de projeto/branch/schema remoto ou limpeza remota nesta etapa. O modo
local da 06A continua separado e sua guarda de loopback não foi enfraquecida.
Nenhum fluxo de aplicação, Stripe ou arquivo de migração foi modificado.

Atualização 06B.3: `pnpm test:neon` agora é exclusivamente offline. Consulte
`docs/neon-runner-etapa-06b-3.md` para o procedimento e limitações atuais.

`pnpm test:neon:remote` é um comando futuro e perigoso se configurado incorretamente:
aplica migrações e escreve fixtures, exclusivamente após verificações abaixo.
Não é chamado por pnpm test. O trust store entregue está VAZIO, bloqueando toda
execução remota até configuração revisada e autorização assinada.

## Identidade: três fontes, não somente variáveis ou nome do banco

1. Trust store fixo `tests/neon/trusted-projects.json`: chave pública Ed25519,
   organização esperada, projetos de teste explicitamente permitidos e projetos
   reais explicitamente proibidos. Não é substituível por caminho de ambiente.
2. Autorização assinada por responsável independente, com projeto, branch,
   endpoint, hostname, database e role exatos, finalidade, permissões e validade
   máxima de 24h. Nenhuma chave privada é entregue ou guardada no repositório.
3. No futuro run, API Neon via HTTPS verifica projeto/organização, branch sem
   pai e endpoint read_write com host e branch exatos. Apenas GETs sob o projeto
   autorizado; sem redirects, listagem de outros projetos ou criação de recursos.

Projeto proibido ou não permitido é recusado ANTES de qualquer chamada de API.
Manifesto expirado, assinatura inválida, campo ausente, branch clonada ou resposta
de API inconclusiva interrompem o processo. Nome "test" não é prova de isolamento.
IDs reais da aplicação devem ser obtidos/revisados pelo responsável sem ler o
.env ou fornecer suas credenciais ao runner. Não há descoberta automática deles.

O contrato de resposta da API foi implementado de forma estrita, mas NÃO foi
exercitado contra o Neon: espera project.id/org_id, branch.id/project_id/parent_id
e endpoint.id/project_id/branch_id/host/type. Campo omitido ou diferente causa
recusa, não inferência. Se a API/conta não fornecer essas evidências, essa parte
da execução permanece bloqueada até revisão; não retirar as verificações.

Após verificação remota, o launcher grava evidência efêmera de projeto e instante
no diretório da execução. O worker exige evidência recente e revalida a assinatura
localmente; não recebe a chave de API real e não pode consultar a API.

## Preparação manual do ambiente (não realizada aqui)

1. Criar MANUALMENTE um projeto Neon exclusivo e vazio, fora do projeto da
   aplicação. Preferir organização/credencial de testes separadas da produção.
2. Usar branch independente (parent_id nulo comprovável), não clone de branch
   com dados reais. Se esse tipo de branch não estiver disponível/verificável,
   parar. O runner não cria branches e não conecta a um clone por conveniência.
3. Preparar banco novo chamado cortz_test_<identificador>, sem tabelas, views,
   sequências, foreign tables ou extensões de usuário. Apenas plpgsql é aceito
   inicialmente. Não usar neondb compartilhado nem reaproveitar banco usado antes.
4. Preparar role exclusiva desse ambiente, sem superuser, CREATEROLE ou CREATEDB,
   com permissão suficiente no banco de teste para criar schema e btree_gist.
   Se a política Neon impedir a extensão, o teste deve falhar e ser revisado.
5. Obter connection string DIRETA do endpoint, sem -pooler. TLS deve verificar
   certificado/hostname (`sslmode=verify-full`). Não fornecer parâmetro host,
   options, múltiplos sslmode, localhost, IP literal ou URL da aplicação.
6. Preparar uma chave de API dedicada, com o menor escopo disponível para ler
   metadados do projeto de testes. Nunca reutilizar a chave da aplicação. O código
   só consulta o projeto permitido e não registra a chave.
7. Revisar e inserir a chave PÚBLICA do autorizador e os IDs não secretos no trust
   store. Manter allowedTestProjectIds e forbiddenProjectIds sem interseção e
   incluir explicitamente o ID real na lista proibida. Lista proibida vazia falha.
8. O autorizador assina os bytes UTF-8 do payload abaixo com Ed25519. Conservar a
   chave PRIVADA fora do repositório, com o responsável. Nenhuma autorização é
   criada/assinada automaticamente pelo runner ou derivada das variáveis.

Exemplo estrutural de entrada em authorizers (valores ilustrativos, não utilizáveis):

```json
{
  "keyId": "test-authorizer",
  "publicKeyPem": "PEM PUBLICO ED25519 REVISADO",
  "organizationId": "org-tests",
  "allowedTestProjectIds": ["project-tests"],
  "forbiddenProjectIds": ["project-real"]
}
```

Payload de autorização; preencher IDs efetivamente aprovados e timestamps atuais:

```json
{
  "version": 1,
  "purpose": "cortz-neon-disposable-tests",
  "authorizationId": "approval-unique-id",
  "projectId": "project-tests",
  "organizationId": "org-tests",
  "branchId": "br-approved-empty",
  "endpointId": "ep-approved-empty",
  "hostname": "ep-approved-empty.us-east-2.aws.neon.tech",
  "database": "cortz_test_unique",
  "role": "cortz_test_role",
  "independentEmptyBranch": true,
  "allowCreateTestSchema": true,
  "allowTestExtensions": true,
  "cleanup": "manual-branch-review",
  "issuedAt": "2026-11-07T12:00:00Z",
  "expiresAt": "2026-11-07T13:00:00Z"
}
```

Envelope JSON lido pelo runner:

```json
{
  "keyId": "test-authorizer",
  "payloadBase64": "BASE64URL_DOS_BYTES_UTF8_DO_PAYLOAD",
  "signatureBase64": "BASE64URL_DA_ASSINATURA_ED25519_DOS_MESMOS_BYTES"
}
```

Assinar com crypto.sign(null, payloadBytes, privateKey) ou ferramenta administrativa
equivalente; não reserializar/editar o payload depois de assinado. Nenhum segredo
de banco ou API deve constar no payload, envelope ou trust store. Os exemplos de
datas expiram e devem ser substituídos; não aumentar validade além de 24h.

## Variáveis para futura execução

| Variável | Uso |
|---|---|
| CORTZ_ALLOW_REMOTE_TESTS | Consentimento literal neon-disposable |
| CORTZ_TEST_PROJECT_ID | Deve coincidir com trust store e assinatura |
| CORTZ_TEST_DATABASE_URL | URL somente do banco de testes, direta e com verify-full |
| CORTZ_TEST_NEON_API_KEY | Chave dedicada de metadados, somente no launcher |
| CORTZ_NEON_AUTHORIZATION_FILE | Caminho absoluto do envelope assinado |

Fornecer segredos por mecanismo seguro no terminal dedicado, sem colá-los no chat,
logs ou arquivos do repositório. Não usar .env/.env.local, DATABASE_URL, PG*, dotenv,
NODE_OPTIONS ou NODE_TLS_REJECT_UNAUTHORIZED. O launcher rejeita configuração
implícita e só encaminha valores explícitos de teste ao worker. Não consegue
desfazer código já pré-carregado antes de sua execução: usar terminal limpo.

Depois de configurar e obter autorização ESPECÍFICA para executar remotamente:

```powershell
pnpm test:neon:remote
```

Não executar esse comando nesta etapa de preparação. Não é necessário instalar
PostgreSQL, psql, initdb, pg_ctl, Docker ou dependências novas.

## Ordem do futuro runner

1. Validar variáveis, TLS, assinatura, allowlist/denylist e validade sem rede.
2. Gerar client Prisma expandido em tests/.neon-generated-<aleatorio> usando
   schema copiado/config explícita sem URL/dotenv, sob a guarda offline existente.
   Compilar apenas esses arquivos gerados para JS ESM. generated/prisma não muda.
3. Verificar os três recursos pela API; não usa SQL nem acessa projeto real.
4. Worker conecta via TLS somente ao hostname/5432 autorizado. DNS só para esse
   hostname; HTTP, fetch, UDP, subprocessos e outros destinos são bloqueados.
5. Conferir current_database/current_user e privilégios, tomar advisory lock de
   sessão contra outro runner cooperante e consultar somente catálogos. Se houver
   relações de usuário ou extensões além de plpgsql, recusar ANTES de qualquer DDL.
6. Criar namespace novo cortz_run_<uuid>, sem IF NOT EXISTS ou reuso. Todas as
   conexões recebem search_path exclusivamente nesse namespace. Verificar schema.
7. A suíte compartilhada aplica inicial + quatro migrações na ordem, preservando
   fixtures antigas e todos os cenários PostgreSQL da 06A. Constraints são
   consultadas em current_schema(), sem fixar public. Migrações não foram editadas.
8. Teste adicional instancia PrismaPg real e client expandido temporário, verifica
   delegates e executa a criação transacional pelo adaptador. Não substitui SQL
   real por mocks e não troca versão de dependência caso haja incompatibilidade.
9. Encerrar conexões/liberar advisory lock. Limpar apenas arquivos LOCAIS temporários
   cuja identidade foi conferida. Saída capturada passa por redator dos segredos
   conhecidos; falhas do launcher exibem código fixo, sem stack/URL/credenciais.

## Limpeza, reexecução e limites

Não existe DROP DATABASE, DROP SCHEMA ou exclusão via API nesse modo. Ao fim,
namespace remoto é RETIDO para inspeção, inclusive em falha/timeout. Não se tenta
apagar ou recuperar automaticamente um banco parcialmente migrado.

Após revisar o resultado, o responsável remove MANUALMENTE somente a branch/banco
descartável identificado na autorização, pela interface do projeto de testes.
Depois prepara ambiente novo/vazio e nova autorização para outra execução. Um
rerun no mesmo banco com dados será recusado. A autorização de execução não é
autorização para excluir recursos arbitrários.

Esse fluxo não fornece prova criptográfica de isolamento contra um operador
malicioso que controle os arquivos, chaves e conta Neon. O trust store é uma
fronteira de revisão independente: preenchê-lo incorretamente pode autorizar o
projeto errado. Por isso a lista proibida, a assinatura, o vínculo API e o estado
prístino são exigidos juntos. O lock impede runners cooperantes concorrentes,
mas não impede alguém com credenciais administrativas de escrever fora do protocolo.
O projeto/branch/banco devem ser exclusivos, sem aplicação conectada.

Ainda NÃO comprovados: formato real das respostas API, permissões Neon, extensão
btree_gist, geração/importação do client temporário, TLS em execução, compatibilidade
PrismaPg 6.x/client 7.x, DDL, locks e cenários PostgreSQL. Qualquer falha deve ser
relatada; não relaxar a segurança, trocar para pooler ou usar banco compartilhado.

## Validação desta preparação e próxima etapa

Testes locais adicionais verificam assinaturas e decisões fail-closed com chaves
efêmeras em memória, HTTP falso e SQL falso. NÃO comprovam Neon/PostgreSQL reais.
A suíte de integração continua real e separada, sem execução automática.

Próxima etapa: revisar IDs/chave pública não secretos, preparar o projeto/banco
manualmente e autorizar uma execução Neon específica. Só então executar e registrar
os resultados reais antes de qualquer publicação do Cortz.
