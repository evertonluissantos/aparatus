import { readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
import child from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

if (
  process.env.NODE_ENV !== "test" ||
  process.env.CORTZ_TEST_MODE !== "postgres-local"
)
  throw new Error("Not a provisioned integration process");
const root = realpathSync(process.env.CORTZ_TEST_ROOT);
if (!root.startsWith(realpathSync(tmpdir()) + sep + "cortz_pg_"))
  throw new Error("Not a temporary test cluster");
const marker = JSON.parse(readFileSync(join(root, "owner.json"), "utf8"));
if (
  marker.nonce !== process.env.CORTZ_TEST_NONCE ||
  !/^cortz_test_[a-f0-9]{32}$/.test(marker.database) ||
  !Number.isInteger(marker.port) ||
  marker.port < 1024 ||
  marker.port > 65535 ||
  realpathSync(marker.data) !== realpathSync(join(root, "data"))
)
  throw new Error("Invalid provisioning marker");
const forbidden = Object.keys(process.env).filter((key) =>
  /DATABASE_URL|^PG|STRIPE|GOOGLE|BETTER_AUTH|NODE_OPTIONS|DOTENV/i.test(key),
);
if (forbidden.length)
  throw new Error("Unexpected external environment configuration");
const blocked = () => {
  throw new Error("External I/O blocked in PostgreSQL tests");
};
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const host = typeof args[0] === "object" ? args[0]?.host : args[1];
  const port = typeof args[0] === "object" ? args[0]?.port : args[0];
  if (host !== "127.0.0.1" || Number(port) !== marker.port) return blocked();
  return originalConnect.apply(this, args);
};
globalThis.fetch = blocked;
globalThis.WebSocket = blocked;
net.Server.prototype.listen = blocked;
for (const [module, methods] of [
  [http, ["request", "get"]],
  [https, ["request", "get"]],
  [tls, ["connect"]],
  [dns, ["lookup", "resolve"]],
  [dns.promises, ["lookup", "resolve"]],
  [dgram, ["createSocket"]],
  [
    child,
    [
      "spawn",
      "spawnSync",
      "exec",
      "execSync",
      "execFile",
      "execFileSync",
      "fork",
    ],
  ],
]) {
  for (const method of methods) module[method] = blocked;
}
syncBuiltinESMExports();
export const configuration = Object.freeze({
  host: "127.0.0.1",
  port: marker.port,
  database: marker.database,
  user: "cortz_test_runner",
  password: "",
  ssl: false,
  options: "",
  connectionTimeoutMillis: 3000,
});
export const dataDirectory = marker.data;
