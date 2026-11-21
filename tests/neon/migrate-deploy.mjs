import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  localMigrationConfiguration,
  migrationDiagnostic,
  migrationFailure,
} from "./migrate-policy.mjs";
import {
  localPrismaEngine,
  requireEngineVersion,
} from "./local-prisma-engine.mjs";

try {
  if (process.argv.length !== 2)
    throw migrationFailure("MIGRATION_COMMAND_REJECTED");
  // Fail before launching Prisma for missing consent, role, credentials or scope.
  localMigrationConfiguration(process.env);
  const engine = localPrismaEngine();
  const env = {};
  for (const key of [
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "PATH",
    "Path",
    "TEMP",
    "TMP",
    "CORTZ_ALLOW_TEST_MIGRATIONS",
    "CORTZ_EXECUTE_TEST_MIGRATIONS",
    "CORTZ_MIGRATION_DATABASE_URL",
    "CORTZ_TEST_NEON_API_KEY",
  ])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    NODE_ENV: "production",
    CORTZ_MIGRATION_LAUNCHER: "prisma-deploy-only",
    CHECKPOINT_DISABLE: "1",
  });
  const version = spawnSync(engine.path, ["--version"], {
    env: Object.fromEntries(
      Object.entries(env).filter(([key]) => !key.startsWith("CORTZ_")),
    ),
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });
  if (version.error || version.status !== 0)
    throw migrationFailure("PRISMA_ENGINE_UNAVAILABLE");
  requireEngineVersion(version.stdout, engine);
  // Internal pin only: parent still rejects all externally supplied PRISMA_*.
  env.PRISMA_SCHEMA_ENGINE_BINARY = engine.path;
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("../../node_modules/prisma/build/index.js", import.meta.url),
      ),
      "migrate",
      "deploy",
      "--config",
      fileURLToPath(new URL("./migrate.config.mjs", import.meta.url)),
    ],
    {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 180000,
      windowsHide: true,
    },
  );
  // Never relay CLI stdout/stderr: native errors can contain URLs or SQL data.
  if (result.error || result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const code = output.match(/\bP\d{4}\b/)?.[0];
    const refusal = output.match(
      /CORTZ_TEST_MIGRATION_REFUSED: code=([A-Z_]+)/,
    )?.[1];
    if (refusal) console.error(migrationDiagnostic({ code: refusal }));
    console.error(
      `CORTZ_TEST_MIGRATION_FAILED${code ? `: prisma_code=${code}` : ""}; inspect read-only before retrying.`,
    );
    process.exitCode = 1;
  } else
    console.log(
      "CORTZ_TEST_MIGRATION_DEPLOY_OK: Prisma Migrate completed; verify history using the read-only inspector.",
    );
} catch (error) {
  console.error(migrationDiagnostic(error));
  process.exitCode = 1;
}
