import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { requireDisposableOptIn } from "./safety.mjs";

// Deliberately NOT part of pnpm test; never accepts a database URL.
const bin = requireDisposableOptIn(process.env);
const env = {};
for (const key of [
  "SystemRoot",
  "SYSTEMROOT",
  "WINDIR",
  "PATH",
  "Path",
  "TEMP",
  "TMP",
])
  if (process.env[key]) env[key] = process.env[key];
const result = spawnSync(process.execPath, ["tests/postgres/provision.mjs"], {
  cwd: fileURLToPath(new URL("../../", import.meta.url)),
  stdio: "inherit",
  env: {
    ...env,
    NODE_ENV: "test",
    CORTZ_TEST_MODE: "provision-local",
    CORTZ_POSTGRES_BIN: bin,
  },
  timeout: 300_000,
});
if (result.error || result.status !== 0) process.exit(result.status || 1);
