import { defineConfig } from "prisma/config";

// Static validation only: no datasource URL, dotenv, migrations or seed.
// Run through the sanitized, network-blocked runner, never prisma.config.ts.
export default defineConfig({
  schema: "../prisma/schema.prisma",
});
