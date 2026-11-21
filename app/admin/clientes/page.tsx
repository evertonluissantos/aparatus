import type { Metadata } from "next";
import { ClientsPanel } from "./_components/clients-panel";

export const metadata: Metadata = {
  title: "Clientes · Cortz Demo",
  robots: { index: false, follow: false },
};
export default function ClientsPage() {
  return <ClientsPanel />;
}
