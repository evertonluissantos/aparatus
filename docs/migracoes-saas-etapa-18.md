# Etapa 18 — Preparação local das migrações SaaS

## Estado e arquivos

Preparado apenas em arquivos. Nenhuma conexão, migração, seed, db push ou alteração de dados foi executada. Autenticação continua desabilitada. UI pública, calendário, Stripe, ações legadas, núcleo de reservas e runner Neon não foram modificados.

Modificados:
- `prisma/schema.prisma`: expansão descrita abaixo, preservando alterações anteriores.
- `tests/core.test.mjs`: inclui testes estáticos das novas migrações no runner offline existente.

Criados:
- `prisma/migrations/20261107160000_single_owner/migration.sql`.
- `prisma/migrations/20261107170000_saas_persistence/migration.sql`.
- `docs/sql/etapa-18-diagnostics.sql`: consultas somente de leitura, não executadas.
- `tests/saas-migrations.test.mjs`.
- Este relatório.

## Sequência preservada

A inicial e as quatro migrações existentes foram preservadas byte a byte, verificadas por SHA-256 capturado antes desta etapa e por teste automatizado:

1. `20261107120000_legacy_stripe_inbox`.
2. `20261107130000_booking_model_expansion`.
3. `20261107140000_tenant_authorization`.
4. `20261107150000_booking_transaction_guards`.
5. Nova `20261107160000_single_owner`.
6. Nova `20261107170000_saas_persistence`.

Em banco existente, a situação real de cada migração deverá ser inspecionada antes da aplicação. Não repetir migrações já aplicadas nem executar a inicial indiscriminadamente. Não foi consultado `_prisma_migrations` nesta etapa.

## Proprietário: restrição mínima

Índice único parcial em `BarbershopMembership(userId) WHERE role = 'OWNER'`, sem filtro de active. Um vínculo inativo continua reservando o limite do proprietário. Não há índice único global em userId que prejudique vínculos MANAGER/BARBER.

A migração usa transação e lock de tabela para impedir escrita concorrente entre sua verificação e criação do índice. Se houver usuários com múltiplos OWNER, aborta explicitamente, sem escolher, remover, desativar ou reclassificar vínculos. Lock e criação do índice podem bloquear operações; exigem janela planejada. Não é índice CONCURRENTLY.

O índice parcial está documentado como SQL-only no schema, sem fingir que `@@unique([userId])` representa a mesma regra. Futuras migrações deverão preservar esse objeto customizado; não substituir por db push.

### Diagnóstico e resolução explícita

`docs/sql/etapa-18-diagnostics.sql` contém somente SELECTs dentro de transação READ ONLY:
- Usuários com mais de um OWNER, incluindo vínculos inativos e IDs das memberships/barbearias.
- Detalhes dos vínculos conflitantes, sem e-mails, senhas ou tokens.
- Multiplicidade inversa (mais de um OWNER da mesma barbearia), apenas informativa: esta etapa não cria uma nova regra de um proprietário por estabelecimento.
- Fusos e durações não preenchidos; reservas com profissional, término ou status desconhecidos.

Esse arquivo pressupõe as migrações anteriores aplicadas no destino autorizado. Não executá-lo onde essas tabelas/colunas ainda não existem. Os resultados contêm identificadores administrativos e devem ter acesso restrito.

Se houver conflito, parar a aplicação. O responsável deverá revisar a origem e titularidade de cada vínculo, registrar a decisão e autorizar eventual correção em operação separada e auditável. Não basta marcar um OWNER como inativo, pois o índice também o considera. Reatribuição/reclassificação, quando legítimas e autorizadas, não deverão excluir barbearias ou reservas. Casos sem decisão ficam bloqueados. Repetir o diagnóstico após a resolução; a própria migração verifica novamente sob lock.

### Criação transacional futura — não implementada nesta etapa

1. Exigir sessão válida no servidor; userId vem exclusivamente dela.
2. Abrir uma transação e bloquear a linha de `user` com FOR UPDATE, seguindo ordem fixa de locks.
3. Consultar qualquer vínculo OWNER desse usuário, inclusive inativo; rejeitar se existir.
4. Gerar slug normalizado e reservar sua unicidade; inserir Barbershop e membership OWNER na mesma transação. Definir active explicitamente conforme a política aprovada de acesso; isso não cria ou confirma assinatura/Pix.
5. Confirmar ambos juntos. Em violação de unicidade, rollback integral e erro de conflito, sem barbearia órfã. Retry limitado só para conflitos transitórios, nunca para ultrapassar o limite de proprietário.

A leitura prévia melhora a mensagem; o índice é a garantia final entre duas conexões concorrentes. Nenhum endpoint de criação foi ativado.

## Campos preparados

| Modelo | Alteração |
| --- | --- |
| Barbershop | `slug` nullable e único; `published` boolean default false; CHECK de formato do slug e publicação exige slug |
| BarbershopService | `active` boolean default true |
| Professional | `phone`, `description`, `imageUrl` opcionais |
| Customer | Modelo da carteira por barbearia: nome, telefone normalizado opcional, observações, User opcional, timestamps e relação de histórico |
| Booking | `customerId` opcional por FK composta com barbershopId; userId/User tornam-se opcionais preservando a FK existente; snapshots opcionais de nomes; createdAt/completedAt opcionais |
| BookingCommand | userId/User opcionais; `guestActorHash` opcional e idempotência por tenant+ator convidado+requestKey; CHECK exige exatamente um tipo de ator |

Nome, endereço, descrição, phones, imageUrl/capa e timeZone da barbearia já existem e não foram duplicados. Associações ProfessionalService, WorkingHours e ScheduleBlock continuam intactas. `publicSlug` demonstrativo deverá mapear para `slug` persistido; `photoUrl` do profissional demonstrativo deverá mapear para `imageUrl`.

### Slug, publicação e imagens

Slug aceita letras ASCII minúsculas, números e hífens entre segmentos, até 80 caracteres. É nullable para não inventar endereços históricos; o índice permite vários NULL. Publicação exige slug, mas essa condição não substitui validação server-side de serviços/profissionais/expediente. Estabelecimentos anteriores recebem published=false como estado técnico seguro, sem publicação automática. Serviços recebem active=true para preservar o comportamento anterior de catálogo sem opção de desativação. O corte das leituras antigas deverá ser planejado: elas ainda não filtram esses novos campos.

A capa continua em imageUrl, mantendo a estratégia de referências a imagens já existente. Não foram criados armazenamento, serviço ou upload. Data URLs usadas na demonstração não devem ser copiadas automaticamente para registros reais; o adaptador persistente deverá validar origem/tamanho/URL e usar armazenamento aprovado. Nenhuma imagem existente é reescrita.

### Clientes e histórico

Customer pertence a uma barbearia. Telefone com DDI 55 e dígitos tem unicidade somente dentro dela; telefones ausentes são NULL, nunca string vazia. Vários clientes sem telefone são permitidos. Nomes não são chave e não provocam união automática. O mesmo User pode ter um Customer em cada barbearia; a associação não é obrigatória e não deve ser aceita apenas por e-mail/telefone fornecido pelo visitante.

Booking usa `(customerId, barbershopId)` para impedir associação a um cliente de outro tenant. A referência histórica a User não é apagada nem renomeada; a ação ON DELETE RESTRICT da FK original foi explicitada no schema para manter coerência ao relaxar nullability. CHECK exige userId ou customerId. Nenhum cliente ou usuário é criado por backfill. Quando ambos os vínculos estiverem preenchidos, o futuro servidor deverá validar sua consistência; a FK de tenant não comprova identidade do visitante.

Snapshots de nomes e timestamps novos ficam NULL nos registros antigos, sem simular data de criação ou conclusão. Históricos existentes continuam legíveis pelos relacionamentos anteriores; enriquecimento exige fatos verificados e autorização separada. completedAt, quando informado, exige status COMPLETED e término conhecido já transcorrido em relação a esse timestamp. Impedir conclusão futura continua sendo regra do servidor, com relógio confiável.

### Convidados e BookingCommand

A alteração de nullability é a exceção necessária à expansão apenas por novas colunas: permite cliente sem login e não altera valores antigos. Customer pode ser criado junto à nova reserva em uma única transação, sem inserir User fictício.

BookingCommand mantém todos os índices/FKs anteriores. Com userId presente, guestActorHash deve ser NULL. Sem userId, o hash deve estar presente, em hexadecimal de 64 caracteres. A nova chave única permite idempotência de convidados sem outra tabela. Ela não autoriza consulta, cancelamento ou acesso a clientes.

A geração e validação do contexto opaco do convidado, hash/HMAC e seu vínculo à solicitação são responsabilidade do FUTURO endpoint server-side. Não usar telefone, nome ou IP como ator, não aceitar hash arbitrário do navegador como identidade e não devolver uma reserva apenas porque alguém forneceu requestKey. Reprocessamento deve validar contexto e fingerprint. Não há cookie, token de convidado ou fluxo anônimo ativado aqui.

## Compatibilidade com o núcleo e corte do legado

O núcleo de disponibilidade não foi reescrito. Sua exclusão GiST e o CHECK de managedByCore, FKs de tenant, intervalos adjacentes e liberação de cancelados permanecem intactos. A FK de cliente acrescenta proteção, não remove as existentes. Pausas semanais continuam representáveis como múltiplas janelas em WorkingHours; bloqueios datados continuam em ScheduleBlock.

A migração NÃO torna o adaptador atual capaz de receber convidados. Ele ainda exige sessão para criar e, para equipe, cliente User já relacionado por Booking. Seus tipos também ainda presumem userId não nulo. Antes de ativar dados reais, ajustar os adaptadores e os leitores para Customer/userId opcional, sem duplicar cálculo de disponibilidade. Geração do Prisma Client ampliado e validação de seus consumidores deverão ocorrer em etapa autorizada; o client gerado do workspace não foi sobrescrito aqui.

Também faltam writers persistentes tenant-scoped para cadastro/edição, status ativo, publicação, expediente, cancelamento e conclusão. Filtrar publicação/serviço ativo na leitura e revalidar na gravação, porque o núcleo atual não consulta active do serviço. Os exemplos fictícios e dados em memória não devem virar seeds de produção.

Plano mínimo de corte, sem alterar Stripe nesta etapa:
1. Inventariar e impedir NOVAS escritas públicas pelas ações antigas de reserva/checkout durante uma janela controlada. Apenas esconder botões não basta.
2. Preservar a conciliação de eventos Stripe já emitidos e sua idempotência; o tratamento de eventos pendentes deve seguir plano específico, sem publicar webhook novo isolado com checkout antigo ativo.
3. Avaliar reservas históricas desconhecidas/conflitantes sem preenchimentos inventados.
4. Encaminhar novas reservas, alterações de expediente, bloqueios, cancelamentos e demais mudanças que afetem disponibilidade ao mesmo protocolo transacional de lock da barbearia, revalidação e commit atômico.
5. Validar duas conexões, rollback, retry limitado, cancelamento e idempotência no PostgreSQL isolado. Só liberar reservas reais após esse corte e verificação. A exclusão parcial não protege escritores com managedByCore=false, nem impede alterações de configuração que ignorem o protocolo.

## Validações e limites

- Validação Prisma feita com `pnpm test:schema`, usando config offline sem URL/dotenv e bloqueio de rede.
- Testes estáticos verificam hashes das migrações anteriores, predicado OWNER sem active, aborto de conflitos, FKs compostas, unicidades, ausência de DML/backfill, publicação opt-in e diagnósticos somente de leitura.
- Os testes estáticos não são um parser PostgreSQL e não provam execução, locks, performance ou concorrência. Sintaxe SQL foi revisada no código; não foi executada ou validada pelo servidor PostgreSQL.
- TypeScript usa o client gerado anterior; não comprova o futuro client ampliado nem a aplicação de migrações.
- A suíte PostgreSQL/runner Neon permanece inalterada e ainda lista somente as migrações anteriores. Ampliar seu escopo requer etapa posterior autorizada; não afirmar cobertura das novas migrações por essa suíte.

## Passos mínimos para aplicação posterior

1. Obter autorização específica e confirmar identidade/isolamento do destino; usar primeiro o ambiente descartável existente, sem criar outra infraestrutura.
2. Confirmar versão/extensão btree_gist, sequência aplicada, estado real do schema e disponibilidade de recuperação no ambiente com dados. Rever defaults e impacto dos locks.
3. No destino autorizado, executar os diagnósticos apenas após suas dependências; resolver conflitos com autorização explícita antes do índice OWNER.
4. Aplicar a sequência revisada no ambiente isolado, verificar constraints/relações/dados legados e gerar client isolado para compatibilidade. Testar tentativas duplicadas, FKs cruzadas, NULLs, rollback e concorrência. Só então planejar aplicação controlada em banco com dados.
5. Completar writers, autorização, suporte Customer/guest e corte dos escritores antigos. Não ativar autenticação, catálogo persistente ou reservas reais apenas porque o DDL foi aplicado.

Nenhum comando de aplicação é fornecido como autorização implícita. Aguardar aprovação antes de conectar qualquer banco.

Resultados locais: pnpm test:schema aprovado; pnpm test aprovado com 126 casos em cada fuso (252 execuções); TypeScript sem emissão aprovado; ESLint dos testes alterados aprovado; git diff --check aprovado. Avisos não bloqueantes: baseline-browser-mapping desatualizado e conversão LF/CRLF. Nenhum teste PostgreSQL ou remoto foi executado.
