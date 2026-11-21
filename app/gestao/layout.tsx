import type { Metadata } from "next";
import { GlobalNavigation } from "./navigation";
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
      <div className="bg-muted/20 min-h-screen lg:flex">
        <GlobalNavigation />
        <main className="min-w-0 flex-1">
          <header className="bg-background/80 flex items-center justify-between border-b px-5 py-4 sm:px-8">
            <span className="text-muted-foreground text-xs">
              Studio Notreve / Administração
            </span>
            <span className="rounded-full border px-3 py-1 text-xs">
              Gestão global
            </span>
          </header>
          <div className="mx-auto max-w-[1440px] p-5 sm:p-8 lg:p-10">
            {!OWNER_AUTH_ENABLED && (
              <p className="mb-6 rounded-xl border p-4 text-sm">
                Gestão não ativada. Nenhuma operação real está disponível.
              </p>
            )}
            {children}
          </div>
        </main>
      </div>
    </ManagementGate>
  );
}
