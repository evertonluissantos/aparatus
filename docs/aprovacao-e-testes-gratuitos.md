# Aprovação administrativa e testes gratuitos

Implementação local, com validação autorizada em PostgreSQL de testes. Nenhuma migração foi aplicada em produção nesta etapa.

## Migração preparada

`20261121020000_approval_and_free_trials` adiciona o enum PENDING/APPROVED/REJECTED e `Barbershop.approvalStatus`.
O campo é adicionado inicialmente com DEFAULT APPROVED para preservar todas as barbearias existentes, depois o default muda para PENDING para cadastros futuros. O servidor também grava PENDING explicitamente no onboarding; ignora estado/papel enviados pelo navegador. Publicação, suspensão, vínculos, reservas e referências históricas não são modificados.

As tabelas `BarbershopFreeTrial` e `BarbershopCommercialEvent` registram os períodos e a auditoria. FKs usam RESTRICT; não há exclusão nem pagamentos artificiais. O CHECK exige término posterior ao início. A auditoria é append-only para as roles conhecidas da aplicação. Os nove SQL anteriores são preservados.

Antes de publicar, validar e aplicar esta décima migração com autorização, snapshot/branch de recuperação atualizado, Prisma Migrate e verificação das permissões. Não publicar antes: consultas que dependem do campo falham fechadas se a migração estiver ausente. Não utilizar o executor antigo de testes sem revisar sua lista de migrações esperadas.

## Regras

- Somente GlobalAdmin ativo decide e concede/altera testes; a autoridade é reconferida dentro da transação. Um administrador que também seja OWNER da barbearia não pode aprovar ou conceder período para si, inclusive com vínculo inativo.
- Decisão, eventual período gratuito e auditoria são atômicos. O bloqueio da linha da barbearia é o mesmo dos escritores operacionais. Uma operação iniciada antes da decisão pode terminar antes dela; após o commit da rejeição, novos escritores são recusados.
- Operação exige APPROVED e ausência de suspensão. O catálogo e as reservas também exigem publicação e OWNER ativo. Aprovar não publica nem reativa. Reativar não aprova. Pix não altera esses estados. Conceder teste não aprova nem remove suspensão.
- Proprietário pendente/rejeitado pode autenticar-se, mas vê apenas o aviso correspondente ao acessar o painel. APIs revalidam o estado. A unicidade OWNER existente impede novo cadastro para contornar rejeição ou suspensão.
- Períodos de 3/7/15 dias usam dias completos de 24 horas. Início omitido usa a hora da concessão no servidor. Um início expresso ou término personalizado é enviado como ISO com fuso; o formulário identifica a hora local do dispositivo. Editar um prazo preserva o início existente quando omitido.
- Situações de teste são derivadas das datas: agendado, ativo ou expirado (término exclusivo). A página atualiza a leitura a cada minuto enquanto houver período não expirado. Não há suspensão automática, cobrança ou cron. Expiração não afeta agendamentos anteriores.
- Períodos antigos são preservados. Alterações guardam estado anterior e novo em auditoria, com administrador e timestamp. A UI mostra concedente e responsável pela última alteração.

## Validação

Testes direcionados com mocks cobrem autorização, autoaprovação recusada, cadastro pendente, decisão sem Pix, concessão conjunta, alteração isolada por barbearia, auditoria/rollback e bloqueio de novas reservas. Testes unitários não comprovam o novo DDL em PostgreSQL nem login HTTP real. Sem validação visual autenticada nesta etapa.

### PostgreSQL real de testes

Aplicada somente a décima migração via Prisma Migrate no projeto `orange-rice-48468127`, branch `br-small-surf-b694suzd`, banco `cortz_test_integration`. A nona já estava aplicada; os nove checksums anteriores foram preservados. Checksum da décima: `22ef68746aa5e335ecbeecf6f8df832609a5e3815037e2898a19f5e855d11032`.

Como não havia barbearias antes da execução, foi criada e preservada a fixture identificada `edefd002-92c4-4034-8c0e-e6fee3b4a400` (nome: Cortz teste pre-migracao aprovacao), sem proprietário e não publicada, já suspensa desde a criação. Após a migração, ficou APPROVED e os campos originais mantiveram a mesma assinatura. Nenhum dado preexistente foi excluído.

Foram verificados os defaults PENDING, constraints, índices, FK, auditoria e grants. Funções reais executaram SQL no PostgreSQL com sessões controladas: aprovação sem Pix; aprovação com teste; rejeição; presets de 3/7/15 dias; prazo personalizado e edição preservando início; expiração informativa; bloqueio de painel, permissões e novas reservas; isolamento; recusa de proprietário, administrador revogado e autoaprovação. Pix e reativação não aprovaram; aprovação e concessão não removeram suspensão. As fixtures funcionais, reservas, pagamento de teste e eventos foram revertidos integralmente em transação.

Os fluxos transacionais usaram conexão administrativa de testes para preparar e reverter fixtures; as sessões do usuário foram controladas pelo loader de integração. Não se trata de teste HTTP/Better Auth ou E2E. A role `cortz_test_app` foi conferida separadamente: conexão real em leitura, acesso às novas estruturas, atualização dos períodos sem DELETE, auditoria sem UPDATE/DELETE, sem administração, DDL, escrita de histórico Prisma ou ativação de GlobalAdmin. Produção não foi acessada.
