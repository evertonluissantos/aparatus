# Etapa 15 — Separação dos acessos demonstrativos

## Rotas e reutilização

- `/`: experiência do cliente preservada integralmente. Nenhum componente público aprovado foi editado nesta etapa.
- `/painel`: entrada do proprietário. Subrotas: `/painel/onboarding`, `/painel/servicos`, `/painel/profissionais`, `/painel/horarios`, `/painel/agenda`, `/painel/clientes` e `/painel/configuracoes`.
- Os arquivos de rota em `app/painel` reexportam as páginas e o layout existentes em `app/admin`. Não há segunda implementação dos formulários ou regras. `/admin` e suas subrotas permanecem aliases de compatibilidade da mesma demonstração do proprietário; a navegação interna aponta para `/painel`. Não representam o administrador global.
- `/b/<slug>`: resolve exclusivamente uma barbearia publicada no catálogo demonstrativo, sem ambiguidade, e renderiza `DemoBarbershopPage` sem modificar sua apresentação nem criar calendário.
- `/gestao`: estrutura separada do Studio Notreve. Subrotas: `/gestao/proprietarios`, `/gestao/barbearias`, `/gestao/assinaturas`, `/gestao/pagamentos-pix`, `/gestao/ativacoes-suspensoes`. Sem indicadores inventados, dados reais, operações ou consultas ao banco. Seções desconhecidas retornam indisponibilidade.

## Uma barbearia por proprietário

`registerOwnerDemoShop` rejeita cadastro quando a coleção do proprietário já contém qualquer estabelecimento. O contexto aplica a verificação contra o snapshot mais recente, inclusive em chamadas sucessivas antes da renderização. Acesso direto ao onboarding com cadastro existente não mostra outro formulário. O seletor de múltiplas barbearias e o atalho de novo cadastro foram removidos.

Dados anteriores não são excluídos. Se uma sessão anterior ainda contiver várias barbearias, o contexto preserva a selecionada (ou usa a primeira), bloqueia novos cadastros e mostra aviso com os nomes adicionais preservados; não oferece alternância no painel. As funções gerais de isolamento continuam capazes de manipular coleções para manter os testes e dados históricos. A Aparência Impecável permanece em sua coleção pública fictícia separada, fora da carteira do proprietário.

Isso não é autorização: nesta fase não existe identidade de proprietário autenticada. A restrição vale para o contexto local de demonstração. Antes da produção, servidor e banco deverão assegurar a unicidade do estabelecimento por proprietário, com operação transacional e constraint adequada, e validar identidade/vínculo em todas as leituras e mutações. Não confiar em IDs ou papéis enviados pelo navegador. Nenhuma alteração de schema foi feita.

## Link público

O slug é definido no cadastro, normalizado sem acentos e preservado em `publicSlug`. Colisões com exemplos existentes recebem sufixo numérico. Renomear os dados futuramente não deverá substituir esse slug implicitamente. Cadastros antigos sem slug têm fallback pelo nome; conflitos são recusados pelo resolvedor, sem escolher arbitrariamente um estabelecimento.

Em Configurações e na confirmação do onboarding, publicar a demonstração e usar **Copiar link de agendamento**. A cópia usa o domínio atual do navegador e `/b/<slug>`; não existe domínio público inventado. Em caso de falha de permissão da área de transferência, o caminho continua visível para cópia manual. Rascunhos não habilitam cópia e não são resolvidos publicamente.

O endereço é estável durante a sessão, mas os dados não persistem. Compartilhar por WhatsApp, recarregar, abrir nova aba ou outro dispositivo NÃO transporta o cadastro ou os agendamentos. Produção exigirá slug único persistido e resolução pelo servidor. Não foi adicionada integração WhatsApp.

Confirmação pública continua no estado existente e atualiza a mesma agenda administrativa. Profissionais, serviços, duração, funcionamento, pausas, bloqueios, conflitos, cancelamentos e clientes permanecem nas regras anteriores.

## Better Auth inspecionado, sem alteração

- `lib/auth.ts` usa Better Auth com adaptador Prisma para PostgreSQL.
- O provedor Google está declarado com `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Não foram lidos valores ou verificada sua configuração remota.
- `lib/auth-client.ts` cria o cliente Better Auth; o menu público existente chama login social Google.
- `app/api/auth/[...all]/route.ts` expõe GET/POST pelo handler Better Auth.
- A configuração atual não habilita `emailAndPassword`; login com e-mail/senha do proprietário depende de etapa futura autorizada.
- `lib/authorization.ts` já contém verificações de sessão, vínculo e permissões, inclusive globais. Não foram conectadas às rotas demonstrativas nem executadas nesta etapa.

`/painel`, `/admin` e `/gestao` são rotas públicas demonstrativas, identificadas como tal. Nenhum formulário de login fictício, sessão falsa ou proteção aparente foi criado. A futura gestão global exigirá validação de administrador global no servidor; mensalidades Pix só poderão ser confirmadas por esse administrador. Não há cobranças, ativações ou suspensões nesta etapa.

## Arquivos desta etapa

Modificados:
- `app/admin/_lib/demo-barbershop.ts`: campo local opcional de slug, sem Prisma.
- `app/admin/_components/demo-context.tsx`: limite de um cadastro, slug e seleção única com preservação de dados.
- `app/admin/_components/admin-shell.tsx`: navegação do proprietário e remoção do seletor múltiplo.
- `app/admin/_components/publication-controls.tsx`: link público e cópia.
- `app/admin/onboarding/page.tsx`: bloqueio de segundo cadastro e navegação.
- `app/admin/page.tsx`, `app/admin/_components/section-preview.tsx`, `app/admin/agenda/_components/agenda-panel.tsx`, `app/admin/profissionais/_components/professionals-panel.tsx`: destinos internos para `/painel`.

Criados:
- `app/admin/_lib/owner-demo.ts`: regra de cadastro único e resolução de slugs.
- `app/painel/layout.tsx` e páginas de entrada, onboarding, serviços, profissionais, horários, agenda, clientes e seção de configurações: reexportações.
- `app/b/[slug]/page.tsx` e `shop-link.tsx`: resolução local com reutilização visual.
- `app/gestao/layout.tsx`, `page.tsx`, `sections.ts`, `[section]/page.tsx`: estrutura global.
- `tests/access-separation-demo.test.ts` e este documento.

## Conferência local

1. Acessar `/painel/onboarding`, cadastrar uma barbearia fictícia e explorar as funcionalidades existentes.
2. Retornar ao onboarding: o cadastro de outra barbearia deve estar bloqueado.
3. Configurar profissional, associação de serviço e expediente futuro em `/painel`.
4. Em Configurações, publicar, copiar o link e navegar pelo botão de página pública na mesma aba.
5. Escolher serviço, profissional, dia e horário no calendário existente; confirmar com cliente fictício. Abrir `/painel/agenda` na mesma aba para conferir o atendimento.
6. Abrir `/gestao`: somente estrutura separada, sem dados reais ou ações administrativas.
7. Conferir a página inicial e os detalhes públicos: não receberam alterações visuais.

Testes locais cobrem segundo cadastro, preservação de dados, slugs/collisões/rascunhos, resolução do link, registro na agenda correta e reutilização das rotas. Validação de navegador e autorização real não fazem parte dessas provas. Não houve conexão externa, migração, build, commit, push ou deploy.

O diretório de guias `node_modules/next/dist/docs/` solicitado pelo AGENTS.md não existe nesta instalação. Foram seguidos os padrões assíncronos de params e reexportações presentes no projeto, sem novas dependências.
