# Stripe legado — proteção incremental (etapa 02)

## Estado e limite de publicação

Migração preparada offline, NÃO aplicada. Nenhum banco ou endpoint Stripe foi
consultado nesta etapa. Nenhum checkout, cancelamento, reembolso, segredo ou dado
existente foi alterado. Nenhuma assinatura, Pix ou novo motor de agenda foi criado.

**Não publicar este webhook isoladamente enquanto o checkout atual estiver ativo.**
O motor atual não tem profissional, duração ou constraint de intervalos, e os
escritores públicos não compartilham um protocolo de concorrência. Não é possível
certificar uma nova reserva válida dentro desta etapa. Conforme a instrução de
interromper a parte afetada, a criação automática de reservas novas pelo webhook
foi interrompida: pagamento sem reserva identificada vira REVIEW com motivo
BOOKING_CORE_UNAVAILABLE. Isso altera a confirmação após checkout, embora a
interface e a ação de checkout permaneçam intactas. O corte operacional exige
decisão explícita antes do deploy; não se deve cobrar novos clientes esperando
que esse handler produza reservas. Não houve mudança em serviços implantados.

Reservas existentes só são associadas por chargeId e coincidência de serviço,
estabelecimento, usuário e instante. Não são criadas, alteradas ou apagadas.
Duplicidades históricas vão para revisão. Ausência de vínculo não prova ausência
de pagamento; nenhuma referência é apagada nem se tenta deduplicar dados antigos.

## Persistência

- LegacyStripeEvent: ID externo primário, primeiro payload assinado, tipo,
  status, contador de entregas e timestamps. Recepção via INSERT ON CONFLICT.
- LegacyStripeAttempt: ID próprio, evento, início/fim, resultado e código de
  falha/pendência. Tentativas anteriores nunca são apagadas. STARTED antigo indica
  interrupção e pode ser retomado pelo evento; não é marcado como sucesso.
- LegacyStripeOperation: sessão primária, payment intent e cobrança únicos quando
  conhecidos, valor/moeda, modo live/test, situação financeira observada, reserva
  opcional e pendência. FK com RESTRICT preserva a associação histórica.

Constraints são apenas das novas tabelas. Nenhum UNIQUE foi imposto a
Booking.stripeChargeId, pois dados antigos podem conter duplicidades. Não há
backfill automático. SQL parametrizado usa o cliente Prisma existente; não foi
necessário regenerar/editar os arquivos gerados. A geração do client e a aplicação
da migração ficam para rollout autorizado. O schema descreve os modelos novos;
CHECKs complementares estão na migração SQL e precisam ser preservados.

O payload integral fica em JSONB para permitir recuperação do evento assinado,
inclusive quando a consulta da sessão falha. Pode conter dados pessoais: não é
retornado ao cliente nem registrado em logs. Restringir acesso às tabelas/backups;
política de retenção e ferramenta administrativa ficam pendentes de etapa própria.
Não são guardadas credenciais, assinatura HTTP ou chaves Stripe no inbox.

## Processamento e recuperação

1. Verificar assinatura sobre corpo original; assinatura inválida retorna 400 e
   não persiste nada. Configuração ausente retorna 503.
2. Persistir evento antes de consultar a sessão; preservar primeiro payload.
3. Criar tentativa STARTED e consultar estado atual da sessão no Stripe. Apenas
   checkout.session.completed, async_payment_succeeded, async_payment_failed e
   expired são interpretados; os demais são persistidos como IGNORED.
4. Validar identidade e modo live/test. Eventos Connect vão para revisão, pois
   o checkout existente usa apenas a conta da plataforma.
5. Na transação, bloquear evento com FOR UPDATE; tomar advisory lock do inbox
   para serializar operações financeiras. Unicidade de sessão/intent/charge é
   a última barreira persistente. Este lock NÃO protege outros escritores da agenda.
6. Persistir operação, vínculo/pendência e resultado da tentativa/evento no mesmo
   commit. Só então responder sucesso. REVIEW é recebimento durável com trabalho
   operacional pendente, não atendimento confirmado.

Estados do evento: RECEIVED, PROCESSED, REVIEW, FAILED, IGNORED. Operações:
WAITING, LINKED, REVIEW. PROCESSED significa evento tratado; uma sessão não paga
pode estar WAITING. Um evento posterior pode avançá-la. Operações LINKED ou REVIEW
não são rebaixadas por entregas antigas; para REVIEW há replay explícito interno.
Isso não é conciliação de reembolsos/chargebacks nem certificado do saldo bancário.

Falha transitória produz 503. A tentativa recebe PROCESSING_FAILED quando o banco
permite; uma falha concorrente não rebaixa evento já concluído. Se o próprio banco
estiver indisponível, pode restar RECEIVED/STARTED: não responder sucesso e retomar
o mesmo evento. Morte do processo e perda da resposta após commit também são
tratadas por replay idempotente. O sistema não garante entrega infinita pelo Stripe.

`processPersistedLegacyStripeEvent(eventId, stripe)` retoma RECEIVED/FAILED usando
o payload salvo. REVIEW não é repetido automaticamente. Após decisão operacional,
o mesmo serviço interno aceita `{ retryReview: true }`, sem apagar tentativas.
Não há endpoint de replay, Server Action, worker ou painel administrativo nesta
etapa. Um futuro executor autorizado deve usar essa função e monitorar
RECEIVED/FAILED, tentativas STARTED antigas e REVIEW. Não inserir replay público
sem autorização e auditoria. Sem esse executor, a recuperação é possível por
código, mas não constitui operação autônoma implantada.

Sessão desconhecida e dados incompletos preservam o payload e motivo na tentativa.
Operações de assinatura não ativam acesso nem geram reservas. Referência financeira
reutilizada em outra sessão gera REVIEW sem segunda operação. Nenhum pagamento
novo, reembolso ou correção financeira é executado.

## Testes e limites

`pnpm test`: mesma guarda mock-only da etapa 01, com UTC e America/Sao_Paulo.
Teste antigo de duplicação do webhook foi substituído por regressões de inbox;
caracterizações de outros defeitos de agenda/reembolso foram mantidas.

Mocks cobrem recepção, repetição, sessões iguais, rollback, falha de lookup,
resposta perdida após commit, ordem invertida, sessão desconhecida, metadados
incompletos, pendência sem reserva, concorrência simulada e replay interno.
Um teste do store verifica parametrização e política de conflito da recepção.
Nenhum mock demonstra funcionamento do PostgreSQL real ou validação criptográfica
do SDK. A sessão Stripe é simulada; não há chamadas externas nos testes.

Somente após autorização com PostgreSQL descartável será possível comprovar:

- Execução da migração, compatibilidade schema/SQL e cliente gerado.
- PK/UNIQUE/FK/CHECKs, rollback real e persistência após reinício.
- FOR UPDATE e advisory lock com conexões independentes.
- Corrida entre eventos diferentes com a mesma sessão/charge/payment intent.
- Queda entre recebimento, tentativa, commit e resposta; falha na gravação de erro.
- Manutenção de reservas antigas, inclusive charges duplicadas e canceladas.
- Permissões do usuário do banco e empacotamento da aplicação no deploy.

Próximo passo: revisar o limite operacional acima e autorizar validação do inbox
em PostgreSQL descartável. Nova criação automática depende da estabilização
posterior da agenda e de um corte de checkout coordenado, fora desta etapa.
