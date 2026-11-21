"use client";
import { useState } from "react";
import { Input } from "../_components/ui/input";
import { Heading, Status, Empty, DataTable, cell } from "./ui";
export function OwnersPanel({
  owners,
}: {
  owners: {
    id: string;
    name: string;
    email: string;
    shopName: string | null;
    membershipActive: boolean | null;
  }[];
}) {
  const [search, setSearch] = useState("");
  const rows = owners.filter((o) =>
    `${o.name} ${o.email}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.trim().toLocaleLowerCase("pt-BR")),
  );
  return (
    <div className="space-y-6">
      <Heading
        title="Proprietários"
        description="Consulte responsáveis e vínculos. Contas sem OWNER são exibidas como sem vínculo, sem inferir propriedade."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          aria-label="Pesquisar proprietário por nome ou e-mail"
          placeholder="Pesquisar por nome ou e-mail"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <p className="text-muted-foreground text-xs">
          {rows.length} resultado(s)
        </p>
      </div>
      {!rows.length ? (
        <Empty>
          {owners.length
            ? "Nenhuma conta corresponde à pesquisa."
            : "Nenhum proprietário ou conta sem vínculo encontrado."}
        </Empty>
      ) : (
        <DataTable headers={["Proprietário / conta", "Barbearia", "Vínculo"]}>
          {rows.map((o) => (
            <tr key={o.id} className="hover:bg-muted/20">
              <td className={cell}>
                <p className="font-medium">{o.name}</p>
                <p className="text-muted-foreground mt-1 text-xs">{o.email}</p>
              </td>
              <td className={cell}>
                {o.shopName ?? "Sem barbearia vinculada"}
              </td>
              <td className={cell}>
                <Status strong={o.membershipActive === true}>
                  {o.membershipActive === null
                    ? "Sem vínculo"
                    : o.membershipActive
                      ? "Ativo"
                      : "Inativo"}
                </Status>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
