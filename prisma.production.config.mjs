// Production deploy only. Never loads dotenv or the application's DATABASE_URL.
import { defineConfig } from "prisma/config";

if (
  process.env.CORTZ_PRODUCTION_MIGRATION_CONSENT !==
    "sparkling-union-52245638/br-floral-shape-ac0l1t95/neondb" ||
  process.argv.slice(2).join(" ") !==
    "migrate deploy --config prisma.production.config.mjs"
) throw new Error("PRODUCTION_MIGRATION_COMMAND_REJECTED");

const url = new URL(process.env.CORTZ_PRODUCTION_MIGRATION_URL ?? "");
if (
  url.protocol !== "postgresql:" ||
  url.hostname !== "ep-cool-unit-acuy1e8y.sa-east-1.aws.neon.tech" ||
  url.pathname !== "/neondb" ||
  decodeURIComponent(url.username) !== "neondb_owner" ||
  !url.password || url.hash ||
  url.searchParams.get("sslmode") !== "verify-full"
) throw new Error("PRODUCTION_MIGRATION_TARGET_REJECTED");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: url.href },
});
