// Local preparation only: never imports the remote runner or database drivers.
import "./offline-guard.mjs";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { isAbsolute, relative, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyAuthorization } from "./identity.mjs";

try {
  const destination = process.argv[2];
  if (process.argv.length !== 3 || !destination || !isAbsolute(destination)) throw new Error();
  const output = realpathSync(destination);
  const repository = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
  const path = relative(repository, output);
  if (!(path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path))) throw new Error();
  const files = ["private-key.pem", "public-key.pem", "authorization.json"].map((name) => join(output, name));
  if (files.some(existsSync)) throw new Error();
  const identity = JSON.parse(readFileSync(new URL("./project-identity.json", import.meta.url), "utf8"));
  const trust = JSON.parse(readFileSync(new URL("./trusted-projects.json", import.meta.url), "utf8"));
  // Operator attests independent, empty branch and permission for schema/extensions.
  if (process.env.CORTZ_CONFIRM_SIGNING_SCOPE !== identity.projectId) throw new Error();
  const passphrase = process.env.CORTZ_AUTHORIZATION_PASSPHRASE;
  delete process.env.CORTZ_AUTHORIZATION_PASSPHRASE;
  if (!passphrase || passphrase.length < 16) throw new Error();
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const issued = new Date();
  const manifest = {
    version: 1, purpose: "cortz-neon-disposable-tests", authorizationId: randomUUID(),
    ...identity, independentEmptyBranch: true, allowCreateTestSchema: true,
    allowTestExtensions: true, cleanup: "manual-branch-review",
    issuedAt: issued.toISOString(), expiresAt: new Date(issued.getTime() + 3_600_000).toISOString(),
  };
  const bytes = Buffer.from(JSON.stringify(manifest));
  const envelope = { keyId: identity.endpointId, payloadBase64: bytes.toString("base64url"), signatureBase64: sign(null, bytes, privateKey).toString("base64url") };
  const entry = trust.authorizers.find((item) => item.keyId === envelope.keyId);
  // Validate against existing pinned lists without enrolling a key automatically.
  verifyAuthorization(envelope, { ...trust, authorizers: [{ ...entry, publicKeyPem }] }, {
    projectId: identity.projectId,
    connection: { host: identity.hostname, database: identity.database, user: identity.role },
  }, issued);
  writeFileSync(files[0], privateKey.export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase }), { flag: "wx", mode: 0o600 });
  writeFileSync(files[1], publicKeyPem, { flag: "wx", mode: 0o600 });
  writeFileSync(files[2], JSON.stringify(envelope, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log("LOCAL_AUTHORIZATION_PREPARED: review public key before manual enrollment; trust store unchanged.");
} catch {
  console.error("LOCAL_AUTHORIZATION_PREPARATION_REFUSED: check scope, passphrase and unused directory outside repository; no automatic cleanup.");
  process.exitCode = 1;
}
