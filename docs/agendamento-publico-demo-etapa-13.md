# Etapa 13 — agendamento público demonstrativo integrado

Atualização etapa 14: formulário público inclui telefone fictício opcional e
associa o atendimento à carteira da barbearia, sem listar clientes privados,
sobrescrever perfis ou unir pessoas apenas por nome. Consulte clientes-demo-etapa-14.md.

## Testar o fluxo completo

1. Executar `pnpm dev` e abrir `http://localhost:3000/admin`.
2. Cadastrar barbearia fictícia, serviços ativos e profissional ativo associado
   aos serviços. Configurar funcionamento e expediente individual em Horários.
3. Publicar a barbearia na confirmação ou em Configurações. Clicar em Ver catálogo
   e, na mesma aba, abrir seu card. A página continua em `/demo/barbearias/<id>`.
4. Selecionar Simular agendamento. Escolher serviço (preço/duração informativos),
   profissional ativo habilitado, hoje ou data futura e um horário sugerido.
   Informar nome fictício e confirmar a simulação. Não há checkout ou pagamento.
5. Conferir barbearia, serviço, profissional, nome, data, início/fim e duração na
   confirmação. Ela declara que não é reserva real e só existe nesta aba.
6. Selecionar Conferir agenda demo: o seletor administrativo muda para a barbearia
   correspondente e `/admin/agenda?date=...` abre o dia civil do atendimento.
   O atendimento aparece na mesma coleção local. O parâmetro de data é validado;
   ausente ou inválido, a agenda abre no dia atual, sem mudar regras de criação.
7. Cancelar pelo painel e voltar ao detalhe público pela navegação interna: o
   intervalo deixa de ser ocupado pelo atendimento cancelado. Outros impedimentos
   (pausas/bloqueios/inatividade) continuam valendo.
8. Testar outra barbearia e os estados sem serviços, sem profissional elegível,
   sem expediente, dia fechado ou bloqueado. Rascunhos e retiradas do catálogo não
   podem receber novos agendamentos públicos.

Não recarregar, abrir nova aba ou compartilhar o link esperando persistência:
isso não transfere o estado. Os exemplos fixos herdados do catálogo continuam
somente para consulta, sem agenda/configuração administrativa criada para eles.
Para o fluxo completo é necessário usar uma barbearia criada e publicada nesta aba.

## Regras compartilhadas

publicDemoAvailability reutiliza previewDemoAvailability da etapa 11. A criação
pública exige publicação no contexto local e delega a createDemoAppointment da
agenda administrativa, que usa validateBookingRequest de lib/bookings.
Não há segundo cálculo de expediente/conflito nem nova coleção paralela.

As sugestões levam em conta duração, funcionamento, expediente individual,
pausas, bloqueios e todos os atendimentos locais existentes. Inícios são sugeridos
a cada 30 minutos no fuso America/Sao_Paulo. Cancelados não bloqueiam intervalos;
profissionais/serviços inativos e associações de outra barbearia são recusados.
O início deve ser estritamente futuro, inclusive se for no dia atual.

Seleções dependentes reiniciam ao trocar serviço/profissional/data. Mudanças
no estado atualizam a lista; um relógio local atualiza o cálculo a cada 30 segundos.
Ao confirmar, publicação, elegibilidade, futuro e conflito são revalidados contra
o último snapshot local e o relógio atual, sem confiar na lista já exibida. Uma
seleção que ficou obsoleta pode ser recusada, sem criar atendimento parcial.
Submissão duplicada é bloqueada no formulário; mutação segue a atualização local
síncrona já preparada na etapa 12. Não equivale a idempotência ou transação real.

O cadastro resultante é o mesmo DemoAppointment usado no painel: barbershopId,
IDs de serviço/profissional, cliente fictício, snapshots de nomes/preço/duração/
fuso, início/fim UTC e status. O contexto administrativo selecionado não determina
o destino da criação pública; o destino é a barbearia publicada aberta no detalhe.

## Limites

- Somente memória da aba, sem banco, API, storage, conta, assinatura ou cobrança.
- Resultado não garante atendimento ou vaga real. Nenhuma mensagem de confirmação
  é enviada externamente. O preço é informativo, não um pagamento registrado.
- Não há autorização real: publicação e separação por IDs são organização local.
  Integração persistente futura precisa de identidade/cliente e verificação de
  tenant no servidor, além de revalidação transacional e idempotência.
- As rotas `/barbershops`, `/barbershops/[id]`, `/bookings`, as ações antigas de
  reserva e checkout Stripe NÃO foram alteradas ou conectadas a esta simulação.
  O fluxo novo fica somente nos detalhes `/demo/barbearias/[id]`; o catálogo
  demonstrativo da etapa 09 já existia, sem substituir fontes reais nesta etapa.
- Build e verificação visual/interativa em navegador não executados nesta entrega.

## Arquivos

Criados:
- app/_lib/public-demo-booking.ts
- app/_components/public-demo-booking.tsx
- app/_components/public-booking-form.tsx
- tests/public-demo-booking.test.ts
- docs/agendamento-publico-demo-etapa-13.md

Modificados:
- app/_components/demo-barbershop-page.tsx: CTA, integração e avisos de simulação.
- app/admin/_components/demo-context.tsx: criação pública validada no snapshot atual
  e retorno do atendimento para confirmação, sem trocar automaticamente o tenant.
- app/admin/_components/publication-controls.tsx: distingue reservas reais da demo.
- app/admin/agenda/_lib/appointment.ts: formatador de horário aceita Date do núcleo
  além de strings ISO do histórico, sem mudar as regras administrativas.
- app/admin/agenda/page.tsx e app/admin/agenda/_components/agenda-panel.tsx:
  recebem data opcional da confirmação e validam antes de selecionar o dia.
- docs/catalogo-demo-etapa-09.md e docs/agenda-demo-etapa-12.md: notas de evolução.

## Validação local

- 32 testes demonstrativos aprovados (public booking, agenda, schedule,
  professionals, onboarding, services e public catalog).
- Os cinco testes públicos cobrem criação válida e leitura na agenda, seleção
  obsoleta/conflitos, duração, pausas/bloqueios, cancelamento, passado, publicação,
  serviço/profissional inativo e IDs de outra barbearia.
- Testes públicos e da agenda (12) executados em UTC e America/Sao_Paulo:
  aprovados em ambos os fusos.
- pnpm test: 230 testes existentes aprovados; runner inalterado.
- TypeScript sem emissão/sem incremental e ESLint: aprovados. O formatador foi
  ajustado ao tipo Date retornado pelo núcleo. Apenas aviso informativo de
  baseline-browser-mapping antigo.
- git diff --check: aprovado; avisos LF/CRLF preexistentes.

Sem novas dependências, Neon, migrações, Prisma, Stripe, persistência real de
reservas ou runner Neon alterados. Sem commit/push/deploy. Alterações anteriores
preservadas. Aguardar autorização antes de avançar.
