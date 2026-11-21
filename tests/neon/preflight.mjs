import { readFileSync } from "node:fs";
import { readRemoteEnvironment, verifyAuthorization, NeonSafetyError } from "./identity.mjs";

export function validateOfflineConfiguration(env, reader = readFileSync, now = new Date()) {
  const remote = readRemoteEnvironment(env);
  function json(path, code) {
    try { return JSON.parse(reader(path, "utf8")); }
    catch { throw new NeonSafetyError(code); }
  }
  const trust = json(new URL("./trusted-projects.json", import.meta.url), "TRUST_FILE_INVALID");
  const envelope = json(remote.authorizationFile, "AUTHORIZATION_FILE_INVALID");
  return { remote, manifest: verifyAuthorization(envelope, trust, remote, now) };
}
