import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  migrationTarget,
  migrationConfiguration,
  localMigrationConfiguration,
  validateMigrationSnapshot,
  validateMigrationRole,
  verifyMigrationDestination,
  migrationDiagnostic,
} from "./neon/migrate-policy.mjs";
import { expectedMigrations } from "./neon/migration-catalog.mjs";
import {
  localPrismaEngine,
  requirePinnedEngine,
  requireEngineVersion,
} from "./neon/local-prisma-engine.mjs";

const roleName = "cortz_test_executor"; // Synthetic local fixture, not a configured role.
const profile = { executorRole: roleName };
const env = () => ({
  CORTZ_ALLOW_TEST_MIGRATIONS: migrationTarget.projectId,
  CORTZ_EXECUTE_TEST_MIGRATIONS: "apply-reviewed-migrations",
  CORTZ_TEST_NEON_API_KEY: "synthetic-api-key",
  CORTZ_MIGRATION_DATABASE_URL: `postgresql://${roleName}:synthetic-password@${migrationTarget.hostname}/${migrationTarget.database}?sslmode=require&sslaccept=strict&schema=public`,
});
const rejectCode = (expected) => (error) => error.code === expected;
const goodRole = () => ({
  db: migrationTarget.database,
  usr: roleName,
  session_usr: roleName,
  expectedRole: roleName,
  readonly: "on",
  rolsuper: false,
  rolcreaterole: false,
  rolcreatedb: false,
  rolreplication: false,
  rolbypassrls: false,
  memberships: "0",
  schema_usage: true,
  schema_create: true,
  foreign_owned_tables: "0",
  extension_schema: "public",
});
const emptyReport = () => ({
  btreeGist: { installed: true },
  uninspectedSchemas: 0,
  unlistedRelations: 0,
  schemas: [
    {
      schema: "public",
      tables: [],
      owners: {},
      slugs: {},
      history: { status: "absent" },
    },
  ],
});

test("Prisma deployment: separate consent and unset executor prevent activation before any network", () => {
  assert.throws(
    () => migrationConfiguration({}, migrationTarget, profile),
    rejectCode("MIGRATION_CONSENT_REQUIRED"),
  );
  assert.throws(
    () =>
      migrationConfiguration(env(), migrationTarget, { executorRole: null }),
    rejectCode("MIGRATION_ROLE_NOT_CONFIGURED"),
  );
  const configured = env();
  const url = new URL(configured.CORTZ_MIGRATION_DATABASE_URL);
  url.username = "cortz_test_migrator";
  configured.CORTZ_MIGRATION_DATABASE_URL = url.href;
  assert.equal(
    localMigrationConfiguration(configured).scope.role,
    "cortz_test_migrator",
  );
  assert.throws(
    () => localMigrationConfiguration(env()),
    rejectCode("MIGRATION_SCOPE_REJECTED"),
  );
  for (const executorRole of [
    "cortz_test_inspector",
    "cortz_test_runner",
    "neon_superuser",
    "other",
  ])
    assert.throws(
      () => migrationConfiguration(env(), migrationTarget, { executorRole }),
      rejectCode("MIGRATION_ROLE_NOT_CONFIGURED"),
    );
  for (const key of [
    "DATABASE_URL",
    "DIRECT_URL",
    "PGHOST",
    "NODE_OPTIONS",
    "NODE_TLS_REJECT_UNAUTHORIZED",
    "PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK",
    "PRISMA_SCHEMA_ENGINE_BINARY",
  ])
    assert.throws(
      () =>
        migrationConfiguration(
          { ...env(), [key]: "synthetic" },
          migrationTarget,
          profile,
        ),
      rejectCode("IMPLICIT_CONFIGURATION_REJECTED"),
    );
});

test("Prisma deployment: existing pnpm engine matches installed dependency and rejects other binaries/versions", () => {
  const engine = localPrismaEngine();
  const prisma = JSON.parse(
    readFileSync(
      new URL("../node_modules/prisma/package.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(engine.version, prisma.dependencies["@prisma/engines"]);
  assert.match(engine.path, /schema-engine-windows\.exe$/);
  assert.match(engine.commit, /^[a-f0-9]{40}$/);
  requirePinnedEngine(engine.path, engine);
  requireEngineVersion(`schema-engine-cli ${engine.commit}\r\n`, engine);
  assert.throws(
    () => requirePinnedEngine(engine.path + ".other", engine),
    rejectCode("PRISMA_ENGINE_UNAVAILABLE"),
  );
  assert.throws(
    () => requireEngineVersion("schema-engine-cli wrong-version", engine),
    rejectCode("PRISMA_ENGINE_UNAVAILABLE"),
  );
  const config = readFileSync(
    new URL("./neon/migrate.config.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(
    config.indexOf(
      "requirePinnedEngine(process.env.PRISMA_SCHEMA_ENGINE_BINARY)",
    ) < config.indexOf("delete environment.PRISMA_SCHEMA_ENGINE_BINARY"),
  );
});

test("Prisma deployment: unknown tables/schemas, invalid indexes, unknown history and extension namespace remain blocked", () => {
  for (const patch of [{ unlistedRelations: 1 }, { uninspectedSchemas: 1 }])
    assert.throws(
      () =>
        validateMigrationSnapshot({ ...emptyReport(), ...patch }, goodRole()),
      rejectCode("MIGRATION_HISTORY_REJECTED"),
    );
  const report = emptyReport();
  report.schemas[0].tables = [
    { name: "Booking", present: true, invalidIndexes: 1 },
  ];
  assert.throws(
    () => validateMigrationSnapshot(report, goodRole()),
    rejectCode("MIGRATION_HISTORY_REJECTED"),
  );
  report.schemas[0].tables = [];
  report.schemas[0].history = {
    status: "present",
    unknownEntries: 1,
    migrations: [],
  };
  assert.throws(
    () => validateMigrationSnapshot(report, goodRole()),
    rejectCode("MIGRATION_HISTORY_REJECTED"),
  );
  assert.throws(
    () =>
      validateMigrationSnapshot(emptyReport(), {
        ...goodRole(),
        extension_schema: "other",
      }),
    rejectCode("MIGRATION_EXTENSION_REQUIRED"),
  );
});

test("Prisma deployment: exact API scope, public schema and strict TLS cannot be overridden", () => {
  const configuration = migrationConfiguration(env(), migrationTarget, profile);
  assert.equal(configuration.connection.ssl.rejectUnauthorized, true);
  assert.equal(
    configuration.connection.ssl.servername,
    migrationTarget.hostname,
  );
  assert.equal(configuration.scope.role, roleName);
  for (const key of Object.keys(migrationTarget))
    assert.throws(
      () =>
        migrationConfiguration(
          env(),
          { ...migrationTarget, [key]: "sparkling-union-52245638" },
          profile,
        ),
      rejectCode("MIGRATION_SCOPE_REJECTED"),
    );
  for (const change of [
    (url) => {
      url.hostname = "production.invalid";
    },
    (url) => {
      url.pathname = "/other";
    },
    (url) => {
      url.username = "cortz_test_inspector";
    },
    (url) => {
      url.searchParams.set("schema", "other");
    },
    (url) => {
      url.searchParams.set("sslaccept", "accept_invalid_certs");
    },
    (url) => {
      url.searchParams.set("channel_binding", "require");
    },
  ]) {
    const input = env(),
      url = new URL(input.CORTZ_MIGRATION_DATABASE_URL);
    change(url);
    input.CORTZ_MIGRATION_DATABASE_URL = url.href;
    assert.throws(() =>
      migrationConfiguration(input, migrationTarget, profile),
    );
  }
  assert.equal(
    migrationDiagnostic(new Error(env().CORTZ_MIGRATION_DATABASE_URL)),
    "CORTZ_TEST_MIGRATION_REFUSED: code=MIGRATION_FAILED",
  );
});

test("Prisma deployment: API failure prevents importing/connecting PostgreSQL", async () => {
  const configuration = migrationConfiguration(env(), migrationTarget, profile);
  let madeClient = false;
  await assert.rejects(
    verifyMigrationDestination(configuration, {
      verifyIdentity: async () => {
        throw new Error("synthetic API rejection");
      },
      makeClient: () => {
        madeClient = true;
        throw new Error();
      },
    }),
  );
  assert.equal(madeClient, false);
});

test("Prisma deployment: destination preflight is read-only, API precedes SQL and cleanup rolls back", async () => {
  const configuration = migrationConfiguration(env(), migrationTarget, profile),
    order = [];
  const url = await verifyMigrationDestination(configuration, {
    verifyIdentity: async (_remote, scope, _fetcher, options) => {
      assert.equal(scope.projectId, migrationTarget.projectId);
      assert.equal(options.allowOmittedRootParent, true);
      order.push("api");
    },
    makeClient: (options) => {
      assert.equal(order[0], "api");
      assert.ok(options.options.includes("default_transaction_read_only=on"));
      return {
        on() {},
        async connect() {
          order.push("connect");
        },
        async end() {
          order.push("end");
        },
        async query(sql) {
          assert.match(sql.trim(), /^(SELECT|BEGIN TRANSACTION|ROLLBACK)\b/);
          if (sql.startsWith("BEGIN")) {
            order.push("begin");
            return { rows: [] };
          }
          if (sql === "ROLLBACK") {
            order.push("rollback");
            return { rows: [] };
          }
          if (sql.includes("FROM pg_roles r")) return { rows: [goodRole()] };
          if (sql.includes("pg_available_extensions"))
            return { rows: [{ installed: true, available: true }] };
          return { rows: [] };
        },
      };
    },
  });
  assert.equal(url, configuration.url);
  assert.deepEqual(order, ["api", "connect", "begin", "rollback", "end"]);
});

test("Prisma deployment: privilege, identity and extension failures are never accepted", () => {
  validateMigrationSnapshot(emptyReport(), goodRole());
  for (const key of [
    "rolsuper",
    "rolcreaterole",
    "rolcreatedb",
    "rolreplication",
    "rolbypassrls",
  ])
    assert.throws(
      () => validateMigrationRole({ ...goodRole(), [key]: true }),
      rejectCode("MIGRATION_ROLE_REJECTED"),
    );
  for (const patch of [
    { usr: "other" },
    { session_usr: "other" },
    { db: "other" },
    { memberships: "1" },
    { readonly: "off" },
  ])
    assert.throws(
      () => validateMigrationRole({ ...goodRole(), ...patch }),
      rejectCode("MIGRATION_ROLE_REJECTED"),
    );
  for (const patch of [
    { schema_create: false },
    { schema_usage: false },
    { foreign_owned_tables: "1" },
  ])
    assert.throws(
      () => validateMigrationRole({ ...goodRole(), ...patch }),
      rejectCode("MIGRATION_PRIVILEGES_MISSING"),
    );
  const report = emptyReport();
  report.btreeGist.installed = false;
  assert.throws(
    () => validateMigrationSnapshot(report, goodRole()),
    rejectCode("MIGRATION_EXTENSION_REQUIRED"),
  );
});

test("Prisma deployment: history must be a valid prefix; no automatic baseline or conflict resolution", () => {
  const report = emptyReport(),
    snapshot = report.schemas[0];
  snapshot.tables = [{ name: "Booking", present: true }];
  assert.throws(
    () => validateMigrationSnapshot(report, goodRole()),
    rejectCode("MIGRATION_BASELINE_REVIEW_REQUIRED"),
  );
  snapshot.tables = [];
  snapshot.history = {
    status: "present",
    unknownEntries: 0,
    migrations: expectedMigrations.map((name) => ({ name, status: "pending" })),
  };
  validateMigrationSnapshot(report, goodRole());
  snapshot.history.migrations[0].status = "applied";
  validateMigrationSnapshot(report, goodRole());
  for (const status of [
    "failed_or_incomplete",
    "checksum_mismatch",
    "history_inconsistent",
  ]) {
    snapshot.history.migrations[1].status = status;
    assert.throws(
      () => validateMigrationSnapshot(report, goodRole()),
      rejectCode("MIGRATION_HISTORY_REJECTED"),
    );
  }
  snapshot.history.migrations[1].status = "pending";
  snapshot.history.migrations[2].status = "applied";
  assert.throws(
    () => validateMigrationSnapshot(report, goodRole()),
    rejectCode("MIGRATION_HISTORY_REJECTED"),
  );
  snapshot.history.migrations[2].status = "pending";
  snapshot.owners.conflictingOwners = 1;
  assert.throws(
    () => validateMigrationSnapshot(report, goodRole()),
    rejectCode("MIGRATION_CONFLICTS"),
  );
});

test("Prisma deployment: isolated config uses Migrate history without dotenv, seeds, reset or fixtures", () => {
  const source = (path) =>
    readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const config = source("tests/neon/migrate.config.mjs"),
    launcher = source("tests/neon/migrate-deploy.mjs");
  assert.ok(
    config.indexOf("await verifyMigrationDestination") <
      config.indexOf("export default defineConfig"),
  );
  assert.equal(/import .*dotenv|seed:|shadowDatabaseUrl/.test(config), false);
  assert.match(launcher, /"migrate",\s*"deploy",\s*"--config"/);
  assert.equal(
    /"reset"|"resolve"|"db"|suite\.mjs|remote-run\.mjs/.test(launcher),
    false,
  );
  assert.equal(launcher.includes("process.stdout.write"), false);
  assert.equal(expectedMigrations.length, 8);
});
