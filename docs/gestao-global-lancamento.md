# Gestão global — preparação local

As seções Proprietários, Barbearias e Ativações/suspensões consultam o servidor e exigem GlobalAdmin ativo. Não há cadastro manual de usuários.

## Aplicação autorizada posteriormente

1. Preservar o ponto de recuperação e aplicar, com Prisma Migrate, somente a nova migração `20261121010000_barbershop_administration`, antes de publicar este código. As oito migrações anteriores permanecem intactas.
2. A migração adiciona `Barbershop.suspended=false` e uma tabela de auditoria com administrador, instante, estado anterior e novo estado. Não altera publicação, memberships ou registros históricos. Inclui SELECT/INSERT na auditoria para as roles existentes `cortz_app` e `cortz_test_app`; não cria roles nem concede UPDATE/DELETE na auditoria.
3. Conferir a estrutura e as permissões da aplicação, então autorizar a publicação separadamente. Não publicar o código antes da migração: as consultas falham fechadas se o campo estiver ausente.

## Regras

- Suspender e reativar usam o mesmo bloqueio de linha da barbearia utilizado pelos escritores de agendamento. A nova autoridade global é conferida dentro da transação. A alteração de estado e a auditoria são atômicas; repetir o mesmo estado não cria um evento fictício.
- Um atendimento já confirmado é preservado. Operações iniciadas antes da suspensão podem concluir antes dela; depois do commit da suspensão, novos escritores aguardando o bloqueio são recusados.
- Vínculos inativos permanecem inativos na reativação; publicação não muda. Pix não suspende nem reativa. As listagens globais e confirmação Pix continuam disponíveis ao administrador para barbearias suspensas.
- O banco não identifica como proprietário uma conta que ainda não tem OWNER. Por isso a listagem também mostra contas sem vínculo, explicitamente como tal, sem inferir propriedade a partir de nomes ou reservas. Contas exclusivamente globais são omitidas; administradores que também possuem OWNER são incluídos.
- A unicidade de OWNER por usuário continua garantida pelo índice parcial existente, inclusive para vínculos inativos. O administrador não cria ou reassocia vínculos nesta entrega.
- Nenhuma validação desta alteração escreve em produção. Testes locais com mocks não comprovam aplicação do novo DDL em PostgreSQL; migração e conferência remota requerem autorização separada.

## Validação PostgreSQL autorizada

A migração foi aplicada com Prisma Migrate somente em `orange-rice-48468127`, branch `br-small-surf-b694suzd`, banco `cortz_test_integration`. Os oito checksums anteriores foram preservados; o novo checksum é `0c916dea859f3410933924732e14a15c0c7a1b4f587e3999dab11be3852601f7`.

Foram confirmados coluna/default, FKs, CHECK de transição, índice e permissões SELECT/INSERT sem UPDATE/DELETE na auditoria para `cortz_test_app`. Funções reais executaram SQL no PostgreSQL com sessões controladas: recusa de proprietário e de administrador revogado; suspensão; bloqueio do painel, permissão operacional e nova reserva; outra barbearia continuando operacional; reativação e reserva posterior; auditoria sem duplicação em repetição; rejeição de auditoria sem transição. Fixtures e alterações foram integralmente revertidas numa transação, sem exclusões.

A tentativa inicial de assumir `cortz_test_app` foi recusada pelo PostgreSQL e revertida. Não foram concedidos privilégios para contornar isso: a validação das regras executou com a conexão de testes, e os privilégios da role limitada foram conferidos separadamente nos catálogos. Não equivale a teste HTTP/Better Auth nem a execução das operações pela role limitada. Nenhum acesso à produção ocorreu nesta validação.
