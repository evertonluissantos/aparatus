import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  realpathSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

if (
  process.env.CORTZ_TEST_MODE !== "provision-local" ||
  process.env.NODE_ENV !== "test"
)
  throw new Error("Use test:postgres launcher");
const bin = realpathSync(process.env.CORTZ_POSTGRES_BIN);
if (bin.startsWith("\\\\") || bin.startsWith("//"))
  throw new Error("Remote binary paths are not allowed");
const exe = (name) =>
  join(bin, process.platform === "win32" ? `${name}.exe` : name);
for (const name of ["initdb", "pg_ctl", "postgres"])
  if (!existsSync(exe(name)))
    throw new Error("Local PostgreSQL binaries unavailable; nothing started");
const server = createServer();
await new Promise((ok, fail) => {
  server.once("error", fail);
  server.listen(0, "127.0.0.1", ok);
});
const port = server.address().port;
await new Promise((ok) => server.close(ok));
const parent = realpathSync(tmpdir());
const root = mkdtempSync(join(parent, "cortz_pg_"));
const data = join(root, "data");
const nonce = randomUUID();
const database = `cortz_test_${randomUUID().replaceAll("-", "")}`;
writeFileSync(
  join(root, "owner.json"),
  JSON.stringify({ nonce, data, port, database }),
);
const env = { ...process.env };
delete env.CORTZ_POSTGRES_BIN;
function run(name, args) {
  const result = spawnSync(exe(name), args, {
    env,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(`${name} failed; inspect local files at ${root}`);
}
let started = false;
let childStatus = 1;
try {
  run("initdb", [
    "-D",
    data,
    "-U",
    "cortz_test_admin",
    "--auth-local=trust",
    "--auth-host=trust",
    "--encoding=UTF8",
    "--no-locale",
  ]);
  // Configure only the just-created cluster, avoiding shell-quoted -o options.
  writeFileSync(join(data, "postgresql.auto.conf"), `listen_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = ''\n`);
  run("pg_ctl", [
    "-D",
    data,
    "-l",
    join(root, "postgres.log"),
    "-w",
    "start",
  ]);
  started = true;
  const pid = readFileSync(join(data, "postmaster.pid"), "utf8").split(/\r?\n/);
  if (resolve(pid[1]) !== resolve(data) || Number(pid[3]) !== port)
    throw new Error("Cluster identity mismatch; no connection authorized");
  const admin = new Client({
    host: "127.0.0.1",
    port,
    user: "cortz_test_admin",
    database: "postgres",
    password: "",
    ssl: false,
    options: "",
    connectionTimeoutMillis: 3000,
    query_timeout: 5000,
  });
  try {
    await admin.connect();
    const directory = (await admin.query("SHOW data_directory")).rows[0]
      .data_directory;
    if (realpathSync(directory) !== realpathSync(data))
      throw new Error("Unexpected cluster");
    await admin.query(
      "CREATE ROLE cortz_test_runner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE",
    );
    // Identifier is generated solely from UUID hex, not user input.
    await admin.query(`CREATE DATABASE "${database}" OWNER cortz_test_runner`);
  } finally {
    await admin.end();
  }
  const result = spawnSync(
    process.execPath,
    ["--import", "./tests/postgres/guard.mjs", "./tests/postgres/suite.mjs"],
    {
      env: {
        ...env,
        CORTZ_TEST_MODE: "postgres-local",
        CORTZ_TEST_ROOT: root,
        CORTZ_TEST_NONCE: nonce,
      },
      stdio: "inherit",
      windowsHide: true,
      timeout: 90_000,
    },
  );
  childStatus = result.error ? 1 : (result.status ?? 1);
} finally {
  // Never remove a preexisting path or a running/unverified cluster.
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  const marker = JSON.parse(readFileSync(join(root, "owner.json"), "utf8"));
  const actual = realpathSync(root);
  if (
    marker.nonce !== nonce ||
    actual !== root ||
    !actual.startsWith(parent + sep + "cortz_pg_") ||
    existsSync(join(data, "postmaster.pid"))
  ) {
    throw new Error("Cleanup identity check failed; files retained");
  }
  rmSync(actual, { recursive: true });
}
process.exitCode = childStatus;
