"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Header from "./header";
import Footer from "./footer";
import SearchInput from "./search-input";
import QuickSearchButtons from "./quick-search-buttons";
import BarbershopItem from "./barbershop-item";
import {
  PageContainer,
  PageSection,
  PageSectionScroller,
  PageSectionTitle,
} from "./ui/page-layout";
import banner from "../../public/banner.png";
import { useDemoBarbershop } from "../admin/_components/demo-context";
import {
  homeDemoSections,
  nextPublicDemoAppointment,
  searchDemoCatalog,
} from "../_lib/demo-catalog";
import { DemoConfirmedBooking } from "./demo-confirmed-booking";

// Keep the original public header, including logo, theme control and menu.
export function DemoCatalogHeader() {
  return <Header />;
}

export function DemoCatalog() {
  const { shops, publicBookingShops, publicAppointmentIds, persistent } =
    useDemoBarbershop();
  const { recommended, popular, published } = homeDemoSections(shops);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const upcoming = nextPublicDemoAppointment(
    publicBookingShops,
    publicAppointmentIds,
    new Date(clock),
  );
  return (
    <main>
      <Header />
      <PageContainer>
        <SearchInput searchPath="/demo/barbearias" />
        <QuickSearchButtons searchPath="/demo/barbearias" />
        <Image
          src={banner}
          alt="Agende agora!"
          sizes="100vw"
          className="h-auto w-full"
        />
        {upcoming && (
          <PageSection>
            <PageSectionTitle>Agendamento confirmado</PageSectionTitle>
            <DemoConfirmedBooking {...upcoming} />
            <p className="text-muted-foreground text-xs">
              {persistent
                ? "Pagamento do serviço diretamente à barbearia."
                : "Simulação temporária nesta aba. Não é uma reserva real."}
            </p>
          </PageSection>
        )}
        <PageSection>
          <PageSectionTitle>Recomendados</PageSectionTitle>
          <PageSectionScroller>
            {recommended.map((shop) => (
              <BarbershopItem
                key={shop.id}
                barbershop={shop}
                href={
                  persistent && shop.publicSlug
                    ? `/b/${shop.publicSlug}`
                    : `/demo/barbearias/${shop.id}`
                }
              />
            ))}
          </PageSectionScroller>
        </PageSection>
        <PageSection>
          <PageSectionTitle>Populares</PageSectionTitle>
          <PageSectionScroller>
            {popular.map((shop) => (
              <BarbershopItem
                key={shop.id}
                barbershop={shop}
                href={
                  persistent && shop.publicSlug
                    ? `/b/${shop.publicSlug}`
                    : `/demo/barbearias/${shop.id}`
                }
              />
            ))}
          </PageSectionScroller>
        </PageSection>
        {published.length > 0 && (
          <PageSection>
            <PageSectionTitle>
              {persistent
                ? "Barbearias"
                : "Barbearias publicadas na demonstração"}
            </PageSectionTitle>
            <PageSectionScroller>
              {published.map((shop) => (
                <BarbershopItem
                  key={shop.id}
                  barbershop={shop}
                  href={
                    persistent && shop.publicSlug
                      ? `/b/${shop.publicSlug}`
                      : `/demo/barbearias/${shop.id}`
                  }
                />
              ))}
            </PageSectionScroller>
          </PageSection>
        )}
        <p className="text-muted-foreground text-xs">
          {persistent
            ? "Recomendados e Populares exibem exemplos fictícios, sem métricas reais. As barbearias cadastradas estão na seção Barbearias e não recebem essas classificações automaticamente."
            : "Catálogo demonstrativo. Recomendados e Populares são seleções fixas de exemplos fictícios, sem métricas reais. Novas publicações não recebem essas classificações. Cadastros e agendamentos desta aba se perdem ao recarregar."}
        </p>
      </PageContainer>
      <Footer />
    </main>
  );
}

export function DemoCatalogSearch({ search }: { search: string }) {
  const { shops, persistent } = useDemoBarbershop();
  const results = searchDemoCatalog(shops, search).filter(
    (shop) => !persistent || shops.some((s) => s.id === shop.id),
  );
  return (
    <main>
      <Header />
      <PageContainer>
        <SearchInput searchPath="/demo/barbearias" />
        <QuickSearchButtons searchPath="/demo/barbearias" />
        {search && (
          <div className="mt-6">
            <h2 className="text-muted-foreground mb-4 text-sm font-semibold uppercase">
              Resultados para &quot;{search}&quot;
            </h2>
            {results.length ? (
              <PageSectionScroller>
                {results.map((shop) => (
                  <BarbershopItem
                    key={shop.id}
                    barbershop={shop}
                    href={
                      persistent && shop.publicSlug
                        ? `/b/${shop.publicSlug}`
                        : `/demo/barbearias/${shop.id}`
                    }
                  />
                ))}
              </PageSectionScroller>
            ) : (
              <p className="text-muted-foreground text-center">
                Nenhuma barbearia encontrada.
              </p>
            )}
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          {persistent
            ? "Busca por nome ou serviço nas barbearias publicadas."
            : "Busca demonstrativa por nome ou serviço, sem consulta ao banco."}
        </p>
      </PageContainer>
      <Footer />
    </main>
  );
}
