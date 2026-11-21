import Link from "next/link";
import type { Metadata } from "next";
import { globalSections } from "./sections";
import { ManagementGate } from "../admin/_components/management-gate";
import { OWNER_AUTH_ENABLED } from "@/lib/owner-auth-policy";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Studio Notreve · Gestão Cortz · Prévia",
  robots: { index: false, follow: false },
};

export default function GlobalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ManagementGate area="global">
      <div className="bg-muted/30 min-h-screen">
        <header className="border-border bg-background border-b px-5 py-5 sm:px-8">
          <Link href="/gestao" className="text-xl font-semibold">
            Studio Notreve · Gestão Cortz
          </Link>
        </header>
        <div className="mx-auto max-w-[1500px] lg:flex">
          <nav
            aria-label="Estrutura de gestão global"
            className="border-border bg-background flex gap-2 overflow-x-auto border-b p-5 lg:w-64 lg:shrink-0 lg:flex-col lg:border-r"
          >
            <Link
              href="/gestao"
              className="hover:bg-secondary shrink-0 rounded-lg px-3 py-2 text-sm"
            >
              Visão geral
            </Link>
            {Object.entries(globalSections).map(([path, item]) => (
              <Link
                key={path}
                href={`/gestao/${path}`}
                className="hover:bg-secondary shrink-0 rounded-lg px-3 py-2 text-sm"
              >
                {item.title}
              </Link>
            ))}
          </nav>
          <main className="min-w-0 flex-1 p-5 sm:p-8">
            {!OWNER_AUTH_ENABLED && (
              <p className="mb-7 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                Prévia estrutural pública, sem autenticação ou autorização
                global. Não contém dados administrativos reais nem operações de
                assinatura. Antes da produção, o servidor deverá exigir
                identidade e permissão de administrador global em cada operação.
              </p>
            )}
            {children}
          </main>
        </div>
      </div>
    </ManagementGate>
  );
}
