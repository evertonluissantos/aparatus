import { inspectionFailure as failure } from "./inspection-diagnostics.mjs";

// Parse secrets only in memory. Never pass connectionString to pg: its parser
// could replace the explicit certificate/hostname verification options.
export function normalizeInspectionConnection(value, identity) {
  let url;
  try { url = new URL(value); } catch { throw failure("URL_REJECTED"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== identity.hostname || url.port && url.port !== "5432" || url.hash) throw failure("URL_REJECTED");
  const params = [...url.searchParams];
  if (params.some(([key]) => !["sslmode", "channel_binding"].includes(key)) || url.searchParams.getAll("sslmode").length !== 1 || url.searchParams.getAll("channel_binding").length > 1) throw failure("URL_REJECTED");
  if (!["require", "verify-full"].includes(url.searchParams.get("sslmode"))) throw failure("URL_REJECTED");
  const binding = url.searchParams.get("channel_binding");
  if (binding !== null && binding !== "require") throw failure("URL_REJECTED");
  let user, password, database;
  try { user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); database = decodeURIComponent(url.pathname.slice(1)); }
  catch { throw failure("ROLE_OR_DATABASE_URL_REJECTED"); }
  if (user !== identity.role || database !== identity.database || !password || /[\x00-\x1f\x7f]/.test(password)) throw failure("ROLE_OR_DATABASE_URL_REJECTED");
  return {
    host: identity.hostname, port: 5432, database, user, password,
    ssl: { rejectUnauthorized: true, servername: identity.hostname },
    enableChannelBinding: binding === "require",
  };
}

// pg 8.16.3 only prefers channel binding. Enforce require before sending a
// password or SCRAM response, and before reporting the connection ready.
// Uses pg internal auth hooks: review and test when upgrading the driver.
export function inspectionClientClass(Client, required) {
  if (!required) return Client;
  for (const name of ["_handleAuthSASL", "_handleAuthSASLFinal", "_handleAuthCleartextPassword", "_handleAuthMD5Password", "_handleReadyForQuery"]) {
    if (typeof Client.prototype[name] !== "function") throw failure("CHANNEL_BINDING_REQUIRED");
  }
  return class extends Client {
    rejectBinding() { this.connection.emit("error", failure("CHANNEL_BINDING_REQUIRED")); }
    _handleAuthCleartextPassword() { this.rejectBinding(); }
    _handleAuthMD5Password() { this.rejectBinding(); }
    _handleAuthSASL(msg) {
      if (!this.enableChannelBinding || !msg.mechanisms?.includes("SCRAM-SHA-256-PLUS")) return this.rejectBinding();
      return super._handleAuthSASL({ ...msg, mechanisms: ["SCRAM-SHA-256-PLUS"] });
    }
    _handleAuthSASLFinal(msg) {
      super._handleAuthSASLFinal(msg);
      this.bindingVerified = this.saslSession === null;
    }
    _handleReadyForQuery(msg) {
      if (!this.bindingVerified) return this.rejectBinding();
      return super._handleReadyForQuery(msg);
    }
  };
}
