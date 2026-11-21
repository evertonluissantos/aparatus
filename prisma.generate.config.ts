import { defineConfig } from "prisma/config";

// Client generation needs the schema, never a database connection or migrations.
export default defineConfig({
  schema: "prisma/schema.prisma",
});
