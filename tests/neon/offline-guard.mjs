import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import dgram from "node:dgram";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

function blocked() { throw new Error("External I/O blocked: NEON_OFFLINE_IO_BLOCKED"); }
globalThis.fetch = blocked;
globalThis.WebSocket = blocked;
net.Socket.prototype.connect = blocked;
net.Server.prototype.listen = blocked;
for (const [module, methods] of [
  [net, ["connect", "createConnection"]], [tls, ["connect"]],
  [http, ["request", "get"]], [https, ["request", "get"]],
  [dns, ["lookup", "resolve", "resolve4", "resolve6", "reverse"]],
  [dns.promises, ["lookup", "resolve", "resolve4", "resolve6", "reverse"]],
  [dgram, ["createSocket"]],
  [childProcess, ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]],
]) for (const method of methods) module[method] = blocked;
syncBuiltinESMExports();
