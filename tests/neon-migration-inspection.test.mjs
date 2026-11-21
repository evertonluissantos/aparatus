import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inspectMigrationCatalog, summarizeMigrationHistory, expectedMigrations } from "./neon/migration-catalog.mjs";
import { normalizeInspectionConnection } from "./neon/inspection-connection.mjs";

const historyFields = ["migration_name", "checksum", "finished_at", "rolled_back_at", "applied_steps_count"];
const table = table_name => ({ schema_name: "public", table_name, relkind: "r" });
const column = (table_name, column_name) => ({ schema_name: "public", table_name, column_name });
function fixture({ relations = [], columns = [], histories = [], owners = "0", slugs = "0" } = {}) {
  const queries = [];
  return {
    queries,
    async query(sql) {
      queries.push(sql);
      assert.match(sql.trim(), /^SELECT\b/);
      assert.equal(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql), false);
      if (sql.includes("FROM pg_catalog.pg_class c")) return { rows: relations };
      if (sql.includes("FROM pg_catalog.pg_attribute a")) return { rows: columns };
      if (sql.includes("FROM pg_catalog.pg_index")) return { rows: [] };
      if (sql.includes("FROM pg_catalog.pg_constraint")) return { rows: [] };
      if (sql.includes("pg_available_extensions")) return { rows: [{ installed: false, available: true }] };
      if (sql.includes('FROM "public"."_prisma_migrations"')) return { rows: histories };
      if (sql.includes("AS conflicting_owners")) return { rows: [{ conflicting_owners: owners }] };
      if (sql.includes("AS duplicate_slug_groups")) return { rows: [{ duplicate_slug_groups: slugs }] };
      throw new Error("Unexpected query");
    },
  };
}

test("migration inspection: empty database skips all absent tables and reports catalogs without writing", async () => {
  const client = fixture();
  const report = await inspectMigrationCatalog(client);
  assert.equal(client.queries.length, 5);
  assert.equal(report.schemas[0].history.status, "absent");
  assert.equal(report.schemas[0].owners.status, "structure_absent");
  assert.equal(report.schemas[0].slugs.status, "structure_absent");
  assert.deepEqual(report.btreeGist, { installed: false, available: true });
});

test("migration inspection: valid, failed, rolled-back, divergent and unknown history has safe statuses", () => {
  const [name, failed, divergent, rolled] = expectedMigrations;
  const checksum = createHash("sha256").update(readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url))).digest("hex");
  const summary = summarizeMigrationHistory([
    { migration_name: name, checksum, finished: true, rolled_back: false },
    { migration_name: failed, finished: false, rolled_back: false },
    { migration_name: divergent, checksum: "wrong", finished: true, rolled_back: false },
    { migration_name: rolled, finished: false, rolled_back: true },
    { migration_name: "password=synthetic-private-value", checksum: "synthetic-private-value", logs: "sensitive", finished: false },
  ]);
  assert.equal(summary.migrations[0].status, "applied");
  assert.equal(summary.migrations[1].status, "failed_or_incomplete");
  assert.equal(summary.migrations[2].status, "checksum_mismatch");
  assert.equal(summary.migrations[3].status, "pending");
  assert.equal(summary.unknownEntries, 1);
  assert.equal(JSON.stringify(summary).includes("synthetic-private-value"), false);
  assert.equal(summarizeMigrationHistory([{ migration_name: name, finished: true }, { migration_name: name, finished: true }]).migrations[0].status, "history_inconsistent");
});

test("migration inspection: existing structure gets conditional diagnostics without returning personal data", async () => {
  const client = fixture({
    relations: [table("_prisma_migrations"), table("BarbershopMembership"), table("Barbershop"), { schema_name: "private-person-name", table_name: "secret", relkind: "r" }],
    columns: [...historyFields.map(name => column("_prisma_migrations", name)), column("BarbershopMembership", "userId"), column("BarbershopMembership", "role"), column("Barbershop", "slug")],
    owners: "2", slugs: "1",
  });
  const report = await inspectMigrationCatalog(client);
  assert.equal(report.schemas[0].history.status, "present");
  assert.equal(report.schemas[0].owners.conflictingOwners, 2);
  assert.equal(report.schemas[0].slugs.duplicateGroups, 1);
  assert.equal(report.uninspectedSchemas, 1);
  assert.equal(JSON.stringify(report).includes("private-person-name"), false);
  assert.equal(client.queries.some(sql => sql.includes('"active" =')), false);
});

test("migration inspection: incomplete structures and views never trigger history/conflict queries", async () => {
  const client = fixture({ relations: [table("_prisma_migrations"), table("BarbershopMembership"), { ...table("Barbershop"), relkind: "v" }], columns: [column("Barbershop", "slug")] });
  const report = await inspectMigrationCatalog(client);
  assert.equal(report.schemas[0].history.status, "incompatible_structure");
  assert.equal(client.queries.length, 5);
});

test("migration inspection entry retains original empty check, identity order, read-only transaction and rollback", () => {
  const source = readFileSync(new URL("./neon/inspect-readonly.mjs", import.meta.url), "utf8");
  assert.ok(source.indexOf("await verifyNeonIdentity") < source.indexOf("await client.connect()"));
  assert.ok(source.indexOf('stage = "role_catalog"') < source.indexOf("await inspectMigrationCatalog(client)"));
  assert.ok(source.includes("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"));
  assert.ok(source.includes('client.query("ROLLBACK")'));
  assert.ok(source.includes('if (!migrationMode && role.can_create_schema !== true)'));
  assert.ok(source.includes('if (objects?.count !== 0) throw failure("USER_OBJECTS_PRESENT")'));
  assert.ok(source.includes('CORTZ_ALLOW_NEON_INSPECTION !== "read-only-test-project"'));
  const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
  assert.equal(scripts["neon:inspect"], "node tests/neon/inspect-readonly.mjs");
  assert.equal(scripts["neon:inspect:migrations"], "node tests/neon/inspect-readonly.mjs --migrations");
});

test("migration inspection: inspector URL is exclusive to migration mode and TLS remains mandatory", () => {
  const original = JSON.parse(readFileSync(new URL("./neon/project-identity.json", import.meta.url), "utf8"));
  assert.equal(original.role, "cortz_test_runner");
  const inspector = { ...original, role: "cortz_test_inspector" };
  const url = role => `postgresql://${role}:synthetic-only-password@${original.hostname}/${original.database}?sslmode=require`;
  assert.equal(normalizeInspectionConnection(url(inspector.role), inspector).user, inspector.role);
  assert.equal(normalizeInspectionConnection(url(original.role), original).user, original.role);
  for (const [value, expected] of [[url(inspector.role), original], [url(original.role), inspector]])
    assert.throws(() => normalizeInspectionConnection(value, expected), error => error.code === "ROLE_OR_DATABASE_URL_REJECTED");
  const connection = normalizeInspectionConnection(url(inspector.role), inspector);
  assert.equal(connection.ssl.rejectUnauthorized, true);
  assert.equal(connection.ssl.servername, original.hostname);
  const source = readFileSync(new URL("./neon/inspect-readonly.mjs", import.meta.url), "utf8");
  assert.ok(source.includes('if (migrationMode) identity.role = "cortz_test_inspector";'));
  assert.ok(source.indexOf('identity.role = "cortz_test_inspector"') < source.indexOf("normalizeInspectionConnection(process.env.CORTZ_TEST_DATABASE_URL, identity)"));
  assert.ok(source.includes("role.db !== identity.database || role.usr !== identity.role || role.session_usr !== identity.role"));
  assert.ok(source.includes("role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolreplication || role.rolbypassrls"));
  assert.ok(source.includes("role.memberships !== 0"));
});

test("migration inspection: column catalog avoids privilege-filtered information_schema and excludes dropped/system columns", async () => {
  const client = fixture({ relations: [table("Barbershop")], columns: [column("Barbershop", "slug")] });
  const report = await inspectMigrationCatalog(client);
  const query = client.queries.find(sql => sql.includes("FROM pg_catalog.pg_attribute a"));
  assert.ok(query.includes("a.attnum > 0 AND NOT a.attisdropped"));
  assert.equal(client.queries.some(sql => sql.includes("FROM information_schema.columns")), false);
  assert.equal(report.schemas[0].slugs.status, "checked");
  assert.equal(report.schemas[0].tables.find(item => item.name === "Barbershop").expectedColumns.find(item => item.name === "slug").present, true);
});
