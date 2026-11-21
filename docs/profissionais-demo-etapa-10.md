# Etapa 10 — gestão demonstrativa de profissionais

Atualização etapa 11: horários individuais agora podem ser configurados em
/admin/horarios, com funcionamento da barbearia, pausas, bloqueios e prévia local.
Consulte horarios-demo-etapa-11.md. As referências abaixo a horários como próxima
etapa são históricas; reservas continuam não implementadas no fluxo demo.

## Fluxo para testar no navegador

1. Executar `pnpm dev` e abrir `http://localhost:3000/admin`.
2. Cadastrar uma barbearia fictícia no onboarding. Entrar em Profissionais
   (`/admin/profissionais`). O catálogo da equipe começa vazio.
3. Adicionar profissional: nome e descrição obrigatórios; telefone e foto
   opcionais. Foto local JPG/PNG/WebP até 2 MB, sem upload; pode ser removida.
4. Selecionar vários serviços ativos e salvar. Nome aceita 2–80 caracteres,
   descrição 1–300 e telefone brasileiro com DDD (+55 opcional).
5. Criar outro profissional com o mesmo serviço: associação muitos-para-muitos.
6. Editar dados e associações, testar erros de validação, busca por nome e filtros
   de status. Desativar/reativar pelo card ou pelo formulário.
7. Desativar um serviço em Serviços e voltar à equipe: o vínculo anterior é
   identificado como inativo. Pode ser mantido ou removido; após removido, não
   pode ser adicionado novamente enquanto o serviço estiver inativo.
8. Criar outra barbearia e alternar pelo seletor: equipe e serviços são separados.
   Rascunhos, busca e editor reiniciam ao trocar de barbearia. Voltar à primeira
   preserva os dados enquanto o contexto da aba estiver montado.
9. Recarregar a página: todo o contexto criado é descartado, como nas etapas
   anteriores. Nenhum profissional de exemplo real ou externo é carregado.

## Regras e arquitetura

DemoBarbershop agora contém professionals[], com id e barbershopId explícitos.
Cada profissional possui serviceIds[], permitindo vários serviços/profissionais.
Os helpers locais validam a barbearia selecionada, IDs de serviço, duplicatas,
IDs de profissional e vínculos históricos antes de criar/editar.

Novas associações exigem serviço ativo da mesma barbearia. Serviço desativado
não apaga dados nem vínculos anteriores. Profissional sem serviços é permitido,
mas não é elegível para novos atendimentos. Inativar não remove os dados.

eligibleDemoProfessionals exige profissional ativo, serviço ativo e associação,
todos do mesmo contexto. É preparação para uso futuro, não calcula disponibilidade
e não foi conectado a reservas. A interface declara que horários individuais
ainda não podem ser configurados. Nenhum atendimento, vaga ou expediente é simulado.

As verificações locais NÃO são autorização real: dados vivem apenas em memória,
sem servidor, autenticação nova, grants, banco, storage, cookies ou API. No futuro,
o servidor deverá derivar usuário da sessão, verificar membership/permissão e
limitar todas as operações ao tenant autorizado, sem confiar em papéis/IDs do
navegador. serviceIds[] corresponde à futura associação ProfessionalService;
id/barbershopId/name/active correspondem ao núcleo de Professional. Telefone,
descrição e foto não existem hoje nesse modelo Prisma e precisarão de evolução
própria antes da persistência. Prisma não foi alterado nesta etapa.

## Arquivos

Criados:
- app/admin/profissionais/page.tsx
- app/admin/profissionais/_components/professionals-panel.tsx
- app/admin/profissionais/_components/professional-form.tsx
- app/admin/profissionais/_lib/professional.ts
- tests/professionals-demo.test.ts
- docs/profissionais-demo-etapa-10.md

Modificados:
- app/admin/_lib/demo-barbershop.ts: coleção vazia de profissionais por barbearia.
- app/admin/_components/demo-context.tsx: operações locais de cadastro/edição/status.
- app/admin/_components/cover-input.tsx: reutilização para foto opcional/removível,
  preservando os parâmetros padrão da capa do onboarding.
- app/admin/page.tsx: card Profissionais identificado como interativo.
- app/admin/[section]/page.tsx: remove a prévia substituída pela rota própria.

## Verificações

- `pnpm exec tsx --test tests/professionals-demo.test.ts tests/onboarding-demo.test.ts tests/services-demo.test.ts tests/public-demo-catalog.test.ts`:
  15 testes aprovados, incluindo validações, foto/telefone opcionais, associações
  muitos-para-muitos, edição, troca de status, contextos distintos, serviços
  inativos, IDs duplicados e preservação dos vínculos anteriores.
- `pnpm test`: 230 testes existentes aprovados, runner inalterado.
- TypeScript sem emissão/sem incremental e ESLint aprovados; apenas aviso de
  baseline-browser-mapping antigo.
- git diff --check aprovado; avisos LF/CRLF preexistentes.
- Build e verificação visual/interativa no navegador não executados.

Sem dependências novas, acesso Neon, migrações ou alterações de Prisma, Stripe,
autenticação, permissões, reservas públicas ou runner. Sem commit/push/deploy.
Alterações anteriores preservadas. Próxima funcionalidade depende de autorização.
