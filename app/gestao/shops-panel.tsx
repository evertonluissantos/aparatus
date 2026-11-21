"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../_components/ui/button";
import { mvpRequest } from "../admin/_components/persistent-context";
import { Input } from "../_components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../_components/ui/alert-dialog";
import { Heading, Status, DataTable, Empty, cell, monthLabel } from "./ui";

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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<(typeof shops)[number] | null>(null);
  const rows = shops.filter(
    (s) =>
      `${s.name} ${s.ownerName ?? ""} ${s.ownerEmail ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.trim().toLocaleLowerCase("pt-BR")) &&
      (filter === "all" ||
        (filter === "active" && !s.suspended) ||
        (filter === "suspended" && s.suspended) ||
        (filter === "published" && s.published) ||
        (filter === "private" && !s.published)),
  );
  async function change(shop: (typeof shops)[number]) {
    if (busy) return;
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
    <section className="space-y-6">
      <Heading
        title={controls ? "Ativações e suspensões" : "Barbearias"}
        description={
          controls
            ? "Controle administrativo manual. Históricos são preservados; pagamentos Pix não reativam estabelecimentos."
            : "Acompanhe proprietários, publicação, situação administrativa e última competência confirmada."
        }
      />
      <div className="flex flex-wrap gap-3">
        <Input
          aria-label="Pesquisar barbearia ou proprietário"
          placeholder="Pesquisar barbearia ou proprietário"
          className="max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filtrar situação"
          className="bg-background rounded-md border px-3 py-2 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Todas as situações</option>
          <option value="active">Ativas</option>
          <option value="suspended">Suspensas</option>
          <option value="published">Publicadas</option>
          <option value="private">Não publicadas</option>
        </select>
      </div>
      {message && (
        <p role="status" className="bg-muted rounded-lg border p-4 text-sm">
          {message}
        </p>
      )}
      {!rows.length ? (
        <Empty>
          {shops.length
            ? "Nenhum estabelecimento corresponde aos filtros."
            : "Nenhuma barbearia cadastrada."}
        </Empty>
      ) : (
        <DataTable
          headers={[
            "Barbearia",
            "Proprietário",
            "Publicação",
            "Situação",
            "Último Pix",
            ...(controls ? ["Ação"] : []),
          ]}
        >
          {rows.map((s) => (
            <tr
              key={`${s.id}-${s.ownerEmail ?? "none"}`}
              className="hover:bg-muted/20"
            >
              <td className={`${cell} font-medium`}>{s.name}</td>
              <td className={cell}>
                <p>{s.ownerName ?? "Sem proprietário"}</p>
                <p className="text-muted-foreground text-xs">{s.ownerEmail}</p>
              </td>
              <td className={cell}>
                <Status>{s.published ? "Publicada" : "Não publicada"}</Status>
              </td>
              <td className={cell}>
                <Status strong={!s.suspended}>
                  {s.suspended ? "Suspensa" : "Ativa"}
                </Status>
              </td>
              <td className={cell}>
                {s.lastCompetence
                  ? monthLabel(s.lastCompetence)
                  : "Sem confirmação"}
              </td>
              {controls && (
                <td className={cell}>
                  <Button
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => setSelected(s)}
                  >
                    {busy === s.id
                      ? "Salvando..."
                      : s.suspended
                        ? "Reativar"
                        : "Suspender"}
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </DataTable>
      )}
      <AlertDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selected?.suspended ? "Reativar" : "Suspender"} {selected?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.suspended
                ? "O acesso será restaurado, respeitando publicação e vínculos existentes."
                : "O acesso operacional e novos agendamentos serão bloqueados. Clientes, serviços, reservas e pagamentos serão preservados."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selected) void change(selected);
              }}
            >
              Confirmar {selected?.suspended ? "reativação" : "suspensão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
