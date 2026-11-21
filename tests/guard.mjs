import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import dgram from "node:dgram";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

export function assertSafeEnvironment(env) {
  if (env.NODE_ENV !== "test" || env.CORTZ_TEST_MODE !== "mock-only") {
    throw new Error("Tests require the isolated mock-only runner: pnpm test");
  }
  const allowed = new Set([
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "PATH",
    "Path",
    "TEMP",
    "TMP",
    "NODE_ENV",
    "CORTZ_TEST_MODE",
    "TZ",
    // Windows may inject these even when spawn receives a sanitized env.
    "HOMEDRIVE",
    "HOMEPATH",
    "LOGONSERVER",
    "SYSTEMDRIVE",
    "USERDOMAIN",
    "USERNAME",
    "USERPROFILE",
  ]);
  const unexpected = Object.keys(env).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    throw new Error(
      `Unexpected environment configuration (${unexpected.join(", ")}); run pnpm test`,
    );
  }
}

assertSafeEnvironment(process.env);

const blocked = () => {
  throw new Error("External I/O blocked in mock-only tests");
};
globalThis.fetch = blocked;
globalThis.WebSocket = blocked;
net.Socket.prototype.connect = blocked;
net.Server.prototype.listen = blocked;
for (const [module, methods] of [
  [net, ["connect", "createConnection"]],
  [tls, ["connect"]],
  [http, ["request", "get"]],
  [https, ["request", "get"]],
  [dns, ["lookup", "resolve", "resolve4", "resolve6", "reverse"]],
  [dns.promises, ["lookup", "resolve", "resolve4", "resolve6", "reverse"]],
  [dgram, ["createSocket"]],
  [
    childProcess,
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
