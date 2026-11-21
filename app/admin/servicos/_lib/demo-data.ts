import type { DemoService } from "./service";

// Fictional catalog. No Prisma, server actions, storage or external services.
export const demoServices: DemoService[] = [
  {
    id: "demo-corte",
    name: "Corte clássico",
    description: "Corte na tesoura ou máquina, com acabamento e finalização.",
    priceInCents: 4500,
    durationMinutes: 30,
    active: true,
  },
  {
    id: "demo-barba",
    name: "Barba completa",
    description: "Desenho da barba, toalha quente e cuidado com a pele.",
    priceInCents: 3500,
    durationMinutes: 30,
    active: true,
  },
  {
    id: "demo-combo",
    name: "Corte + barba",
    description: "Uma experiência completa: corte, barba e finalização.",
    priceInCents: 7500,
    durationMinutes: 60,
    active: true,
  },
  {
    id: "demo-hidratacao",
    name: "Hidratação capilar",
    description: "Tratamento para devolver maciez e brilho aos fios.",
    priceInCents: 3000,
    durationMinutes: 20,
    active: true,
  },
  {
    id: "demo-sobrancelha",
    name: "Design de sobrancelhas",
    description: "Limpeza e alinhamento dos fios com acabamento natural.",
    priceInCents: 2000,
    durationMinutes: 15,
    active: false,
  },
];
