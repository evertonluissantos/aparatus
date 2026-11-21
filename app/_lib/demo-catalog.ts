import {
  createDemoBarbershop,
  publishedDemoShops,
  type DemoBarbershop,
} from "../admin/_lib/demo-barbershop";
import { matchesServiceName } from "../admin/servicos/_lib/service";

// Existing fictional seed examples copied as data; seed.ts is never imported/run.
const examples = [
  {
    name: "Barbearia Vintage",
    address: "Rua da Barbearia, 123",
    imageUrl: "https://utfs.io/f/c97a2dc9-cf62-468b-a851-bfd2bdde775f-16p.png",
  },
  {
    name: "Corte & Estilo",
    address: "Avenida dos Cortes, 456",
    imageUrl: "https://utfs.io/f/45331760-899c-4b4b-910e-e00babb6ed81-16q.png",
  },
  {
    name: "Barba & Navalha",
    address: "Praça da Barba, 789",
    imageUrl: "https://utfs.io/f/5832df58-cfd7-4b3f-b102-42b7e150ced2-16r.png",
  },
  {
    name: "The Dapper Den",
    address: "Travessa da Navalha, 101",
    imageUrl: "https://utfs.io/f/7e309eaa-d722-465b-b8b6-76217404a3d3-16s.png",
  },
  {
    name: "Cabelo & Cia.",
    address: "Alameda dos Estilos, 202",
    imageUrl: "https://utfs.io/f/178da6b6-6f9a-424a-be9d-a2feb476eb36-16t.png",
  },
  {
    name: "Machado & Tesoura",
    address: "Estrada do Machado, 303",
    imageUrl: "https://utfs.io/f/2f9278ba-3975-4026-af46-64af78864494-16u.png",
  },
  {
    name: "Barbearia Elegance",
    address: "Avenida Elegante, 404",
    imageUrl: "https://utfs.io/f/988646ea-dcb6-4f47-8a03-8d4586b7bc21-16v.png",
  },
  {
    name: "Aparência Impecável",
    address: "Praça da Aparência, 505",
    imageUrl: "https://utfs.io/f/60f24f5c-9ed3-40ba-8c92-0cd1dcd043f9-16w.png",
  },
  {
    name: "Estilo Urbano",
    address: "Rua Urbana, 606",
    imageUrl: "https://utfs.io/f/f64f1bd4-59ce-4ee3-972d-2399937eeafc-16x.png",
  },
  {
    name: "Estilo Clássico",
    address: "Avenida Clássica, 707",
    imageUrl: "https://utfs.io/f/e995db6d-df96-4658-99f5-11132fd931e1-17j.png",
  },
];
const services = [
  {
    name: "Corte de Cabelo",
    description: "Estilo personalizado com as últimas tendências.",
    priceInCents: 6000,
  },
  {
    name: "Barba",
    description: "Modelagem completa para destacar sua masculinidade.",
    priceInCents: 4000,
  },
  {
    name: "Pézinho",
    description: "Acabamento perfeito para um visual renovado.",
    priceInCents: 3500,
  },
  {
    name: "Sobrancelha",
    description: "Expressão acentuada com modelagem precisa.",
    priceInCents: 2000,
  },
  {
    name: "Massagem",
    description: "Relaxe com uma massagem revigorante.",
    priceInCents: 5000,
  },
  {
    name: "Hidratação",
    description: "Hidratação profunda para cabelo e barba.",
    priceInCents: 2500,
  },
];
export const exampleBarbershops: DemoBarbershop[] = examples.map(
  (example, index) => {
    const id = `example-${index + 1}`;
    const shop = createDemoBarbershop(
      {
        ...example,
        imageUrl: "/banner.png",
        phone: "11900000000",
        description:
          "Barbearia fictícia do catálogo de exemplos. Nenhum atendimento real é oferecido nesta demonstração.",
      },
      id,
    );
    return {
      ...shop,
      imageUrl: example.imageUrl,
      published: true,
      services: services.map((service, i) => ({
        ...service,
        id: `${id}:service-${i}`,
        barbershopId: id,
        durationMinutes: 30,
        active: true,
      })),
    };
  },
);
export function publicDemoCatalog(shops: DemoBarbershop[]) {
  return [...exampleBarbershops, ...publishedDemoShops(shops)];
}

// Fixed fictional selections only. New publications receive no ranking/category.
export function homeDemoSections(shops: DemoBarbershop[]) {
  const recommended = [...exampleBarbershops].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
  return {
    recommended,
    popular: [...recommended].reverse(),
    published: publishedDemoShops(shops),
  };
}
export function searchDemoCatalog(shops: DemoBarbershop[], query: string) {
  if (!query.trim()) return [];
  return publicDemoCatalog(shops).filter(
    (shop) =>
      matchesServiceName(shop.name, query) ||
      shop.services.some(
        (service) =>
          service.active &&
          service.barbershopId === shop.id &&
          matchesServiceName(service.name, query),
      ),
  );
}
export function nextPublicDemoAppointment(
  shops: DemoBarbershop[],
  ids: string[],
  now: Date,
) {
  const publicIds = new Set(ids);
  return shops
    .flatMap((shop) =>
      shop.appointments
        .filter(
          (appointment) =>
            publicIds.has(appointment.id) &&
            appointment.barbershopId === shop.id &&
            appointment.status === "CONFIRMED" &&
            new Date(appointment.startsAt).getTime() > now.getTime(),
        )
        .map((appointment) => ({ shop, appointment })),
    )
    .sort((a, b) =>
      a.appointment.startsAt.localeCompare(b.appointment.startsAt),
    )[0];
}
