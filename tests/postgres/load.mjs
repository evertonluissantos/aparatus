import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import * as zod from "zod";

// Integration-only loader: no Next/app config, lib/prisma, auth provider or Stripe.
// The process must already be protected by postgres/guard.mjs.
function createLoader(database, userId) {
  const cache = new Map();
  const allowed = new Set([
    "lib/authorization.ts",
    "lib/bookings/postgres.ts",
    "lib/bookings/availability.ts",
    "lib/bookings/rules.ts",
    "lib/bookings/timezone.ts",
    "lib/legacy-stripe/store.ts",
    "lib/legacy-stripe/process-event.ts",
  ]);
  function load(file) {
    if (!allowed.has(file)) throw new Error("Integration import blocked");
    if (cache.has(file)) return cache.get(file);
    const output = ts.transpileModule(
      readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
        fileName: file,
      },
    ).outputText;
    const exports = {};
    cache.set(file, exports);
    new vm.Script(output, { filename: file }).runInNewContext(
      {
        exports,
        Date,
        Intl,
        require: (id) => {
          if (id === "server-only") return {};
          if (id === "node:crypto") return { randomUUID };
          if (id === "zod") return zod;
          if (id === "next/headers") return { headers: async () => ({}) };
          if (id === "@/lib/prisma") return { prisma: database };
          if (id === "@/lib/auth")
            return {
              auth: {
                api: { getSession: async () => ({ user: { id: userId } }) },
              },
            };
          if (id.startsWith("./"))
            return load(posix.join(posix.dirname(file), `${id}.ts`));
          throw new Error("Integration import blocked");
        },
      },
      { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } },
    );
    return exports;
  }
  return load;
}
export function loadAdapter(database, userId) {
  const load = createLoader(database, userId);
  return load("lib/bookings/postgres.ts").createPostgresBookingAdapter(
    database,
    load("lib/authorization.ts"),
    () => new Date("2030-01-01T00:00:00Z"),
  );
}
export function loadLegacy(database) {
  return createLoader(
    database,
    "synthetic-unused",
  )("lib/legacy-stripe/process-event.ts");
}
