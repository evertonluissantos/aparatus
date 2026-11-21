# Etapa 16 — Autenticação dos proprietários preparada, sem ativação

## Auditoria anterior às alterações

- `lib/auth.ts` já usava Better Auth, adaptador Prisma/PostgreSQL e provedor Google. O Google depende de `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Nenhuma variável secreta, arquivo `.env` ou configuração remota foi consultada.
- `lib/auth-client.ts` já criava o cliente React. O menu público original já possuía login social Google e encerramento de sessão; não foi modificado.
- `app/api/auth/[...all]/route.ts` já expunha GET e POST pelo handler Better Auth; foi preservado.
- `User` (`user`) contém e-mail único e `emailVerified`; `Account` (`account`) já contém `password` opcional e os tokens dos provedores; `Session` (`session`) contém token único, validade e vínculo com usuário; `Verification` (`verification`) já existe.
- O código instalado do Better Auth usa conta `providerId = credential`, hash da senha em `Account.password` e criação/validação de sessão pelo próprio Better Auth. Não foi criada uma implementação alternativa de senhas, cookies ou sessões.
- `requireAuthenticatedUser` já validava a sessão no servidor com `auth.api.getSession({ headers: await headers() })`. As verificações tenant consultam vínculos e recursos no próprio estabelecimento. `requireGlobalPermission` exige registro ativo em `GlobalAdmin`; não confia em e-mail, papel informado pelo navegador ou role OWNER.
- `BarbershopMembership` possui unicidade do par usuário/barbearia, mas não impede que o mesmo usuário seja OWNER de várias barbearias. A existência dos modelos no schema não comprova sua presença no banco remoto.

O schema de autenticação em código é compatível com e-mail/senha sem novo campo. Não foi verificado o schema efetivamente aplicado, a validade das credenciais OAuth, o domínio/base URL, o segredo do Better Auth ou o comportamento de cookies no ambiente de implantação. Nenhuma conexão foi realizada.

## Implementação

1. `/acesso/proprietario`: tela própria usando Button/Input existentes, com modos Entrar/Criar conta, nome, e-mail, senha e confirmação. Prepara os métodos nativos `authClient.signIn.email`, `signUp.email`, `signIn.social` e `signOut`.
2. Validação local: nome 2–80 caracteres, e-mail válido com espaços externos removidos, senha nova 12–128 caracteres e confirmação idêntica. Login não impõe o mínimo de cadastro sobre senhas anteriores. Senhas não são normalizadas, registradas ou armazenadas no estado demonstrativo.
3. Erros de autenticação exibem mensagens genéricas próprias, sem ecoar resposta do provedor, senha, e-mail, URL, token ou exceção. O formulário evita submissões simultâneas e usa retorno fixo `/painel`, sem callback livre vindo de query string. Erro de retorno Google aceita apenas o marcador fixo `erro=google`.
4. `lib/auth.ts` declara e-mail/senha com `enabled: false`, reaproveitando Better Auth. Google legado permanece conforme a configuração anterior. Não houve alteração do handler ou das políticas existentes de sessão.
5. `OWNER_AUTH_ENABLED = false` é uma decisão explícita no código, não uma flag de navegador nem um novo parâmetro de ambiente para ativação acidental. Enquanto desabilitada, os campos e botões da tela ficam bloqueados e os handlers retornam antes de qualquer chamada. Não há login simulado ou criação de conta fictícia.
6. A recuperação de acesso é informada como futura. Não há endpoint de recuperação, envio de e-mail ou promessa de entrega.
7. `requireOwnerPanelAccess` prepara a verificação server-side da sessão e dos vínculos OWNER, incluindo inativos, com consulta limitada a dois vínculos. Múltiplos vínculos, suspensão, role ou usuário divergente são recusados. Nenhum vínculo permite apenas o contexto de primeiro onboarding futuro; não cria barbearia ou membership.
8. `ManagementGate` envolve o layout compartilhado de `/admin` e `/painel` e o layout de `/gestao`. Assim, acesso direto às subrotas usa o mesmo controle. Se a autenticação vier a ser ativada após revisão, usuários anônimos serão direcionados a `/acesso/proprietario`, proprietários dependerão da verificação OWNER e o global exigirá `requireGlobalPermission`. Falhas conhecidas negam acesso; falhas desconhecidas de sessão/banco retornam indisponibilidade.

## Estado efetivo das rotas hoje

| Rotas | Desenvolvimento/testes | Produção ou ambiente não reconhecido |
| --- | --- | --- |
| `/painel/**`, `/admin/**` | Demonstração pública local, sem autenticação real ou dados privados | Bloqueadas por indisponibilidade enquanto o rollout estiver desabilitado |
| `/gestao/**` | Prévia estrutural pública, sem dados/ações reais | Bloqueada por indisponibilidade enquanto o rollout estiver desabilitado |
| `/acesso/proprietario` | Página pública, cadastro/login/Google/logout desabilitados | Mesmo bloqueio das operações de autenticação do proprietário |
| `/`, catálogo, `/b/**` e detalhes demonstrativos | Experiência pública existente | Não alterada por esta etapa |
| `/api/auth/**` | Handler legado do Better Auth preservado; e-mail/senha explicitamente desabilitado | Mesmo contrato; Google legado depende de configuração externa existente |

A barreira de produção é efetiva no código e não importa dependências de banco/autenticação quando desabilitada. Isso NÃO significa que o controle de identidade dos painéis esteja ativado ou que o login real tenha sido validado. A demonstração local permanece deliberadamente pública e identificada como tal. Não houve implantação ou prova de comportamento em navegador/servidor real.

Os layouts atualmente envolvem somente demonstrações. Antes de adicionar qualquer dado privado, cada consulta, server action e endpoint também deverá exigir autorização server-side. Um layout sozinho não substitui controle nas operações. Não ligar o estado demonstrativo compartilhado a uma identidade real nem tratá-lo como dados persistentes.

## Uma barbearia por proprietário: pendência obrigatória de produção

O limite local da Etapa 15 continua preservado. A nova leitura de vínculos recusa a situação já inconsistente, mas não resolve concorrência de criação. Antes da produção:

- Avaliar os vínculos históricos sem excluir ou escolher silenciosamente uma barbearia.
- Preparar, revisar e autorizar a constraint de unicidade de proprietário (por exemplo índice único parcial sobre userId para role OWNER, considerando vínculos inativos conforme a regra comercial). Nenhuma migração foi criada ou aplicada aqui.
- Implementar o cadastro persistente com a identidade da sessão e transação atômica de barbearia/vínculo, tratando a violação de unicidade. Não confiar em ownerId ou role do navegador.
- Validar isolamento de tenant em todas as operações e concessão de administrador global por procedimento administrativo auditável, nunca por e-mail fixo.

## Dependências antes de ativar

1. Autorização específica para qualquer conexão e validação de banco, inicialmente no ambiente isolado apropriado; esta etapa não autoriza conexão.
2. Confirmar o schema efetivamente disponível e planejar migrações pendentes de membership/GlobalAdmin e unicidade de proprietário. Verificar o cliente Prisma e compatibilidade transacional.
3. Configurar e validar localmente os segredos do Better Auth, URLs/origens confiáveis, HTTPS/cookies e aplicativo OAuth Google/callback, sem expor valores no chat, Git ou logs.
4. Decidir e implementar a política de verificação de e-mail e recuperação, com envio seguro, limites e mensagens sem enumeração de contas; não há envio implementado nesta etapa.
5. Validar login/cadastro/logout/sessão e revogação com Better Auth real em ambiente isolado autorizado, incluindo falhas e OAuth. Os testes desta etapa usam mocks e não comprovam cookies ou callbacks reais.
6. Substituir dados demonstrativos por operações autorizadas tenant-scoped e proteger cada acesso a dados, antes de revisar a ativação. Não basta trocar a constante para true.

## Arquivos

Modificados: `lib/auth.ts`, `lib/authorization.ts`, `app/admin/layout.tsx`, `app/admin/_components/admin-shell.tsx`, `app/gestao/layout.tsx`, `tests/load-production.mjs`, `tests/core.test.mjs`.

Criados: `lib/owner-auth-policy.ts`, `lib/management-access.ts`, `app/admin/_components/management-gate.tsx`, `app/acesso/proprietario/page.tsx`, `app/acesso/proprietario/owner-auth-form.tsx`, `tests/owner-auth.test.mjs` e este documento.

A ampliação mínima do loader de testes apenas permite executar os novos módulos com dependências fictícias e NODE_ENV fixo de teste. O runner Neon não foi alterado. Nenhuma dependência foi adicionada.

## Validação local e limites

Os novos testes cobrem validação de cadastro/login, senhas sem alteração, erros genéricos, config Better Auth com senha desabilitada, bloqueio em produção/ambiente desconhecido, nenhuma importação de banco no modo desabilitado, destino fixo de login e vinculação dos layouts, decisões de autorização com mocks e vínculos OWNER inválidos/suspensos/duplicados. Os testes anteriores de GlobalAdmin continuam exigindo registro no banco, sem confiar em papéis da sessão.

Nenhum teste criou conta ou sessão real, enviou e-mail, acessou Google, Stripe ou Neon. A home, detalhes, cards, carrosséis, serviços, calendário, schema Prisma e reservas legadas não foram alterados. Não foi executado build, migração, commit, push ou deploy. O diretório de documentação `node_modules/next/dist/docs/` continua ausente nesta instalação; foram usados os padrões existentes de params/searchParams assíncronos e layouts do projeto.

Resultados: pnpm test aprovado (121 casos por fuso UTC/São Paulo, 242 execuções); 51 testes demonstrativos aprovados; TypeScript sem emissão, ESLint e git diff --check aprovados. ESLint emitiu somente o aviso existente de baseline-browser-mapping desatualizado; Git emitiu avisos de conversão LF/CRLF, sem erros de whitespace. Não houve validação visual ou autenticação real em navegador.
