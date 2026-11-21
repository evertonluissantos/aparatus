# Diagnóstico de NEON_BRANCH_UNVERIFIED, análise offline

Na versão anterior a recusa era o OR de três comparações:
branch.id diferente do manifesto, branch.project_id diferente do projeto permitido,
ou branch.parent_id diferente de null. Campos ausentes também falhavam. Envelope
sem branch virava recusa genérica; envelope null podia causar TypeError antes.
Não é possível recuperar qual comparação falhou a partir da mensagem anterior.

## Alteração

verifyBranchIdentity agora separa:

- NEON_BRANCH_RESPONSE_INCOMPATIBLE: envelope ou objeto branch inexistente/inválido.
- NEON_BRANCH_ID_MISSING / INVALID / MISMATCH: ausência, tipo/valor inválido ou ID divergente.
- NEON_BRANCH_PROJECT_ID_MISSING / INVALID / MISMATCH: mesma distinção para vínculo ao projeto.
- NEON_BRANCH_PARENT_ID_MISSING: parent_id omitido, independência inconclusiva.
- NEON_BRANCH_PARENT_ID_INVALID: campo presente, mas diferente de null e de string não vazia.
- NEON_BRANCH_HAS_PARENT: campo presente com ID de pai; branch derivada é recusada.

Somente null explícito, com IDs de branch e projeto correspondentes, satisfaz a
regra atual. Os novos códigos passam pela allowlist do diagnóstico seguro, sem
exibir nenhum valor da resposta, URL ou credencial. Falha interrompe antes do
endpoint e de qualquer conexão SQL. O bloqueio do projeto principal permanece.

## Contrato API: o que sabemos e o que não sabemos

O JSON de uma API pode omitir um campo opcional em uma branch raiz. Isso explica
uma possível recusa falsa pela exigência anterior de null explícito, mas não
comprova que foi essa a resposta desta execução. Nenhuma resposta bruta foi
fornecida, nenhuma especificação Neon está disponível nos arquivos examinados e
nenhuma consulta externa foi feita. Não podemos afirmar que o Neon garante que
parent_id omitido significa raiz em todo retorno aceito por este endpoint.

Por isso não foi aplicado parent_id == null ou fallback para null: tal mudança
aceitaria respostas incompletas como prova de independência. Se o contrato oficial
for posteriormente confirmado como campo opcional cuja ausência significa raiz,
poderá ser revisada essa interpretação com testes, mantendo ID/projeto/endpoint
verificados. Ausência de project_id também continua bloqueada.

## Testes e próximo passo

Respostas fictícias cobrem null explícito, pai presente, parent_id ausente,
valores inválidos, campos de identidade ausentes/divergentes e envelope inválido.
Teste HTTP falso prova que parent_id ausente impede até a consulta do endpoint.
Nenhuma chamada real, credencial ou alteração de banco foi utilizada.

O resultado anterior continua inconclusivo quanto à comparação exata. Após nova
autorização específica, executar pnpm neon:inspect com configuração local segura
e informar somente stage/code. Não enviar credenciais ou resposta bruta. Se vier
PARENT_ID_MISSING, parar e revisar o contrato oficial antes de mudar a regra.
