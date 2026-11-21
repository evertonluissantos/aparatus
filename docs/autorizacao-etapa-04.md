# Etapa 04 — memberships e autorização preparada no servidor

## Estado operacional

Nenhuma migração foi executada, banco acessado, membership concedida ou conta
global provisionada. Nenhum middleware, ação, página, checkout, webhook Stripe
ou fluxo público passou a consultar as tabelas novas. Aplicação sem autorização
de publicação. A camada está preparada, não é uma certificação de isolamento
completo da aplicação antiga. Todas as alterações anteriores foram preservadas.

## Schema e migração

BarbershopMembership: id, userId, barbershopId, role, active, createdAt e updatedAt.
BarbershopRole: OWNER, MANAGER e BARBER. UNIQUE(userId, barbershopId) permite um
papel por estabelecimento e vários estabelecimentos por usuário. active=false
por padrão e role sem default: nenhum privilégio presumido. FKs com RESTRICT
na exclusão e índice de listagem por estabelecimento/situação/papel.

GlobalAdmin: id, userId único, active=false e timestamps. Associação separada de
User; membership nunca concede administração global. Não há função de gravação,
endpoint de atribuição ou inferência por e-mail/domínio no código desta etapa.

Migração 20261107140000_tenant_authorization é aditiva: cria enum, duas tabelas,
FKs e índices. Não altera nem preenche registros anteriores. updatedAt possui
default SQL e @updatedAt no Prisma; atualizações via SQL direto precisarão gravar
o timestamp explicitamente. Não existe trigger implícita de atualização.

## Camada lib/authorization.ts

Importa server-only, cujo alias existe no Next instalado. Testes simulam apenas
esse marcador, sessão/headers e consultas de banco. Não é Server Action e não
exporta endpoints HTTP. Não confundir suas funções com permissões do navegador.

| Função | Contrato |
|---|---|
| requireAuthenticatedUser | Obtém identidade somente da sessão Better Auth no servidor |
| requireBarbershopPermission | Consulta membership ativa do usuário da sessão e da barbearia explicitamente selecionada; verifica permissão |
| requireGlobalPermission | Consulta administrador global ativo e permissão global conhecida; não cria contexto de tenant |
| requireBarbershopEntity | Verifica permissão de leitura/escrita e busca ID dentro do tenant; cobre serviço, profissional, reserva, expediente e bloqueio |
| requireBookingRelations | Verifica serviço, profissional ativo e habilitação dentro da mesma barbearia |
| requireBarbershopCustomer | Verifica vínculo existente por reserva do próprio estabelecimento; retorna somente identidade de relacionamento |

Nenhuma função aceita userId/role/contexto de autorização do navegador. Todas
obtêm sessão novamente; não há cache de privilégios. O contexto retornado é
apenas para uso interno; não deve ser aceito como prova numa próxima requisição.
permission, kind e access devem ser escolhidos pela operação no servidor, nunca
repassados do navegador para permitir que o usuário selecione uma permissão menor
que a necessária. barbershopId e IDs de recursos são apenas candidatos validados.
IDs de entidades/barbearias devem ser UUIDs; identidade Better Auth não precisa
ser UUID. Parâmetros são vinculados, não concatenados como SQL. Tabelas são
selecionadas por switch fechado, nunca por identificador de tabela do usuário.

Ausência de sessão, vínculo inativo/ausente, papel desconhecido e permissão
desconhecida negam acesso. Falha de banco/migração propaga erro: nunca permite
fallback ao legado. Autorização da assinatura é futura e separada.

## Matriz inicial de permissões

| Recurso | OWNER | MANAGER | BARBER |
|---|---|---|---|
| Serviços | Ler/escrever | Ler/escrever | Ler |
| Profissionais | Ler/escrever | Ler/escrever | Ler |
| Expediente e bloqueios | Ler/escrever | Ler/escrever | Ler |
| Reservas privadas | Ler/gerenciar | Ler/gerenciar | Negado |
| Clientes | Ler no tenant | Ler no tenant | Negado |
| Configurações | Ler/escrever | Ler | Negado |
| Financeiro de atendimentos futuro | Ler/escrever | Negado | Negado |
| Conceder memberships/admin global | Sem função nesta etapa | Sem função | Sem função |

BARBER não foi ligado automaticamente a Professional: até existir associação
explícita e escopo de agenda individual, ele não recebe dados privados de
reservas/clientes. schedule:read significa configuração de expediente/bloqueios,
não lista de atendimentos. Nenhuma permissão de membership confirma mensalidades.

Administrador global ativo possui somente os contratos globais explícitos:
subscriptions:read, subscriptions:manage, subscription-payments:confirm e
subscription-metrics:read. Eles não implementam assinaturas ou pagamentos e não
concedem leitura de clientes, reservas ou finanças privadas. Se um administrador
também possuir membership, as permissões locais vêm desse vínculo separado.

## Escopo das consultas e relacionamentos

Todo lookup privado novo recebe WHERE id + barbershopId autorizado. Para reservas,
também é verificado o serviço relacionado e, quando informado, o profissional.
Isso recusa inconsistências antigas em vez de seguir relações de outro tenant.
Profissional nulo em reserva antiga é preservado; não se inventa atribuição.

O User atual é identidade global, não cadastro de CRM por barbearia. A função de
cliente retorna somente o vínculo por reserva; não retorna perfil completo,
histórico global, tokens ou contatos de outros estabelecimentos. Futuro CRM
exige modelo e projeções próprios. Configurações e financeiro têm permissões
definidas, mas não há endpoint/modelo financeiro fictício ou consulta sem filtro.

Estes helpers são verificações, não operações atômicas de escrita. O futuro
serviço de mutação deverá fazer autorização, revalidação de vínculo/relações e
gravação com escopo no mesmo protocolo transacional, incluindo revogação
concorrente. Não fazer UPDATE global pelo id depois de um check distante. Não
aceitar ids de tenant de um contexto reenviado pelo cliente. Constraints compostas
da etapa 03 complementam o controle, mas não substituem autorização por sessão.

## Pontos de entrada atuais e migração futura

| Entrada atual | Situação e tratamento futuro |
|---|---|
| app/page.tsx e barbershops/* | Catálogo público; manter projeção pública explícita quando surgirem campos privados |
| get-date-available-time-slots | Usa barbershopId para consulta; não devolve lista de clientes. Migrar ao núcleo público com projeção de disponibilidade |
| create-booking | Cliente da sessão e barbearia derivada do serviço; não exigir membership de proprietário de todo cliente. Migrar ao núcleo público seguro |
| create-booking-checkout-session | Checkout legado intacto; nenhuma membership adicionada prematuramente |
| cancel-booking e /bookings | Propriedade pelo userId da sessão permanece; separar das futuras operações administrativas por tenant |
| api/chat | Busca catálogo e chama ações antigas. Regras de autenticação/custo e novo núcleo continuam pendentes |
| api/auth/[...all] | Better Auth intacto; não aceita concessão de papéis desta etapa |
| api/stripe/webhook | Autorização por assinatura Stripe e inbox legado, não por sessão/membership |
| Painéis/APIs privados futuros | Devem chamar explicitamente os guards antes de consultas/mutações escopadas |

Não se exige membership de clientes finais nem se infere estabelecimento
"atual" a partir do primeiro vínculo do usuário. Não se adicionou middleware
global que interrompa a aplicação antes de migração e provisionamento.

## Prisma Client e validação offline

A geração com Prisma 7.1.0 e configuração explícita sem URL/dotenv foi executada
com ambiente sanitizado, rede e subprocessos bloqueados. Funcionou sem banco.
Porém, substituir o client de runtime faria consultas antigas de Booking/Service
selecionarem colunas novas antes de aplicar as migrações 02–04.

Somente os artefatos gerados por essa tentativa foram restaurados ao estado
anterior; arquivos generated/prisma não permanecem alterados. O comando temporário
de geração foi retirado do runner. Nenhuma alteração prévia existia nesses arquivos.
Foi necessária permissão de escrita do índice Git para restaurar esse resultado.

A autorização usa SQL parametrizado e tipos de domínio declarados localmente,
sem any, casts para delegates novos ou dependência de tipos inexistentes.
O client atual já oferece $queryRaw; delegates de membership/globalAdmin não são
usados. Geração definitiva e publicação deverão ser coordenadas com migrações,
ensaio e corte operacional, sem reusar credenciais/configuração raiz nos testes.

## Provisionamento e validação ainda pendentes

Antes de ativar memberships: identificar proprietário legítimo por evidência
externa verificável; confirmar usuário autenticado e estabelecimento; obter
aprovação controlada; registrar ator, motivo, evidências minimizadas e instante
em trilha administrativa. Só então conceder papel/ativar vínculo numa transação.
Conflitos de propriedade vão para revisão. Não inferir dono por primeira reserva,
e-mail parecido, domínio ou ordem de cadastro. Não há backfill automático.

Provisionamento global terá procedimento próprio, privilégio mínimo e auditoria;
não foi implementado bootstrap nem canal de autoatribuição.

Os testes novos cobrem matriz básica, ausência/inatividade de vínculo, manipulação
de IDs, vínculo múltiplo, escalada, isolamento de entidades e relações e ausência
de bypass global. Não comprovam execução SQL, FKs, UNIQUEs, controle de privilégio
no banco, integração Better Auth real, bundle client/server ou revogação concorrente.
Tudo isso continua pendente de PostgreSQL descartável e teste de integração.

Próxima tarefa: implementar o núcleo central de agendamentos com as permissões
administrativas e a autorização de cliente final separadas. Antes de publicação,
concluir validação PostgreSQL 02.1, migrations 02–04 e provisionamento controlado.
