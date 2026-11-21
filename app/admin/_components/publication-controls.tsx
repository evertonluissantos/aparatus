"use client";

import Link from "next/link";
import { useState } from "react";
import { barbershopPublicSlug } from "../_lib/owner-demo";
import { Button } from "@/app/_components/ui/button";
import { useDemoBarbershop } from "./demo-context";

export function PublicationControls({ shopId }: { shopId: string }) {
  const { shops, publishShop, persistent } = useDemoBarbershop();
  const [copyMessage, setCopyMessage] = useState("");
  const shop = shops.find((item) => item.id === shopId);
  if (!shop) return null;
  const publicPath = `/b/${barbershopPublicSlug(shop)}`;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        new URL(publicPath, window.location.origin).href,
      );
      setCopyMessage(
        persistent
          ? "Link público copiado."
          : "Link copiado. Funciona somente no contexto desta aba; não compartilha dados ou reservas entre dispositivos.",
      );
    } catch {
      setCopyMessage(
        "Não foi possível copiar automaticamente. Selecione o endereço exibido e copie manualmente.",
      );
    }
  }
  return (
    <section
      className="border-border bg-card my-6 space-y-3 rounded-xl border p-5"
      aria-label="Publicação demonstrativa"
    >
      <h2 className="font-semibold">
        Catálogo público ·{" "}
        {shop.published
          ? persistent
            ? "Publicado"
            : "Publicado na demonstração"
          : "Rascunho"}
      </h2>
      <p className="text-muted-foreground text-sm">
        {persistent
          ? "Publique após configurar os serviços, profissionais e horários. O endereço público permite agendar diretamente com sua barbearia."
          : "Publicar torna este exemplo visível no catálogo desta aba. Não publica na internet, não cria assinatura e não libera reservas reais. Recarregar descarta os dados."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          variant={shop.published ? "outline" : "default"}
          onClick={async () => {
            try {
              await publishShop(shop.id, !shop.published);
            } catch {
              setCopyMessage(
                "Não foi possível publicar. Confira serviços, profissionais e horários.",
              );
            }
          }}
        >
          {shop.published
            ? persistent
              ? "Retirar do catálogo"
              : "Retirar da demonstração pública"
            : persistent
              ? "Publicar barbearia"
              : "Publicar demonstração"}
        </Button>
        {shop.published && (
          <Button asChild variant="outline">
            <Link prefetch={false} href={publicPath}>
              {persistent ? "Ver página pública" : "Ver página pública demo"}
            </Link>
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!shop.published}
          onClick={copyLink}
        >
          Copiar link de agendamento
        </Button>
        <Button asChild variant="ghost">
          <Link prefetch={false} href="/">
            Ver catálogo
          </Link>
        </Button>
      </div>
      <p className="text-muted-foreground text-xs break-all">
        {persistent
          ? `Endereço público: ${publicPath}`
          : `Endereço demonstrativo: ${publicPath}. Somente nesta aba, após publicar; abrir em outro dispositivo não recupera o cadastro.`}
      </p>
      {copyMessage && (
        <p role="status" className="text-muted-foreground text-xs">
          {copyMessage}
        </p>
      )}
      <p role="status" className="text-muted-foreground text-xs">
        {shop.published
          ? persistent
            ? "Visível no catálogo público."
            : "Visível no catálogo demonstrativo desta aba."
          : "Ainda não aparece no catálogo."}
      </p>
    </section>
  );
}
