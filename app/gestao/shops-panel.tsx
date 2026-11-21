"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../_components/ui/button";
import { mvpRequest } from "../admin/_components/persistent-context";

export function ShopsPanel({
  shops,
  controls = false,
}: {
  shops: {
    id: string;
    name: string;
    published: boolean;
    suspended: boolean;
    ownerName: string | null;
    ownerEmail: string | null;
    lastCompetence: string | null;
  }[];
  controls?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function change(shop: (typeof shops)[number]) {
    if (
      busy ||
      !window.confirm(
        `${shop.suspended ? "Reativar" : "Suspender"} ${shop.name}? ${shop.suspended ? "As regras de publicação e vínculo continuam valendo." : "O acesso operacional e novos agendamentos serão bloqueados."}`,
      )
    )
      return;
    setBusy(shop.id);
    setMessage("");
    try {
      await mvpRequest(
        "/api/global/barbershops",
        { barbershopId: shop.id, suspended: !shop.suspended },
        "PATCH",
      );
      setMessage("Alteração registrada. Atualizando a situação...");
      router.refresh();
    } catch {
      setMessage(
        "Não foi possível alterar a situação. Atualize a página e confira sua permissão.",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">
        {controls ? "Ativações e suspensões" : "Barbearias cadastradas"}
      </h1>
      {controls && (
        <p>
          Suspensão manual preserva os históricos. Confirmar Pix não reativa a
          barbearia.
        </p>
      )}
      <p role="status">{message}</p>
      {!shops.length && <p>Nenhuma barbearia cadastrada.</p>}
      <ul className="space-y-3">
        {shops.map((shop) => (
          <li
            key={`${shop.id}-${shop.ownerEmail ?? "legacy"}`}
            className="space-y-2 rounded-xl border p-5"
          >
            <h2 className="font-semibold">{shop.name}</h2>
            <p>
              Proprietário:{" "}
              {shop.ownerName
                ? `${shop.ownerName} · ${shop.ownerEmail}`
                : "Sem proprietário vinculado"}
            </p>
            <p>
              {shop.published ? "Publicada" : "Não publicada"} ·{" "}
              {shop.suspended ? "Suspensa" : "Ativa"}
            </p>
            <p>
              Última competência Pix:{" "}
              {shop.lastCompetence ?? "Nenhuma confirmação"}
            </p>
            {controls && (
              <Button
                variant={shop.suspended ? "default" : "outline"}
                disabled={busy !== null}
                onClick={() => void change(shop)}
              >
                {busy === shop.id
                  ? "Salvando..."
                  : shop.suspended
                    ? "Reativar"
                    : "Suspender"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
