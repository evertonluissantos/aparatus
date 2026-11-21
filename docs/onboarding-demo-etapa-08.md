# Etapa 08 — onboarding e estrutura administrativa demonstrativa

Atualização etapa 09: o contexto agora vive no layout raiz e é compartilhado com
o catálogo público em /. Capa e publicação manual foram adicionadas; consulte
catalogo-demo-etapa-09.md. A navegação para fora do admin preserva o estado, sem
recarregamento. As descrições do escopo anterior abaixo são históricas.

## Visualização

Execute `pnpm dev` e abra `http://localhost:3000/admin`. Caso o servidor use outra
porta, ajuste o endereço. O acesso direto a `/admin/servicos` sem contexto local
também apresenta a entrada de onboarding, sem consultar banco ou autenticação.

1. Selecionar Cadastrar barbearia demo.
2. Em `/admin/onboarding`, preencher nome, telefone com DDD, endereço e descrição
   usando somente dados fictícios. Campos obrigatórios são validados; telefone
   aceita formatação brasileira e +55 opcional. Erros ficam associados ao campo,
   com foco no primeiro inválido.
3. Conferir a confirmação demonstrativa e selecionar Explorar painel.
4. Em `/admin`, visualizar nome/endereço e resumo do catálogo de exemplo.
5. Acessar `/admin/servicos` para criar, editar e ativar/desativar serviços locais.
6. Usar Adicionar barbearia demo para cadastrar outra e alternar pelo seletor.
   Cada barbearia recebe seu próprio catálogo fictício, sem compartilhar objetos.
   Navegar e alternar preserva os dados enquanto o layout estiver montado.

Navegação lateral no desktop e horizontal com rolagem no celular. As rotas
`/admin/profissionais`, `/admin/agenda` e `/admin/clientes` são prévias explícitas,
sem operações implementadas. `/admin/configuracoes` exibe os dados locais somente
para leitura. Rotas de seção desconhecidas retornam notFound.

## Estado e limites

DemoProvider reside no layout administrativo; nenhum dado é enviado ao servidor,
gravado em storage/cookie ou persistido. Recarregar, abrir em outra aba ou remontar
o layout perde todo o contexto. O catálogo da etapa 07 agora depende de uma
barbearia demonstrativa; os exemplos são criados quando ela é adicionada.

IDs de serviço e barbershopId são explícitos e organizados por barbearia no estado
local. A atualização verifica a coerência local do barbershopId; isso NÃO é
autorização multi-tenant. Não há criação de User, conta, membership, administrador,
assinatura ou cobrança Pix. Não há seleção de papéis ou sessão fictícia.
Todas as páginas exibem aviso de demonstração e ausência de controle de acesso.

Na integração persistente futura, o servidor deverá obter a identidade da sessão,
verificar membership/permissão para a barbearia, limitar consultas/gravações pelo
tenant e validar relacionamentos. IDs, papéis e validação enviados pelo navegador
não são evidência de autorização. Nenhuma dessas operações foi ativada aqui.

## Arquivos desta etapa

Criados:
- app/admin/layout.tsx
- app/admin/page.tsx
- app/admin/onboarding/page.tsx
- app/admin/[section]/page.tsx
- app/admin/_components/admin-shell.tsx
- app/admin/_components/demo-context.tsx
- app/admin/_components/section-preview.tsx
- app/admin/_lib/demo-barbershop.ts
- tests/onboarding-demo.test.ts
- docs/onboarding-demo-etapa-08.md

Modificados:
- app/admin/servicos/_components/services-panel.tsx: usa catálogo do contexto e
  remove shell duplicado; busca/filtros/editor reiniciam ao trocar de barbearia.
- app/admin/servicos/_components/service-form.tsx: aviso atualizado de perda do contexto.
- docs/servicos-demo-etapa-07.md: referência ao novo comportamento.

## Validação local

- `pnpm exec tsx --test tests/onboarding-demo.test.ts tests/services-demo.test.ts`:
  sete testes aprovados (validação, telefone, catálogos independentes, edição e
  criação por contexto, rejeição de mistura local, validações de serviço).
- `pnpm test`: 230 testes existentes aprovados, runner inalterado.
- TypeScript sem emissão/sem incremental: aprovado.
- ESLint de app/admin e dos testes demonstrativos: aprovado; aviso informativo
  de baseline-browser-mapping antigo, sem instalação ou atualização.
- git diff --check: aprovado, com avisos LF/CRLF existentes.
- Build e verificação visual/interativa em navegador não executados.

Nenhuma dependência adicionada, conexão Neon, migração ou mudança em Prisma,
Stripe, autenticação, reservas públicas ou runner. Alterações anteriores preservadas.
A documentação Next indicada no AGENTS.md continua ausente nesta instalação;
foram seguidas as convenções locais de páginas/layouts e params assíncronos.
