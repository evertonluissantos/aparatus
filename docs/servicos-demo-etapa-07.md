# Etapa 07 — gestão demonstrativa de serviços

Atualização etapa 09: catálogos de serviços também alimentam os detalhes públicos
das barbearias publicadas na demonstração. Consulte catalogo-demo-etapa-09.md.

Atualização etapa 08: o catálogo agora é vinculado à barbearia do contexto local,
criado pelo onboarding em /admin. Consulte onboarding-demo-etapa-08.md; recarregar
apaga esse contexto, e a navegação interna preserva catálogos por barbearia.
As descrições de estado isolado da etapa 07 abaixo são históricas.

Rota: `/admin/servicos`. Execute `pnpm dev` e abra
`http://localhost:3000/admin/servicos` (ou a porta indicada pelo servidor).
A página não importa Prisma, autenticação, Stripe ou ações de reservas.
Não precisa de dados do banco para o catálogo. O layout global existente é
reutilizado, incluindo fontes, tema e notificações; não foi alterado.

## Funcionalidades

- Catálogo fictício com nome, descrição, preço, duração e status.
- Busca por nome sem diferença de caixa ou acento e filtro de status.
- Criação/edição em formulário lateral, ativação/desativação e contadores.
- Feedback por notificações e região de status acessível.
- Erros por campo, foco no primeiro campo inválido, labels e estados vazios.
- Lista adaptável para celular e desktop, com navegação lateral no desktop.
- Aviso persistente de demonstração e ausência de controle de acesso.

Dados vivem somente em useState: nenhuma gravação em banco, localStorage,
cookies ou API. Recarregar/remontar a página restaura o catálogo de exemplo.
Cancelar/fechar o formulário descarta o rascunho. Alterar status não afeta
agendamentos nem disponibilidade pública. Não há exclusão de serviço.

Nome: 2–80 caracteres; descrição obrigatória: até 300; preço positivo com até
duas casas decimais e sem separador de milhar; duração inteira de 1–1.440 minutos.
Valores monetários são convertidos para centavos após validação. Identificadores
criados localmente não representam registros persistidos.

## Organização e integração futura

- page.tsx: entrada e metadados próprios, noindex (não equivale a autenticação).
- _lib/demo-data.ts: fixtures sem dados reais.
- _lib/service.ts: contrato de dados, validações e funções de apresentação/busca.
- _components/services-panel.tsx: estado local, listagem, busca e operações.
- _components/service-form.tsx: formulário e mensagens de validação.

O formulário entrega ServiceValues ao callback onSave. Uma integração futura
poderá substituir o tratamento local por persistência, mas exigirá validação e
autorização também no servidor. Esta rota é pública e demonstrativa; não usar
para inserir dados reais. Nenhuma permissão fictícia foi criada.

## Validação

- `pnpm exec tsx --test tests/services-demo.test.ts`: 4 testes aprovados, cobrindo
  conversão de moeda, rejeição de valores ambíguos/não positivos, duração, busca
  e integridade das fixtures.
- `pnpm test`: 230 testes aprovados nos dois fusos. Runner não modificado.
- `pnpm exec tsc --noEmit --incremental false`: aprovado.
- `pnpm exec eslint app/admin/servicos tests/services-demo.test.ts`: aprovado,
  apenas aviso informativo de baseline-browser-mapping antigo.
- Build e verificação visual em navegador não executados nesta entrega.

Nenhuma dependência adicionada. Sem migração, schema alterado, acesso ao Neon,
Stripe ou modificação nos fluxos públicos. Todos os arquivos desta etapa são
novos; alterações anteriores preservadas. A documentação Next indicada em
AGENTS.md não estava presente em node_modules/next/dist/docs nesta instalação.
