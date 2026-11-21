# Cortz — caminho de lançamento

O código conecta as telas existentes a operações de servidor. A persistência e o login só são ativados com `CORTZ_PERSISTENCE_ENABLED=true`. O padrão permanece desativado; nenhuma configuração existente foi alterada. Não ativar antes de validar o banco e os acessos. Não há migração automática no install/build.

## Configuração necessária (sem valores secretos no repositório)

- `DATABASE_URL`: conexão da aplicação, com role limitada às operações necessárias no banco escolhido. O código recusa as roles conhecidas de administração, migração e inspeção quando o MVP está ativo; exige URL explícita, normaliza TLS remoto para `verify-full` somente em memória e limita o pool a cinco conexões. Isso não substitui a conferência dos privilégios reais da role no banco.
- `BETTER_AUTH_SECRET`: segredo aleatório com pelo menos 32 caracteres, mantido no ambiente da aplicação.
- `BETTER_AUTH_URL`: origem exata da aplicação, incluindo protocolo. As operações de escrita conferem o header Origin contra essa origem.
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`: opcionais para habilitar Google. Configurar o callback `/api/auth/callback/google` para a mesma origem. Sem essas variáveis, e-mail/senha continua disponível e o botão Google fica desativado.
- `CORTZ_PERSISTENCE_ENABLED=true`: somente depois da validação. Esta opção habilita as APIs reais e desabilita os escritores legados de criação/checkout/cancelamento.

## Fluxos implementados

- `/acesso/proprietario`: Better Auth por e-mail/senha, Google quando configurado e encerramento de sessão. Recuperação de senha ainda depende de provedor de e-mail e não foi simulada.
- `/painel` e alias `/admin`: sessão e vínculo OWNER no servidor. Cadastro transacional de uma barbearia por usuário; índice parcial inclui vínculos inativos. IDs e papéis do navegador não concedem autorização.
- `/api/owner`: dados privados da própria barbearia, cadastro, configurações, publicação, serviços, profissionais/associações, horários, bloqueios e clientes. Alterações conferem revisão para recusar abas desatualizadas. Imagens seguem o componente existente; não há novo serviço de upload.
- `/b/<slug>`: dados publicados do banco, no componente público existente. Nenhum cliente, histórico, telefone privado de profissional ou motivo de bloqueio é retornado no catálogo.
- `/api/public`: disponibilidade no núcleo existente; confirmação por cookie assinado HttpOnly, idempotência e transação. Não exige User fictício. O telefone normalizado identifica o cadastro dentro da barbearia, sem sobrescrever nome/observações de uma pessoa existente.
- Reservas, horários e bloqueios compartilham o lock da barbearia. Uma reserva relê e revalida disponibilidade dentro da mesma transação. A constraint GiST também protege intervalos dos registros geridos pelo núcleo. O bloqueio dos escritores legados depende da ativação do MVP em todos os processos; versões antigas não podem continuar escrevendo em paralelo.
- `/gestao`, `/gestao/assinaturas` e `/gestao/pagamentos-pix`: autorização GlobalAdmin ativa, confirmação manual por competência/valor, autoria auditável e unicidade por barbearia/competência. Não há API bancária, cobrança, Stripe ou suspensão automática. Confirmar é uma declaração do administrador de que conferiu o recebimento.

## Banco e publicação

1. Validar primeiro o projeto de testes `orange-rice-48468127`, branch `br-small-surf-b694suzd`, banco `cortz_test_integration`, pelo mecanismo de identidade existente. O projeto `sparkling-union-52245638` continua proibido nesta operação.
2. Há agora **oito migrações**, incluindo a inicial. As sete anteriores foram preservadas. `20261120120000_manual_pix_subscription` é aditiva e necessária porque não existia armazenamento da confirmação Pix. Nenhuma foi executada nesta implementação.
3. Validar o DDL, rollback, concorrência, sessões e persistência no PostgreSQL autorizado. Testes com mocks e build não substituem essa validação.
4. Provisionar o primeiro GlobalAdmin a partir de um User real, por operação administrativa autorizada. O cadastro público nunca concede esse papel e nenhum e-mail fixo é utilizado como autorização.
5. Na Vercel: Node 22, instalação pnpm (postinstall gera o Prisma sem conexão), build `pnpm build`, variáveis acima no escopo apropriado. Não incluir credenciais administrativas de testes em produção. Não rodar migrate no build. Definir o banco de produção e autorizar sua preparação separadamente, com backup e conferência de histórico antes de qualquer escrita.

## Limites conhecidos do MVP

- Sem banco nesta sessão: SQL, role da aplicação, autenticação real/Google e concorrência real permanecem sem validação remota.
- Pausas semanais são persistidas como lacunas entre janelas de WorkingHours; após recarregar, aparecem como períodos separados.
- Dados históricos sem profissional/duração/fuso continuam exigindo revisão; não há backfill inventado. O painel novo lista os atendimentos geridos pelo núcleo; os registros legados permanecem preservados.
- O painel carrega um snapshot da barbearia. Paginação e armazenamento externo de imagens serão necessários quando o volume justificar; não foram criados nesta entrega.
- Recomendados/Populares mantêm os exemplos fictícios já existentes e identificados; novas publicações não recebem ranking automático.
- A confirmação pública retorna o recibo da própria operação. Não há portal de histórico anônimo entre dispositivos.

## Verificações locais desta implementação — 20/11/2026

- 161 testes unitários com mocks por fuso (UTC e America/Sao_Paulo): 322 execuções aprovadas.
- 12 testes dos contratos públicos, link e demonstração aprovados; não equivalem a validação visual no navegador ou E2E com banco.
- TypeScript, ESLint dos arquivos alterados, validação offline do schema e geração real do cliente Prisma 7.1.0 aprovados.
- Build de produção webpack concluído com o MVP habilitado, ambiente sanitizado, segredo fictício e URL de banco fictícia local. Nenhum acesso ao Neon foi realizado.
- Corrigido o conflito de tipos do Next 16 no Windows: o componente compartilhado `ui/page.tsx` foi renomeado para `ui/page-layout.tsx`, sem alterar seu JSX ou estilos.
- Nenhuma instalação de dependência, migração, alteração de role, cobrança, commit ou deploy foi executado. O aviso de baseline-browser-mapping desatualizado não bloqueou as verificações.
