import type { Metadata } from "next";
import { AdminShell } from "./_components/admin-shell";
import { ManagementGate } from "./_components/management-gate";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cortz · Gestão demonstrativa",
  robots: { index: false, follow: false },
};
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ManagementGate area="owner">
      <AdminShell>{children}</AdminShell>
    </ManagementGate>
  );
}
