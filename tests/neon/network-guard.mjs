import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import dgram from "node:dgram";
import child from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

export function restrictNeonNetwork(hostname) {
  const blocked = () => { throw new Error("External I/O blocked in isolated Neon tests"); };
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const host = typeof args[0] === "object" ? args[0]?.host : args[1];
    const port = typeof args[0] === "object" ? args[0]?.port : args[0];
    if (host !== hostname || Number(port) !== 5432) return blocked();
    return connect.apply(this, args);
  };
  const tlsConnect = tls.connect;
  tls.connect = function (options, ...args) {
    if (typeof options !== "object" || options.servername !== hostname || options.rejectUnauthorized === false || options.host && options.host !== hostname) return blocked();
    return tlsConnect.call(this, options, ...args);
  };
  for (const builtin of [dns, dns.promises]) {
    const lookup = builtin.lookup;
    builtin.lookup = function (host, ...args) { if (host !== hostname) return blocked(); return lookup.call(this,host,...args); };
    for (const method of ["resolve","resolve4","resolve6","reverse"]) builtin[method] = blocked;
  }
  globalThis.fetch = blocked; globalThis.WebSocket = blocked;
  net.Server.prototype.listen = blocked;
  for (const [module, methods] of [[http,["request","get"]],[https,["request","get"]],[dgram,["createSocket"]],[child,["spawn","spawnSync","exec","execSync","execFile","execFileSync","fork"]]]) {
    for (const method of methods) module[method] = blocked;
  }
  syncBuiltinESMExports();
}
