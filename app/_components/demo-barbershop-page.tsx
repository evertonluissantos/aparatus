"use client";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { PhoneItem } from "./phone-item";
import { PublicDemoBooking } from "./public-demo-booking";
import { useDemoBarbershop } from "../admin/_components/demo-context";
import { publicDemoCatalog } from "../_lib/demo-catalog";

export function DemoBarbershopPage({ id }: { id: string }) {
  const { shops, persistent } = useDemoBarbershop();
  const shop = (persistent ? shops : publicDemoCatalog(shops)).find((item) => item.id === id);
  if (!shop)
    return (
      <main className="space-y-6 p-5">
        <h1>Barbearia indisponível nesta demonstração</h1>
        <p>O cadastro pode estar em rascunho ou não existir nesta aba.</p>
        <Button asChild>
          <Link href="/">Voltar ao catálogo</Link>
        </Button>
      </main>
    );
  const services = shop.services.filter(
    (service) => service.barbershopId === shop.id && service.active,
  );
  return (
    <div className="flex size-full flex-col items-start overflow-clip">
      {/* Hero Section com Imagem */}
      <div className="relative h-[297px] w-full">
        <div className="absolute top-0 left-0 h-full w-full">
          <Image
            src={shop.imageUrl}
            alt={shop.name}
            fill
            unoptimized={shop.imageUrl.startsWith("data:")}
            sizes="100vw"
            className="object-cover"
          />
        </div>

        {/* Botão Voltar */}
        <div className="absolute top-0 left-0 flex w-full items-baseline gap-[91px] px-5 pt-6 pb-0">
          <Button
            size="icon"
            variant="secondary"
            className="overflow-clip rounded-full"
            asChild
          >
            <Link href="/">
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Container Principal */}
      <div className="bg-background relative z-10 -mt-6 w-full flex-1 rounded-tl-3xl rounded-tr-3xl">
        {/* Informações da Barbearia */}
        <div className="flex w-full items-center gap-1.5 px-5 pt-6 pb-0">
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-start gap-1.5">
              <div className="relative size-[30px] shrink-0 overflow-hidden rounded-full">
                <Image
                  src={shop.imageUrl}
                  alt={shop.name}
                  fill
                  unoptimized={shop.imageUrl.startsWith("data:")}
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
              <p className="text-foreground text-xl font-bold">{shop.name}</p>
            </div>
            <div className="flex flex-col items-start gap-2">
              <div className="flex items-center gap-2">
                <p className="text-muted-foreground text-sm">{shop.address}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="px-0 py-6">
          <Separator />
        </div>

        {/* Sobre Nós */}
        <div className="flex w-full flex-col items-start gap-3 px-5 py-0">
          <div className="flex items-center justify-center gap-2.5">
            <p className="text-foreground text-xs font-bold uppercase">
              SOBRE NÓS
            </p>
          </div>
          <p className="text-foreground w-full text-sm">{shop.description}</p>
        </div>

        {/* Divider */}
        <div className="px-0 py-6">
          <Separator />
        </div>

        {/* Serviços */}
        <div className="flex w-full flex-col items-start gap-3 px-5 py-0">
          <div className="flex items-center justify-center gap-2.5">
            <p className="text-foreground text-xs font-bold uppercase">
              SERVIÇOS
            </p>
          </div>
          <div className="flex w-full flex-col gap-3">
            {services.map((service) => (
              <PublicDemoBooking
                key={service.id}
                shop={shop}
                service={service}
              />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="px-0 py-6">
          <Separator />
        </div>

        {/* Contato */}
        <div className="flex w-full flex-col items-start gap-3 px-5 py-0">
          <div className="flex items-center justify-center gap-2.5">
            <p className="text-foreground text-xs font-bold uppercase">
              CONTATO
            </p>
          </div>
          <div className="flex w-full flex-col gap-3">
            {[shop.phone].map((phone, index) => (
              <PhoneItem key={index} phone={phone} />
            ))}
          </div>
        </div>

        <p className="text-muted-foreground px-5 pt-6 text-xs">
          Demonstração em memória. Nenhuma vaga real é reservada. Recarregar
          descarta os dados.
        </p>
        {/* Footer */}
        <div className="flex w-full flex-col items-center gap-2.5 px-0 pt-[60px] pb-0">
          <div className="bg-secondary flex w-full flex-col items-start justify-center gap-1.5 px-[30px] py-8 text-xs leading-none">
            <p className="text-foreground font-semibold">
              © 2025 Copyright Aparatus
            </p>
            <p className="text-muted-foreground font-normal">
              Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
