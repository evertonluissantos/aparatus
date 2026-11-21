import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Fixed repository migrations only. Never print names/checksums/logs returned by DB.
export const expectedMigrations = [
  "20260531182517_init",
  "20261107120000_legacy_stripe_inbox",
  "20261107130000_booking_model_expansion",
  "20261107140000_tenant_authorization",
  "20261107150000_booking_transaction_guards",
  "20261107160000_single_owner",
  "20261107170000_saas_persistence",
  "20261120120000_manual_pix_subscription",
];
const tables = ["_prisma_migrations", "user", "account", "session", "verification", "Barbershop", "BarbershopMembership", "GlobalAdmin", "BarbershopService", "Professional", "ProfessionalService", "WorkingHours", "ScheduleBlock", "Booking", "BookingCommand", "Customer", "LegacyStripeEvent", "LegacyStripeAttempt", "LegacyStripeOperation", "ManualPixPayment"];
const historyColumns = ["migration_name", "checksum", "finished_at", "rolled_back_at", "applied_steps_count"];
// Inventory names come from local source, never arbitrary database strings.
const definitions = expectedMigrations.map(name => readFileSync(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8")).join("\n");
const knownIndexes = new Set([...definitions.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map(match => match[1]));
const knownConstraints = new Set([...definitions.matchAll(/CONSTRAINT "([^"]+)"/g)].map(match => match[1]));
const expectedColumns = Object.fromEntries([...readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8").matchAll(/model (\w+)\s*\{([^}]+)\}/g)].map(([, model, body]) => [
  body.match(/@@map\("([^"]+)"\)/)?.[1] ?? model,
  [...body.matchAll(/^\s*(\w+)\s+(?:String|Int|Boolean|DateTime|BookingStatus|ScheduleBlockKind|BarbershopRole)(?:\?|\[\])?(?=\s|$)/gm)].map(match => match[1]),
]));
const allowedSchema = name => name === "public" || /^cortz_run_[a-f0-9]{32}$/.test(name);
const count = value => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("Invalid catalog count");
  return result;
};
const checksum = name => createHash("sha256").update(readFileSync(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url))).digest("hex");

export function summarizeMigrationHistory(rows) {
  return {
    unknownEntries: rows.filter(row => !expectedMigrations.includes(row.migration_name)).length,
    migrations: expectedMigrations.map(name => {
      const entries = rows.filter(row => row.migration_name === name && !row.rolled_back);
      const completed = entries.filter(row => row.finished === true);
      let status = "pending";
      if (entries.some(row => row.finished !== true)) status = "failed_or_incomplete";
      else if (completed.length > 1) status = "history_inconsistent";
      else if (completed.length === 1) status = completed[0].checksum === checksum(name) ? "applied" : "checksum_mismatch";
      return { name, status };
    }),
  };
}

// Called ONLY after API identity, database/role and READ ONLY checks in the shared
// entry point. This module cannot create a connection or execute migration SQL.
export async function inspectMigrationCatalog(client) {
  const { rows: relations } = await client.query(`SELECT n.nspname AS schema_name, c.relname AS table_name, c.relkind
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','f')`);
  const { rows: columns } = await client.query(`SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name
    FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','f')
      AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'`);
  const { rows: indexes } = await client.query(`SELECT n.nspname AS schema_name, t.relname AS table_name, ic.relname AS index_name, i.indisvalid, i.indisready
    FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class t ON t.oid=i.indrelid
    JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'`);
  const { rows: constraints } = await client.query(`SELECT n.nspname AS schema_name, t.relname AS table_name, c.conname AS constraint_name, c.contype, c.convalidated
    FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'`);
  const { rows: [extension] } = await client.query(`SELECT
    EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname='btree_gist') AS installed,
    EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name='btree_gist') AS available`);
  const schemas = [...new Set(relations.map(row => row.schema_name).filter(allowedSchema))].sort();
  if (!schemas.includes("public")) schemas.unshift("public");
  const reports = [];
  for (const schema of schemas) {
    // The whitelist excludes arbitrary identifiers; never query a view/foreign table.
    const hasTable = table => relations.some(row => row.schema_name === schema && row.table_name === table && ["r", "p"].includes(row.relkind));
    const hasColumns = (table, names) => names.every(name => columns.some(row => row.schema_name === schema && row.table_name === table && row.column_name === name));
    const report = {
      schema,
      tables: tables.map(table => ({
        name: table, present: hasTable(table),
        columns: columns.filter(row => row.schema_name === schema && row.table_name === table).length,
        expectedColumns: (expectedColumns[table] ?? historyColumns).map(name => ({ name, present: hasColumns(table, [name]) })),
        indexes: indexes.filter(row => row.schema_name === schema && row.table_name === table).length,
        invalidIndexes: indexes.filter(row => row.schema_name === schema && row.table_name === table && (row.indisvalid !== true || row.indisready !== true)).length,
        constraints: constraints.filter(row => row.schema_name === schema && row.table_name === table).length,
        unvalidatedConstraints: constraints.filter(row => row.schema_name === schema && row.table_name === table && row.convalidated !== true).length,
        knownIndexNames: indexes.filter(row => row.schema_name === schema && row.table_name === table && knownIndexes.has(row.index_name)).map(row => row.index_name),
        knownConstraintNames: constraints.filter(row => row.schema_name === schema && row.table_name === table && knownConstraints.has(row.constraint_name)).map(row => row.constraint_name),
      })),
      history: { status: "absent" },
      owners: { status: "structure_absent" },
      slugs: { status: "structure_absent" },
    };
    if (hasTable("_prisma_migrations")) {
      if (!hasColumns("_prisma_migrations", historyColumns)) report.history = { status: "incompatible_structure" };
      else {
        const { rows } = await client.query(`SELECT migration_name, checksum, finished_at IS NOT NULL AS finished,
          rolled_back_at IS NOT NULL AS rolled_back, applied_steps_count FROM "${schema}"."_prisma_migrations"`);
        report.history = { status: "present", ...summarizeMigrationHistory(rows) };
      }
    }
    if (hasTable("BarbershopMembership") && hasColumns("BarbershopMembership", ["userId", "role"])) {
      const { rows: [row] } = await client.query(`SELECT count(*) AS conflicting_owners FROM (
        SELECT "userId" FROM "${schema}"."BarbershopMembership" WHERE "role"::text='OWNER'
        GROUP BY "userId" HAVING count(*) > 1) AS conflicts`);
      report.owners = { status: "checked", conflictingOwners: count(row.conflicting_owners) };
    }
    if (hasTable("Barbershop") && hasColumns("Barbershop", ["slug"])) {
      const { rows: [row] } = await client.query(`SELECT count(*) AS duplicate_slug_groups FROM (
        SELECT "slug" FROM "${schema}"."Barbershop" WHERE "slug" IS NOT NULL
        GROUP BY "slug" HAVING count(*) > 1) AS conflicts`);
      report.slugs = { status: "checked", duplicateGroups: count(row.duplicate_slug_groups) };
    }
    reports.push(report);
  }
  return {
    btreeGist: { installed: extension?.installed === true, available: extension?.available === true },
    uninspectedSchemas: new Set(relations.map(row => row.schema_name).filter(name => !allowedSchema(name))).size,
    unlistedRelations: relations.filter(row => !allowedSchema(row.schema_name) || !tables.includes(row.table_name) || !["r", "p"].includes(row.relkind)).length,
    schemas: reports,
  };
}
