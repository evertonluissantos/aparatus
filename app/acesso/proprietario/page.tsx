import type { Metadata } from "next";
import { OwnerAuthForm } from "./owner-auth-form";
import { OWNER_AUTH_ENABLED } from "@/lib/owner-auth-policy";

export const metadata: Metadata = {
  title: "Acesso do proprietário · Cortz",
  robots: { index: false, follow: false },
};

export default async function OwnerAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string | string[] }>;
}) {
  const { erro } = await searchParams;
  return (
    <OwnerAuthForm
      googleFailed={erro === "google"}
      enabled={OWNER_AUTH_ENABLED}
      googleEnabled={Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
      )}
    />
  );
}
