import { verify, createPublicKey } from "node:crypto";
import { isAbsolute } from "node:path";

export class NeonSafetyError extends Error {
  constructor(code) { super(code); this.name = "NeonSafetyError"; }
}
const reject = (code) => { throw new NeonSafetyError(code); };
const identifier = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const hostPattern = /^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/;
export function readRemoteEnvironment(env) {
  if (env.CORTZ_ALLOW_REMOTE_TESTS !== "neon-disposable") reject("REMOTE_CONSENT_REQUIRED");
  if (Object.keys(env).some((key) => /^(DATABASE_URL|TEST_DATABASE_URL|PG.*|NODE_OPTIONS|NODE_TLS_REJECT_UNAUTHORIZED|DOTENV.*)$/.test(key) && env[key])) reject("IMPLICIT_CONFIGURATION_REJECTED");
  for (const key of ["CORTZ_TEST_DATABASE_URL", "CORTZ_TEST_NEON_API_KEY", "CORTZ_TEST_PROJECT_ID", "CORTZ_NEON_AUTHORIZATION_FILE"]) if (typeof env[key] !== "string" || !env[key]) reject("REMOTE_CONFIGURATION_INCOMPLETE");
  if (!isAbsolute(env.CORTZ_NEON_AUTHORIZATION_FILE) || !identifier(env.CORTZ_TEST_PROJECT_ID)) reject("REMOTE_CONFIGURATION_INVALID");
  let url;
  try { url = new URL(env.CORTZ_TEST_DATABASE_URL); } catch { reject("TEST_URL_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !hostPattern.test(url.hostname) || url.hostname.includes("-pooler.") || url.port && url.port !== "5432" || url.hash) reject("TEST_ENDPOINT_REJECTED");
  const params = [...url.searchParams];
  if (params.length !== 1 || params[0][0] !== "sslmode" || params[0][1] !== "verify-full") reject("STRICT_TLS_REQUIRED");
  let user, password, database;
  try { user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); database = decodeURIComponent(url.pathname.slice(1)); } catch { reject("TEST_URL_INVALID"); }
  if (!identifier(user) || !/^cortz_test_[a-z0-9_]+$/.test(database) || !password || /[\x00-\x1f]/.test(password)) reject("TEST_CREDENTIALS_INVALID");
  return { projectId: env.CORTZ_TEST_PROJECT_ID, authorizationFile: env.CORTZ_NEON_AUTHORIZATION_FILE,
    apiKey: env.CORTZ_TEST_NEON_API_KEY, url: env.CORTZ_TEST_DATABASE_URL,
    connection: { host: url.hostname, port: 5432, database, user, password, ssl: { rejectUnauthorized: true, servername: url.hostname }, options: "", connectionTimeoutMillis: 10_000 } };
}

export function verifyAuthorization(envelope, trust, remote, now = new Date()) {
  if (!envelope || typeof envelope !== "object" || !trust || typeof trust !== "object") reject("AUTHORIZATION_INVALID");
  if (trust.version !== 1 || !Array.isArray(trust.authorizers)) reject("TRUST_STORE_INVALID");
  const matches = trust.authorizers.filter((entry) => entry && entry.keyId === envelope.keyId);
  if (matches.length !== 1) reject("PROJECT_NOT_TRUSTED");
  const authorizer = matches[0];
  if (!authorizer || !Array.isArray(authorizer.allowedTestProjectIds) || !Array.isArray(authorizer.forbiddenProjectIds) || !authorizer.forbiddenProjectIds.length || !identifier(authorizer.organizationId)) reject("PROJECT_NOT_TRUSTED");
  if (!authorizer.allowedTestProjectIds.includes(remote.projectId) || authorizer.forbiddenProjectIds.includes(remote.projectId)) reject("PROJECT_NOT_AUTHORIZED");
  for (const list of [authorizer.allowedTestProjectIds, authorizer.forbiddenProjectIds]) {
    if (!list.every(identifier) || new Set(list).size !== list.length) reject("TRUST_STORE_INVALID");
  }
  if (authorizer.allowedTestProjectIds.some((id) => authorizer.forbiddenProjectIds.includes(id))) reject("TRUST_STORE_INVALID");
  for (const field of ["payloadBase64", "signatureBase64"]) if (typeof envelope[field] !== "string" || !/^[A-Za-z0-9_-]+$/.test(envelope[field]) || envelope[field].length > 32768) reject("AUTHORIZATION_INVALID");
  const payloadBytes = Buffer.from(envelope.payloadBase64, "base64url");
  if (payloadBytes.toString("base64url") !== envelope.payloadBase64 || Buffer.from(envelope.signatureBase64, "base64url").toString("base64url") !== envelope.signatureBase64) reject("AUTHORIZATION_INVALID");
  let key;
  try { key = createPublicKey(authorizer.publicKeyPem); } catch { reject("TRUST_KEY_INVALID"); }
  if (key.asymmetricKeyType !== "ed25519") reject("TRUST_KEY_INVALID");
  if (!verify(null, payloadBytes, key, Buffer.from(envelope.signatureBase64, "base64url"))) reject("AUTHORIZATION_SIGNATURE_INVALID");
  let manifest;
  try { manifest = JSON.parse(payloadBytes.toString("utf8")); } catch { reject("AUTHORIZATION_INVALID"); }
  if (!manifest || typeof manifest !== "object") reject("AUTHORIZATION_INVALID");
  if (manifest.version !== 1 || manifest.purpose !== "cortz-neon-disposable-tests" || manifest.projectId !== remote.projectId || manifest.organizationId !== authorizer.organizationId || !identifier(manifest.authorizationId) || !identifier(manifest.branchId) || !identifier(manifest.endpointId)) reject("AUTHORIZATION_SCOPE_INVALID");
  if (manifest.hostname !== remote.connection.host || manifest.hostname.split(".")[0] !== manifest.endpointId || manifest.database !== remote.connection.database || manifest.role !== remote.connection.user || manifest.independentEmptyBranch !== true || manifest.allowCreateTestSchema !== true || manifest.allowTestExtensions !== true || manifest.cleanup !== "manual-branch-review") reject("AUTHORIZATION_SCOPE_INVALID");
  const issued = Date.parse(manifest.issuedAt), expires = Date.parse(manifest.expiresAt), current = now.getTime();
  if (![issued,expires,current].every(Number.isFinite) || issued > current || expires <= current || expires <= issued || expires - issued > 24 * 3_600_000) reject("AUTHORIZATION_EXPIRED_OR_INVALID");
  return Object.freeze(manifest);
}

export function verifyBranchIdentity(response, manifest, { allowOmittedRootParent = false } = {}) {
  if (!response || typeof response !== "object" || Array.isArray(response) || !Object.hasOwn(response, "branch")) reject("NEON_BRANCH_RESPONSE_INCOMPATIBLE");
  const branch = response.branch;
  if (!branch || typeof branch !== "object" || Array.isArray(branch)) reject("NEON_BRANCH_RESPONSE_INCOMPATIBLE");
  if (!Object.hasOwn(branch, "id")) reject("NEON_BRANCH_ID_MISSING");
  if (typeof branch.id !== "string" || !branch.id) reject("NEON_BRANCH_ID_INVALID");
  if (branch.id !== manifest.branchId) reject("NEON_BRANCH_ID_MISMATCH");
  if (!Object.hasOwn(branch, "project_id")) reject("NEON_BRANCH_PROJECT_ID_MISSING");
  if (typeof branch.project_id !== "string" || !branch.project_id) reject("NEON_BRANCH_PROJECT_ID_INVALID");
  if (branch.project_id !== manifest.projectId) reject("NEON_BRANCH_PROJECT_ID_MISMATCH");
  // Neon OpenAPI Branch does not require parent_id. Read-only migration inspection
  // accepts omitted root ancestry, without fabricating a field or accepting a
  // child. Original empty inspection and signed migration runners remain strict.
  // Contract: github.com/neondatabase/neon-api-python/blob/main/v2.json (Branch).
  if (!Object.hasOwn(branch, "parent_id")) {
    if (allowOmittedRootParent === true && !Object.hasOwn(branch, "parent_lsn") && !Object.hasOwn(branch, "parent_timestamp")) return branch;
    reject("NEON_BRANCH_PARENT_ID_MISSING");
  }
  if (branch.parent_id === null) return branch;
  if (typeof branch.parent_id !== "string" || !branch.parent_id) reject("NEON_BRANCH_PARENT_ID_INVALID");
  reject("NEON_BRANCH_HAS_PARENT");
}

export async function verifyNeonIdentity(remote, manifest, fetcher = globalThis.fetch, branchOptions = {}) {
  async function get(suffix) {
    const response = await fetcher(`https://console.neon.tech/api/v2/projects/${encodeURIComponent(manifest.projectId)}${suffix}`, {
      method: "GET", redirect: "error", headers: { Authorization: `Bearer ${remote.apiKey}` }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) reject("NEON_IDENTITY_REQUEST_FAILED");
    return response.json();
  }
  const { project } = await get("");
  if (project?.id !== manifest.projectId || project.org_id !== manifest.organizationId) reject("NEON_PROJECT_UNVERIFIED");
  verifyBranchIdentity(await get(`/branches/${encodeURIComponent(manifest.branchId)}`), manifest, branchOptions);
  const { endpoint } = await get(`/endpoints/${encodeURIComponent(manifest.endpointId)}`);
  if (endpoint?.id !== manifest.endpointId || endpoint.project_id !== manifest.projectId || endpoint.branch_id !== manifest.branchId || endpoint.host !== manifest.hostname || endpoint.type !== "read_write") reject("NEON_ENDPOINT_UNVERIFIED");
  return manifest;
}

export async function verifyEmptyRemoteDatabase(pool, configuration, schema) {
  if (!/^cortz_run_[a-f0-9]{32}$/.test(schema)) reject("TEST_SCHEMA_INVALID");
  const connection = await pool.connect();
  let locked = false;
  try {
  locked = (await connection.query("SELECT pg_try_advisory_lock(42196, 1) AS locked")).rows[0]?.locked === true;
  if (!locked) reject("ANOTHER_REMOTE_RUN_ACTIVE");
  const { rows } = await connection.query("SELECT current_database() AS db, current_user AS usr, r.rolsuper, r.rolcreaterole, r.rolcreatedb FROM pg_roles r WHERE r.rolname = current_user");
  const role = rows[0];
  if (!role || role.db !== configuration.database || role.usr !== configuration.user || role.rolsuper || role.rolcreaterole || role.rolcreatedb) reject("DATABASE_IDENTITY_OR_ROLE_REJECTED");
  // Reject all memberships, including NOINHERIT roles reachable through SET ROLE.
  const memberships = await connection.query("SELECT count(*) FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = current_user)");
  if (Number(memberships.rows[0]?.count) !== 0) reject("ROLE_MEMBERSHIP_REJECTED");
  // Regex matches a literal underscore: pgx is a user namespace, pg_catalog is not.
  // No relkind filter: indexes, composite relations and future kinds also count.
  const relations = await connection.query(`SELECT count(*) FROM (
    SELECT n.oid FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema', 'public')
    UNION ALL SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
    UNION ALL SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
    UNION ALL SELECT t.oid FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
    UNION ALL SELECT o.oid FROM pg_operator o JOIN pg_namespace n ON n.oid=o.oprnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
    UNION ALL SELECT c.oid FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
    UNION ALL SELECT oid FROM pg_foreign_server
    UNION ALL SELECT oid FROM pg_foreign_data_wrapper
    UNION ALL SELECT oid FROM pg_publication
    UNION ALL SELECT oid FROM pg_largeobject_metadata
  ) AS user_objects`);
  const extensions = await connection.query("SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql'");
  if (Number(relations.rows[0].count) !== 0 || Number(extensions.rows[0].count) !== 0) reject("DATABASE_NOT_PRISTINE");
  // First DDL, only after all checks. No DROP, TRUNCATE or existing namespace reuse.
  await connection.query(`CREATE SCHEMA "${schema}" AUTHORIZATION CURRENT_USER`);
  if ((await connection.query("SELECT current_schema() AS name")).rows[0].name !== schema) reject("TEST_SEARCH_PATH_INVALID");
  return async () => { try { await connection.query("SELECT pg_advisory_unlock(42196, 1)"); } finally { connection.release(); } };
  } catch (error) {
    try { if (locked) await connection.query("SELECT pg_advisory_unlock(42196, 1)"); } finally { connection.release(); }
    throw error;
  }
}
