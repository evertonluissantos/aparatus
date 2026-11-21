// No dotenv, runtime Prisma config, seed, fixtures, shadow DB or generated client.
import { defineConfig } from "prisma/config";
import {
  localMigrationConfiguration,
  verifyMigrationDestination,
  migrationPaths,
  migrationFailure,
  migrationDiagnostic,
} from "./migrate-policy.mjs";
import { requirePinnedEngine } from "./local-prisma-engine.mjs";

let url;
try {
  const args = process.argv.slice(2);
  if (
    process.env.CORTZ_MIGRATION_LAUNCHER !== "prisma-deploy-only" ||
    args.length !== 4 ||
    args[0] !== "migrate" ||
    args[1] !== "deploy" ||
    args[2] !== "--config"
  )
    throw migrationFailure("MIGRATION_COMMAND_REJECTED");
  requirePinnedEngine(process.env.PRISMA_SCHEMA_ENGINE_BINARY);
  const environment = { ...process.env };
  // The sole internal override is accepted only after exact local-path checking.
  // All other implicit/Prisma variables continue through the original rejection.
  delete environment.PRISMA_SCHEMA_ENGINE_BINARY;
  const target = localMigrationConfiguration(environment);
  // No datasource reaches Prisma Migrate until API and SQL checks have passed.
  url = await verifyMigrationDestination(target);
} catch (error) {
  console.error(migrationDiagnostic(error));
  throw migrationFailure("MIGRATION_FAILED");
}
export default defineConfig({
  schema: migrationPaths.schema,
  migrations: { path: migrationPaths.migrations },
  datasource: { url },
});
