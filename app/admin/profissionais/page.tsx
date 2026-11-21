import type { Metadata } from "next";
import { ProfessionalsPanel } from "./_components/professionals-panel";

export const metadata: Metadata = {
  title: "Profissionais · Cortz Demo",
  robots: { index: false, follow: false },
};
export default function ProfessionalsPage() {
  return <ProfessionalsPanel />;
}
