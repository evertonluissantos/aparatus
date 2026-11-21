import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Do not inherit credentials, NODE_OPTIONS, dotenv configuration or database URLs.
const environment = {};
for (const key of [
  "SystemRoot",
  "SYSTEMROOT",
  "WINDIR",
  "PATH",
  "Path",
  "TEMP",
  "TMP",
]) {
  if (process.env[key]) environment[key] = process.env[key];
}

const schemaOnly = process.argv[2] === "--schema";
if (process.argv.length > (schemaOnly ? 3 : 2)) {
  throw new Error("Use node tests/run.mjs [--schema]");
}
const command = schemaOnly
  ? ["./node_modules/prisma/build/index.js", "validate", "--config", "./tests/prisma-offline.config.ts"]
  : ["./tests/core.test.mjs"];

for (const timezone of schemaOnly ? ["UTC"] : ["UTC", "America/Sao_Paulo"]) {
  console.log(`\n${schemaOnly ? "Offline Prisma validation" : "Characterization tests"} — TZ=${timezone}`);
  const result = spawnSync(
    process.execPath,
    ["--import", "./tests/guard.mjs", ...command],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: {
        ...environment,
        NODE_ENV: "test",
        CORTZ_TEST_MODE: "mock-only",
        TZ: timezone,
      },
      stdio: "inherit",
      timeout: 30_000,
    },
  );
  if (result.error || result.status !== 0) {
    console.error(result.error?.message ?? "Test process failed");
    process.exit(result.status || 1);
  }
}
