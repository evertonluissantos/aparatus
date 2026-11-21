# Restauração da página da barbearia e reservas demonstrativas

## Componentes recuperados

A composição foi recuperada de `git show HEAD:app/barbershops/[id]/page.tsx` e `git show HEAD:app/_components/service-item.tsx`, sem restaurar arquivos globalmente. Capa de 297px, botão circular sobreposto, informações com cantos superiores arredondados, tipografia, separadores, cards de serviços com imagem de 110px, contato com `PhoneItem` e rodapé Aparatus usam a estrutura original. O cabeçalho adicional e a lista textual de serviços foram removidos da página demonstrativa.

`PublicDemoBooking` agora apresenta cada serviço com seu botão Reservar e o Sheet original de 370px. `PublicBookingForm` reutiliza o mesmo `ui/calendar.tsx` do legado, em português, com seleção única e dias passados desabilitados. Os horários voltaram à rolagem horizontal com botões arredondados. O serviço vem do card e permanece selecionado. Profissional e dados fictícios do cliente são os campos adicionais necessários ao fluxo atual.

As fotografias originais de serviços fictícios foram recuperadas como constantes do seed, que não é importado nem executado. Serviços personalizados sem fotografia própria usam a capa da barbearia. Não foi acrescentado upload de serviços nesta correção.

## Integração preservada

Disponibilidade continua em `publicDemoAvailability`, reaproveitando expediente, pausas, bloqueios, duração e conflitos. A confirmação chama somente `createPublicAppointment`, que revalida o estado mais recente e registra na mesma coleção usada pela agenda administrativa e histórico de clientes. Cancelar pela agenda mantém o histórico e libera o intervalo. Nenhuma ação de reserva legada ou Stripe é importada pelo fluxo demonstrativo.

Exemplos fixos e barbearias publicadas usam os mesmos cards e estrutura. Exemplos sem agenda configurada mantêm Reservar e explicam a indisponibilidade ao abrir, sem inventar profissionais ou horários. Página inicial, rotas reais e telas administrativas não foram alteradas.

## Conferência manual posterior

1. Acessar o catálogo e abrir um exemplo: conferir capa, informações, cards, contato e rodapé. Reservar informa que não existe agenda configurada.
2. No painel demonstrativo existente, cadastrar uma barbearia, configurar serviço, profissional associado e horários futuros; publicar.
3. Abrir seu card público, clicar Reservar no serviço, escolher profissional, dia no calendário e horário. Preencher cliente fictício e confirmar.
4. Abrir `/admin/agenda`, selecionar a mesma barbearia e data: o registro deve estar presente. Cancelar, retornar ao serviço e conferir a liberação do horário. O cancelamento permanece no histórico.
5. Recarregar descarta tudo: não há persistência ou garantia de reserva real.

## Verificação e limites

Testes locais cobrem o contrato estrutural da restauração, serviço selecionado, reutilização do Calendar e ausência de imports de checkout; os testes funcionais existentes cobrem criação pública, agenda, clientes, isolamento, revalidação, pausas, bloqueios e cancelamento. Não houve comparação visual em navegador nem teste de interação de ponta a ponta. Fidelidade foi conferida no JSX/classes recuperados do Git. Fotografias remotas mantêm suas URLs originais e dependem da disponibilidade do provedor ao exibir no navegador.

Nenhum banco, API Neon, Stripe, migração ou serviço real foi acessado. O guia solicitado em `node_modules/next/dist/docs/` não está presente nesta instalação; foram reutilizados os componentes e padrões já existentes, sem introduzir novas APIs de Next.js.
