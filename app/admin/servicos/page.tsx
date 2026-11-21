import type { Metadata } from "next";
import { ServicesPanel } from "./_components/services-panel";

export const metadata: Metadata = {
  title: "Serviços · Cortz Demo",
  description: "Demonstração local da gestão de serviços do Cortz.",
  robots: { index: false, follow: false },
};

export default function ServicesPage() {
  return <ServicesPanel />;
}
