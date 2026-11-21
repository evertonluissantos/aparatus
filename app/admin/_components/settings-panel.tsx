"use client";
import { useState } from "react";
import { useDemoBarbershop } from "./demo-context";
import { barbershopSchema } from "../_lib/demo-barbershop";
import { Input } from "@/app/_components/ui/input";
import { Button } from "@/app/_components/ui/button";
import { CoverInput } from "./cover-input";
import { PublicationControls } from "./publication-controls";
export function SettingsPanel() {
  const { selectedShop: shop, saveSettings } = useDemoBarbershop();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [cover, setCover] = useState(shop?.imageUrl ?? "/banner.png");
  if (!shop) return null;
  return (
    <section className="max-w-2xl space-y-5">
      <h1 className="text-3xl font-semibold">Configurações da barbearia</h1>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || coverBusy) return;
          const data = Object.fromEntries(new FormData(event.currentTarget));
          const parsed = barbershopSchema.safeParse({
            ...data,
            imageUrl: cover,
          });
          if (!parsed.success) {
            setMessage(parsed.error.issues[0].message);
            return;
          }
          setBusy(true);
          try {
            await saveSettings(parsed.data);
            setMessage("Dados atualizados.");
          } catch {
            setMessage(
              "Não foi possível salvar. Atualize a página antes de tentar novamente.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {(
          [
            ["name", "Nome"],
            ["phone", "Telefone"],
            ["address", "Endereço"],
            ["description", "Descrição"],
          ] as const
        ).map(([name, label]) => (
          <label key={name} className="block">
            {label}
            <Input
              name={name}
              defaultValue={shop[name]}
              required
              maxLength={name === "description" ? 500 : 200}
            />
          </label>
        ))}
        <CoverInput
          label="Foto de capa"
          inputId="settings-cover"
          value={cover}
          onChange={setCover}
          onBusyChange={setCoverBusy}
        />
        <Button disabled={busy || coverBusy}>Salvar dados</Button>
      </form>
      <p role="status">{message}</p>
      <PublicationControls shopId={shop.id} />
    </section>
  );
}
