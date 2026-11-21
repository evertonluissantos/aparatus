import type { ReactNode } from "react";
export const money = (cents: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(cents) / 100,
  );
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(month + "-01T12:00:00Z"));
export function Heading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
        Cortz · Gestão comercial
      </p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h1>
      <p className="text-muted-foreground max-w-2xl text-sm leading-6">
        {description}
      </p>
    </div>
  );
}
export function Status({
  children,
  strong = false,
}: {
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${strong ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground"}`}
    >
      {children}
    </span>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
      {children}
    </div>
  );
}
export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="bg-background overflow-hidden rounded-xl border">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-5 py-4 text-xs font-medium whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">{children}</tbody>
        </table>
      </div>
    </div>
  );
}
export const cell = "px-5 py-4 align-middle";
