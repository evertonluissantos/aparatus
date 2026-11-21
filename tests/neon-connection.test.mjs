import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { normalizeInspectionConnection, inspectionClientClass } from "./neon/inspection-connection.mjs";

const identity = { hostname: "ep-fictional.sa-east-1.aws.neon.tech", role: "test_role", database: "cortz_test_fake" };
const base = `postgresql://test_role:fake%40password@${identity.hostname}/cortz_test_fake`;
test("inspection URL: original Neon parameters become explicit verified TLS options in memory", () => {
  for (const query of ["sslmode=require&channel_binding=require", "channel_binding=require&sslmode=require", "sslmode=verify-full&channel_binding=require", "sslmode=verify-full"]) {
    const options = normalizeInspectionConnection(`${base}?${query}`, identity);
    assert.deepEqual(options.ssl, { rejectUnauthorized: true, servername: identity.hostname });
    assert.equal(options.password, "fake@password");
    assert.equal(options.enableChannelBinding, query.includes("channel_binding"));
    assert.equal(options.connectionString, undefined);
    assert.equal(options.host, identity.hostname);
  }
});
test("inspection URL: ambiguous, insecure and overriding options fail without revealing the URL", () => {
  for (const query of ["", "sslmode=disable", "sslmode=verify-ca", "sslmode=require&sslmode=verify-full", "sslmode=require&channel_binding=require&channel_binding=require", "sslmode=require&channel_binding=prefer", "sslmode=require&host=other.invalid", "sslmode=require&options=unsafe", "sslmode=require&sslcert=secret"]) {
    assert.throws(() => normalizeInspectionConnection(`${base}?${query}`, identity), (error) => error.code === "URL_REJECTED" && !error.message.includes("fake"));
  }
  for (const url of [base.replace(identity.hostname, "localhost"), base.replace(identity.hostname, "ep-other.neon.tech"), base.replace("test_role", "other_role"), base.replace("cortz_test_fake", "other_db"), `${base}:5433?sslmode=require`, `${base}?sslmode=require#fragment`]) assert.throws(() => normalizeInspectionConnection(url, identity));
});
test("inspection channel binding: installed pg driver rejects downgrade before auth/ready", () => {
  const StrictClient = inspectionClientClass(Client, true);
  for (const [method, message] of [["_handleAuthCleartextPassword", {}], ["_handleAuthMD5Password", {}], ["_handleAuthSASL", { mechanisms: ["SCRAM-SHA-256"] }], ["_handleReadyForQuery", {}]]) {
    const client = new StrictClient({ ...normalizeInspectionConnection(`${base}?sslmode=require&channel_binding=require`, identity) });
    const errors = []; client.connection.on("error", (error) => errors.push(error.code));
    client[method](message);
    assert.deepEqual(errors, ["CHANNEL_BINDING_REQUIRED"]);
  }
});
test("inspection channel binding: verified SCRAM PLUS is required before ready (fake handshake)", () => {
  class FakeClient {
    constructor() { this.enableChannelBinding = true; this.connection = { emit: () => { throw new Error("unexpected failure"); } }; }
    _handleAuthSASL(msg) { this.mechanisms = msg.mechanisms; this.saslSession = {}; }
    _handleAuthSASLFinal() { this.saslSession = null; }
    _handleAuthCleartextPassword() { throw new Error("downgrade"); }
    _handleAuthMD5Password() { throw new Error("downgrade"); }
    _handleReadyForQuery() { this.ready = true; }
  }
  const StrictClient = inspectionClientClass(FakeClient, true); const client = new StrictClient();
  client._handleAuthSASL({ mechanisms: ["SCRAM-SHA-256", "SCRAM-SHA-256-PLUS"] });
  assert.deepEqual(client.mechanisms, ["SCRAM-SHA-256-PLUS"]);
  client._handleAuthSASLFinal({}); client._handleReadyForQuery({}); assert.equal(client.ready, true);
  assert.equal(inspectionClientClass(FakeClient, false), FakeClient);
  assert.throws(() => inspectionClientClass(class {}, true), (error) => error.code === "CHANNEL_BINDING_REQUIRED");
});
