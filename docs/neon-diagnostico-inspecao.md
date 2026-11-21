# Diagnóstico local da inspeção Neon

Atualização de conexão: parâmetros originais sslmode=require e
channel_binding=require agora são aceitos pela inspeção e normalizados com TLS
verificado. Consulte neon-normalizacao-conexao.md; essa combinação deixou de ser
causa de URL_REJECTED. Parâmetros desconhecidos ou duplicados continuam recusados.

A mensagem antiga não identifica a causa da execução anterior. O catch final
descartava a exceção; quase todas as validações locais lançavam Error sem código.
Ainda havia dois pontos que escondiam evidência: listener error do pg vazio e
ROLLBACK no finally podendo substituir a falha original de conexão/consulta.
Não é possível reconstruir qual condição falhou usando somente aquela mensagem.

## Condições de recusa e novos diagnósticos

- configuration: consentimento ausente/incorreto ou configuração implícita proibida.
- local_files: arquivo ausente/JSON inválido/estrutura inválida, projeto/organização
  divergentes, allowlist diferente ou projeto principal sem bloqueio explícito.
- url: credenciais ausentes, URL inválida, host/porta/TLS/parâmetros inadequados,
  role/database divergentes ou senha ausente. A URL exige exatamente a query
  ?sslmode=verify-full; parâmetros extras como channel_binding são recusados.
- api_project/api_branch/api_endpoint: erro de transporte, timeout, HTTP não 2xx,
  JSON inválido, estrutura ausente ou identidade divergente. HTTP status numérico
  é registrado, sem corpo/headers. 401/403 indicam autenticação/autorização da API;
  404 não comprova se recurso inexiste ou está invisível à credencial.
- driver: falha ao carregar/configurar pg ou guarda de rede.
- sql_connect: rede, DNS, TLS, autenticação ou database indisponível. SQLSTATE
  28P01 (autenticação), 28000, 3D000 (database), erros TLS/DNS permitidos são
  preservados apenas como códigos, inclusive em cause.code de fetch.
- read_only_begin: abertura da transação somente de leitura falhou.
- role_catalog: consulta de catálogo recusada ou identidade/privilégios rejeitados.
  Códigos distinguem DATABASE_IDENTITY_REJECTED, READ_ONLY_NOT_ACTIVE,
  PRIVILEGED_ROLE_REJECTED, ROLE_MEMBERSHIP_REJECTED e CREATE_PRIVILEGE_MISSING.
- object_catalog: erro de consulta ou USER_OBJECTS_PRESENT. Isso inclui extensões
  diferentes de plpgsql, mesmo gerenciadas, e outros objetos conservadoramente
  recusados pela política. Não implica necessariamente dados de clientes.
- rollback/disconnect: falha de encerramento registrada separadamente. A falha
  original é registrada primeiro; não emitir sucesso se houve erro assíncrono.

Erros desconhecidos recebem UNCLASSIFIED_FAILURE, nunca message/stack arbitrários.
SyntaxError e TypeError são distinguidos como JSON/sintaxe e estrutura/erro interno;
isso não prova qual campo está errado. A allowlist de códigos evita imprimir
connection strings, senhas ou tokens mesmo se um driver os incluir na exceção.

## Compatibilidade API ainda inconclusiva

O contrato exige project.org_id, branch.project_id e parent_id explicitamente null,
endpoint.project_id/branch_id/host/type. Campos omitidos são recusados. Em especial,
parent_id omitido NÃO equivale a null neste código. Se o Neon retornar outro
formato, a inspeção pode falhar por contrato incompatível antes do SQL.
Não houve pesquisa externa ou chamada à API nesta análise; não é possível afirmar
o formato efetivo da resposta nem atribuir a falha anterior a essa hipótese.
Nenhuma verificação foi relaxada para aceitar formas alternativas de resposta.

## Próximo comando

Após autorização específica para nova conexão, no terminal local já configurado
com credenciais exclusivas de testes e consentimento de leitura:

    pnpm neon:inspect

Compartilhar somente linhas stage/code e status HTTP numérico. Não enviar URL,
senha, token, resposta bruta da API ou dump do ambiente. O procedimento seguro
de configuração continua em neon-inspecao-etapa-06b-7.md. Nenhuma autorização
assinada, migração ou conexão externa foi executada nesta análise.
