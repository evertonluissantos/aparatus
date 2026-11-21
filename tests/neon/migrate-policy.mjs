import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifyNeonIdentity } from "./identity.mjs";
import {
  normalizeInspectionConnection,
  inspectionClientClass,
} from "./inspection-connection.mjs";
import {
  inspectMigrationCatalog,
  expectedMigrations,
} from "./migration-catalog.mjs";

export const migrationTarget = Object.freeze({
  projectId: "orange-rice-48468127",
  organizationId: "org-plain-frog-58714601",
  branchId: "br-small-surf-b694suzd",
  endpointId: "ep-odd-recipe-b69bpw0c",
  hostname: "ep-odd-recipe-b69bpw0c.c-2.sa-east-1.aws.neon.tech",
  database: "cortz_test_integration",
});
const codes = new Set([
  "MIGRATION_CONSENT_REQUIRED",
  "IMPLICIT_CONFIGURATION_REJECTED",
  "MIGRATION_ROLE_NOT_CONFIGURED",
  "MIGRATION_SCOPE_REJECTED",
  "MIGRATION_CREDENTIALS_MISSING",
  "MIGRATION_TLS_REJECTED",
  "MIGRATION_FILES_CHANGED",
  "MIGRATION_ROLE_REJECTED",
  "MIGRATION_PRIVILEGES_MISSING",
  "MIGRATION_EXTENSION_REQUIRED",
  "MIGRATION_HISTORY_REJECTED",
  "MIGRATION_BASELINE_REVIEW_REQUIRED",
  "MIGRATION_CONFLICTS",
  "MIGRATION_FAILED",
  "MIGRATION_COMMAND_REJECTED",
  "PRISMA_ENGINE_UNAVAILABLE",
]);
export function migrationFailure(code) {
  const error = new Error();
  error.code = code;
  return error;
}
export function migrationDiagnostic(error) {
  return `CORTZ_TEST_MIGRATION_REFUSED: code=${codes.has(error?.code) ? error.code : "MIGRATION_FAILED"}`;
}
const reject = (code) => {
  throw migrationFailure(code);
};

export function migrationConfiguration(env, identity, profile) {
  if (
    env.CORTZ_ALLOW_TEST_MIGRATIONS !== migrationTarget.projectId ||
    env.CORTZ_EXECUTE_TEST_MIGRATIONS !== "apply-reviewed-migrations"
  )
    reject("MIGRATION_CONSENT_REQUIRED");
  if (
    Object.entries(env).some(
      ([key, value]) =>
        value &&
        /^(DATABASE_URL|DIRECT_URL|TEST_DATABASE_URL|PG.*|NODE_OPTIONS|NODE_TLS_REJECT_UNAUTHORIZED|DOTENV.*|PRISMA_.*|DEBUG)$/.test(
          key,
        ),
    )
  )
    reject("IMPLICIT_CONFIGURATION_REJECTED");
  if (
    Object.entries(migrationTarget).some(
      ([key, value]) => identity[key] !== value,
    )
  )
    reject("MIGRATION_SCOPE_REJECTED");
  const role = profile?.executorRole;
  if (
    typeof role !== "string" ||
    !/^cortz_test_[a-z0-9_]+$/.test(role) ||
    ["cortz_test_inspector", "cortz_test_runner"].includes(role)
  )
    reject("MIGRATION_ROLE_NOT_CONFIGURED");
  if (!env.CORTZ_MIGRATION_DATABASE_URL || !env.CORTZ_TEST_NEON_API_KEY)
    reject("MIGRATION_CREDENTIALS_MISSING");
  let url;
  try {
    url = new URL(env.CORTZ_MIGRATION_DATABASE_URL);
  } catch {
    reject("MIGRATION_TLS_REJECTED");
  }
  const params = [...url.searchParams];
  // Prisma's native migration engine uses require + sslaccept=strict, not pg's
  // verify-full parser. Never silently drop a required channel_binding parameter.
  if (
    params.length !== 3 ||
    new Set(params.map(([key]) => key)).size !== 3 ||
    url.searchParams.get("sslmode") !== "require" ||
    url.searchParams.get("sslaccept") !== "strict" ||
    url.searchParams.get("schema") !== "public"
  )
    reject("MIGRATION_TLS_REJECTED");
  const scope = { ...migrationTarget, role };
  const pgUrl = new URL(url);
  pgUrl.searchParams.delete("sslaccept");
  pgUrl.searchParams.delete("schema");
  let connection;
  try {
    connection = normalizeInspectionConnection(pgUrl.href, scope);
  } catch {
    reject("MIGRATION_SCOPE_REJECTED");
  }
  return {
    scope,
    connection,
    url: url.href,
    apiKey: env.CORTZ_TEST_NEON_API_KEY,
  };
}

export function localMigrationConfiguration(env) {
  const identity = JSON.parse(
    readFileSync(new URL("./project-identity.json", import.meta.url), "utf8"),
  );
  const profile = JSON.parse(
    readFileSync(new URL("./migration-executor.json", import.meta.url), "utf8"),
  );
  const trust = JSON.parse(
    readFileSync(new URL("./trusted-projects.json", import.meta.url), "utf8"),
  );
  const entry = trust.authorizers?.[0];
  if (
    trust.authorizers?.length !== 1 ||
    entry?.organizationId !== migrationTarget.organizationId ||
    entry.allowedTestProjectIds?.length !== 1 ||
    entry.allowedTestProjectIds[0] !== migrationTarget.projectId ||
    !entry.forbiddenProjectIds?.includes("sparkling-union-52245638") ||
    entry.forbiddenProjectIds.includes(migrationTarget.projectId)
  )
    reject("MIGRATION_SCOPE_REJECTED");
  const names = readdirSync(
    new URL("../../prisma/migrations/", import.meta.url),
    { withFileTypes: true },
  )
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedMigrations))
    reject("MIGRATION_FILES_CHANGED");
  return migrationConfiguration(env, identity, profile);
}

export function validateMigrationRole(role) {
  if (
    role.db !== migrationTarget.database ||
    role.usr !== role.expectedRole ||
    role.session_usr !== role.expectedRole ||
    role.readonly !== "on" ||
    role.rolsuper ||
    role.rolcreaterole ||
    role.rolcreatedb ||
    role.rolreplication ||
    role.rolbypassrls ||
    Number(role.memberships) !== 0
  )
    reject("MIGRATION_ROLE_REJECTED");
  if (
    role.schema_usage !== true ||
    role.schema_create !== true ||
    Number(role.foreign_owned_tables) !== 0
  )
    reject("MIGRATION_PRIVILEGES_MISSING");
}

export function validateMigrationSnapshot(report, role) {
  validateMigrationRole(role);
  // Preinstall only with a separately authorized operator, outside this command.
  // The migration retains CREATE EXTENSION IF NOT EXISTS, without giving this
  // executor database-creation or extension-installation privileges.
  if (!report.btreeGist.installed || role.extension_schema !== "public")
    reject("MIGRATION_EXTENSION_REQUIRED");
  if (
    report.uninspectedSchemas ||
    report.unlistedRelations ||
    report.schemas.some((item) => item.schema !== "public")
  )
    reject("MIGRATION_HISTORY_REJECTED");
  const snapshot = report.schemas.find((item) => item.schema === "public");
  if (!snapshot) reject("MIGRATION_HISTORY_REJECTED");
  if (snapshot.owners.conflictingOwners || snapshot.slugs.duplicateGroups)
    reject("MIGRATION_CONFLICTS");
  if (
    snapshot.tables.some(
      (table) => table.invalidIndexes || table.unvalidatedConstraints,
    )
  )
    reject("MIGRATION_HISTORY_REJECTED");
  if (snapshot.history.status === "absent") {
    if (snapshot.tables.some((table) => table.present))
      reject("MIGRATION_BASELINE_REVIEW_REQUIRED");
    return;
  }
  if (snapshot.history.status !== "present" || snapshot.history.unknownEntries)
    reject("MIGRATION_HISTORY_REJECTED");
  if (
    snapshot.history.migrations[0]?.status === "pending" &&
    snapshot.tables.some(
      (table) => table.present && table.name !== "_prisma_migrations",
    )
  )
    reject("MIGRATION_BASELINE_REVIEW_REQUIRED");
  let pending = false;
  for (const item of snapshot.history.migrations) {
    if (item.status === "pending") pending = true;
    else if (item.status !== "applied" || pending)
      reject("MIGRATION_HISTORY_REJECTED");
  }
}

export async function verifyMigrationDestination(
  configuration,
  { verifyIdentity = verifyNeonIdentity, makeClient } = {},
) {
  // Every configuration load verifies API scope BEFORE a SQL connection exists.
  await verifyIdentity(
    { apiKey: configuration.apiKey },
    configuration.scope,
    globalThis.fetch,
    { allowOmittedRootParent: true },
  );
  if (!makeClient) {
    const { Client } = await import("pg");
    const StrictClient = inspectionClientClass(
      Client,
      configuration.connection.enableChannelBinding,
    );
    makeClient = (options) => new StrictClient(options);
  }
  const client = makeClient({
    ...configuration.connection,
    connectionTimeoutMillis: 10000,
    query_timeout: 15000,
    options:
      "-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=3000",
  });
  let connectionFailed = false;
  client.on("error", () => {
    connectionFailed = true;
  });
  let transaction = false;
  try {
    await client.connect();
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    transaction = true;
    const {
      rows: [role],
    } =
      await client.query(`SELECT current_database() AS db, current_user AS usr, session_user AS session_usr,
      current_setting('transaction_read_only') AS readonly, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolbypassrls,
      (SELECT count(*) FROM pg_auth_members WHERE member=r.oid) AS memberships,
      has_schema_privilege(current_user,'public','USAGE') AS schema_usage,
      has_schema_privilege(current_user,'public','CREATE') AS schema_create,
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relowner<>r.oid) AS foreign_owned_tables,
      (SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='btree_gist') AS extension_schema
      FROM pg_roles r WHERE r.rolname=current_user`);
    if (!role) reject("MIGRATION_ROLE_REJECTED");
    // Check identity/READ ONLY before any application-table reads.
    if (
      role.db !== configuration.scope.database ||
      role.usr !== configuration.scope.role ||
      role.session_usr !== configuration.scope.role ||
      role.readonly !== "on"
    )
      reject("MIGRATION_ROLE_REJECTED");
    validateMigrationRole({ ...role, expectedRole: configuration.scope.role });
    const report = await inspectMigrationCatalog(client);
    validateMigrationSnapshot(report, {
      ...role,
      expectedRole: configuration.scope.role,
    });
  } finally {
    try {
      if (transaction) await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  }
  if (connectionFailed) reject("MIGRATION_FAILED");
  return configuration.url;
}

export const migrationPaths = Object.freeze({
  schema: fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url)),
  migrations: fileURLToPath(
    new URL("../../prisma/migrations", import.meta.url),
  ),
});
