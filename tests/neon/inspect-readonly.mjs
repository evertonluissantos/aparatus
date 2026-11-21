// Separate inspection entry point. Never imports migration or signing runners.
import { readFileSync } from "node:fs";
import { verifyNeonIdentity } from "./identity.mjs";
import { restrictNeonNetwork } from "./network-guard.mjs";
import { inspectionFailure as failure, safeInspectionDiagnostic } from "./inspection-diagnostics.mjs";
import { normalizeInspectionConnection, inspectionClientClass } from "./inspection-connection.mjs";

let stage = "configuration";

async function inspect() {
  const migrationMode = process.argv.length === 3 && process.argv[2] === "--migrations";
  if (process.env.CORTZ_ALLOW_NEON_INSPECTION !== "read-only-test-project") throw failure("CONSENT_REQUIRED");
  if (Object.entries(process.env).some(([key, value]) => value && /^(DATABASE_URL|TEST_DATABASE_URL|PG.*|NODE_OPTIONS|NODE_TLS_REJECT_UNAUTHORIZED|DOTENV.*)$/.test(key))) throw failure("IMPLICIT_CONFIGURATION_REJECTED");
  stage = "local_files";
  const identity = JSON.parse(readFileSync(new URL("./project-identity.json", import.meta.url), "utf8"));
  // Separate read-only identity; do not change the shared migration/empty runner role.
  if (migrationMode) identity.role = "cortz_test_inspector";
  const trust = JSON.parse(readFileSync(new URL("./trusted-projects.json", import.meta.url), "utf8"));
  if (identity.projectId !== "orange-rice-48468127" || identity.organizationId !== "org-plain-frog-58714601") throw failure("LOCAL_IDENTITY_REJECTED");
  if (trust.authorizers.length !== 1) throw failure("TRUST_STORE_REJECTED");
  const entry = trust.authorizers[0];
  if (entry.organizationId !== identity.organizationId || entry.allowedTestProjectIds.length !== 1 || entry.allowedTestProjectIds[0] !== identity.projectId || !entry.forbiddenProjectIds.includes("sparkling-union-52245638") || entry.forbiddenProjectIds.includes(identity.projectId)) throw failure("TRUST_STORE_REJECTED");
  if (!process.env.CORTZ_TEST_NEON_API_KEY || !process.env.CORTZ_TEST_DATABASE_URL) throw failure("CREDENTIALS_MISSING");
  stage = "url";
  const connection = normalizeInspectionConnection(process.env.CORTZ_TEST_DATABASE_URL, identity);
  // GET-only verifier rejects redirects and missing/mismatched API metadata.
  const apiStages = ["api_project", "api_branch", "api_endpoint"];
  let request = 0;
  await verifyNeonIdentity({ apiKey: process.env.CORTZ_TEST_NEON_API_KEY }, identity, async (...args) => {
    stage = apiStages[request++];
    const response = await fetch(...args);
    // Only numeric HTTP status is logged; no body, headers or request URL.
    if (!response.ok) console.error(`NEON_INSPECTION_HTTP: stage=${stage} status=${Number.isInteger(response.status) ? response.status : "unknown"}`);
    return response;
  }, { allowOmittedRootParent: migrationMode });
  // From this point only direct PostgreSQL/TLS to the verified host is permitted.
  restrictNeonNetwork(identity.hostname);
  stage = "driver";
  const { Client } = await import("pg");
  const InspectionClient = inspectionClientClass(Client, connection.enableChannelBinding);
  const client = new InspectionClient({
    ...connection,
    connectionTimeoutMillis: 10000, query_timeout: 15000,
    options: "-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=3000",
  });
  client.on("error", (error) => { console.error(safeInspectionDiagnostic(stage, error)); process.exitCode = 1; });
  let connected = false, transaction = false, primaryFailure = false;
  try {
    stage = "sql_connect";
    await client.connect();
    connected = true;
    stage = "read_only_begin";
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transaction = true;
    stage = "role_catalog";
    const { rows: [role] } = await client.query(`SELECT current_database() AS db, current_user AS usr,
      session_user AS session_usr, current_setting('transaction_read_only') AS readonly,
      r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolbypassrls,
      has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema,
      (SELECT count(*)::int FROM pg_auth_members WHERE member=r.oid) AS memberships
      FROM pg_roles r WHERE r.rolname=current_user`);
    if (!role || role.db !== identity.database || role.usr !== identity.role || role.session_usr !== identity.role) throw failure("DATABASE_IDENTITY_REJECTED");
    if (role.readonly !== "on") throw failure("READ_ONLY_NOT_ACTIVE");
    if (role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolreplication || role.rolbypassrls) throw failure("PRIVILEGED_ROLE_REJECTED");
    if (role.memberships !== 0) throw failure("ROLE_MEMBERSHIP_REJECTED");
    if (!migrationMode && role.can_create_schema !== true) throw failure("CREATE_PRIVILEGE_MISSING");
    stage = "object_catalog";
    if (migrationMode) {
      const { inspectMigrationCatalog } = await import("./migration-catalog.mjs");
      const report = await inspectMigrationCatalog(client);
      console.log(JSON.stringify({ inspection: "read-only-migrations", projectId: identity.projectId, branchId: identity.branchId, ...report }));
    } else {
    const { rows: [objects] } = await client.query(`SELECT count(*)::int AS count FROM (
      SELECT oid FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema','public')
      UNION ALL SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      UNION ALL SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      UNION ALL SELECT t.oid FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      UNION ALL SELECT c.oid FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      UNION ALL SELECT o.oid FROM pg_operator o JOIN pg_namespace n ON n.oid=o.oprnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      UNION ALL SELECT oid FROM pg_extension WHERE extname <> 'plpgsql'
      UNION ALL SELECT oid FROM pg_foreign_server
      UNION ALL SELECT oid FROM pg_foreign_data_wrapper
      UNION ALL SELECT oid FROM pg_publication
      UNION ALL SELECT oid FROM pg_largeobject_metadata
    ) AS objects`);
    if (objects?.count !== 0) throw failure("USER_OBJECTS_PRESENT");
    }
  } catch (error) {
    primaryFailure = true;
    // Log original failure before cleanup, which previously could mask it.
    console.error(safeInspectionDiagnostic(stage, error));
    process.exitCode = 1;
  } finally {
    // End the read-only transaction without committing; no cleanup DDL or locks.
    if (connected && transaction) {
      try { await client.query("ROLLBACK"); }
      catch (error) { console.error(safeInspectionDiagnostic("rollback", error)); process.exitCode = 1; }
    }
    try { await client.end(); }
    catch (error) { console.error(safeInspectionDiagnostic("disconnect", error)); process.exitCode = 1; }
  }
  if (!primaryFailure && !process.exitCode) console.log(migrationMode
    ? "NEON_MIGRATION_INSPECTION_OK: read-only catalog inspection completed; no migrations executed."
    : "NEON_READONLY_INSPECTION_OK: API identity and catalog snapshot verified; no write capability or migrations tested.");
}

inspect().catch((error) => {
  console.error(safeInspectionDiagnostic(stage, error));
  process.exitCode = 1;
});
