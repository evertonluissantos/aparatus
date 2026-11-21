# Etapa 14 — gestão de clientes demonstrativa

## Testar no navegador

1. Executar `pnpm dev` e abrir `http://localhost:3000/admin`. Criar barbearia
   fictícia e acessar Clientes (`/admin/clientes`). A carteira inicia vazia.
2. Adicionar nome, telefone opcional e observações opcionais. Testar edição,
   busca sem acentos/caixa pelo nome e busca por telefone com ou sem formatação.
3. Tentar cadastrar outro cliente com o mesmo telefone usando +55 e formatação
   diferente: deve recusar. Nome igual sem telefone não é motivo para unir pessoas.
4. Preparar serviço, profissional e expedientes. Na agenda administrativa, selecionar
   um cliente existente ou cadastrar novo nome/telefone junto do atendimento.
   Cliente selecionado tem nome/telefone somente de leitura nesse formulário;
   a edição do cadastro é realizada em Clientes.
5. Publicar a barbearia e simular agendamento público com nome/telefone fictícios.
   Em Clientes, conferir o perfil associado e seu histórico. Telefone já cadastrado
   reutiliza o perfil da mesma barbearia sem sobrescrever nome/observações.
6. Cancelar um agendamento: permanece no histórico, sem aumentar frequência.
   Concluir um atendimento após o fim previsto: passa a contar como concluído.
   Para teste rápido no navegador, configurar serviço de um minuto e aguardar
   seu término. Testes de domínio verificam os tempos com relógio explícito.
7. Abrir detalhes: conferir serviço, profissional, data, duração e status, inclusive
   cancelados. Confirmados futuros ou passados sem conclusão não contam como
   atendimentos concluídos. Último atendimento usa o término do último concluído.
8. Criar outra barbearia e cadastrar o mesmo telefone: permitido, com perfil e
   histórico próprios. Alternar pelo seletor não mistura os dados.

## Identificação e regras

Clientes são registros locais com id/barbershopId, nome, telefone normalizado,
observações e timestamps. Nome tem 2–80 caracteres; observações até 500. Telefone
vazio é aceito; informado, exige DDD e número brasileiro válido. A normalização
remove formatação e guarda código 55, unificando formatos nacional/internacional.
Somente telefones não vazios são únicos dentro da mesma barbearia.

DemoAppointment ganhou clientId. O histórico é sempre filtrado da coleção de
appointments pelo par barbershopId/clientId; nenhuma lista de histórico é mantida
separadamente. Editar cadastro/telefone não reescreve snapshots antigos nem perde
seus vínculos. O histórico mostra nome informado no agendamento quando difere do
nome atual, sem reescrever fatos anteriores.

Ao criar um agendamento:
- validar primeiro serviço, profissional, horários e conflitos;
- seleção administrativa explícita reutiliza cliente da mesma barbearia;
- sem seleção, telefone normalizado existente reutiliza o perfil;
- sem correspondência por telefone, criar cliente novo, mesmo que o nome coincida;
- anexar cliente e atendimento na mesma atualização imutável local. Falha não
  deixa cliente parcialmente criado ou história duplicada.

O formulário público oferece apenas telefone opcional; não lista clientes, recebe
observações privadas ou aceita clientId explícito. Matching por telefone não prova
identidade e não permite alterar perfil. A confirmação mantém o nome informado
pelo visitante, sem revelar nome/observações já existentes na carteira. Isso é
organização demonstrativa, não autenticação nem segurança contra um usuário com
controle do próprio navegador.

## Indicadores

Reservas no histórico incluem confirmados, cancelados e concluídos. Frequência
conta somente status COMPLETED com completedAt e término não futuros no relógio
da consulta. Não há conclusão automática pelo simples decurso do tempo. O último
atendimento considera o maior endsAt entre essas conclusões, não a última reserva.
Resumo e detalhes são derivados novamente da agenda; não precisam de sincronização
de contadores duplicados. O relógio da interface atualiza a cada 30 segundos.

## Limites e persistência futura

Tudo existe somente em memória nesta aba e se perde ao recarregar. Nenhuma
autenticação/conta real, comunicação externa, armazenamento ou API foi criada.
Usar somente nomes, telefones e observações fictícios. Não há exclusão ou união
manual de cadastros nesta etapa. Sem telefone, a reutilização exige seleção
administrativa explícita; o público sem telefone recebe um perfil distinto por
agendamento para evitar unir pessoas pelo nome.

Não há importação de clientes/reservas reais ou persistência de etapas anteriores.
Se um servidor dev preservar um contexto antigo durante hot reload, iniciar um
contexto novo para testar o modelo atualizado, como esperado para a demonstração.

O servidor futuro deverá derivar usuário da sessão, validar membership e tenant,
verificar propriedade de clientId e dos agendamentos e impor unicidade de telefone
no escopo correto. IDs/telefone do navegador não são prova de identidade. O perfil
local não é um User do Better Auth e não provisiona contas; futura persistência
precisa modelar esse vínculo explicitamente. Nenhuma alteração Prisma foi feita.

## Arquivos

Criados:
- app/admin/clientes/page.tsx
- app/admin/clientes/_components/clients-panel.tsx
- app/admin/clientes/_components/client-form.tsx
- app/admin/clientes/_lib/client.ts
- tests/clients-demo.test.ts
- docs/clientes-demo-etapa-14.md

Modificados:
- app/admin/_lib/demo-barbershop.ts: carteira vazia por barbearia.
- app/admin/_components/demo-context.tsx: cadastro/edição local de clientes.
- app/admin/agenda/_lib/appointment.ts: clientId e resolução atômica do cliente.
- app/admin/agenda/_components/appointment-form.tsx: seleção de cliente existente
  ou dados de novo cliente; erros específicos de cliente.
- app/_components/public-booking-form.tsx: telefone opcional normalizado/validado.
- app/_lib/public-demo-booking.ts: recusa de seleção pública de clientId privado.
- app/admin/page.tsx: Clientes como seção interativa.
- app/admin/[section]/page.tsx: remove a prévia substituída pela rota própria.
- docs/agenda-demo-etapa-12.md e docs/agendamento-publico-demo-etapa-13.md: evolução.

## Validações

- 38 testes demonstrativos aprovados. Seis testes novos de clientes cobrem
  cadastro/edição, formatos de telefone, duplicidade, nomes iguais, histórico,
  indicadores, isolamento, perfil público e falha sem criação parcial.
- pnpm test: 230 testes existentes aprovados; runner inalterado.
- TypeScript sem emissão/sem incremental e ESLint: aprovados, apenas aviso
  informativo de baseline-browser-mapping antigo.
- git diff --check: aprovado; avisos LF/CRLF preexistentes.
- Build e verificação visual/interativa em navegador não executados.

Sem Neon, migrações, mudanças de Prisma/Stripe, autenticação, permissões reais,
reservas públicas legadas ou runner Neon. Nenhuma dependência nova, commit, push
ou deploy. Alterações anteriores preservadas. Aguardar autorização antes de avançar.
