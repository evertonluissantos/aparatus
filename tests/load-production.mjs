import { readFileSync } from "node:fs";
import vm from "node:vm";
import { posix } from "node:path";
import ts from "typescript";
import * as zod from "zod";
import * as dateFns from "date-fns";
import { assertSafeEnvironment } from "./guard.mjs";

const sources = new Set([
  "app/_actions/create-booking.ts",
  "app/_actions/create-booking-checkout-session.ts",
  "app/_actions/get-date-available-time-slots.ts",
  "app/_actions/cancel-booking.ts",
  "app/api/stripe/webhook/route.ts",
  "lib/legacy-stripe/process-event.ts",
  "lib/legacy-stripe/store.ts",
  "lib/authorization.ts",
  "lib/auth.ts",
  "lib/owner-auth-policy.ts",
  "lib/management-access.ts",
  "lib/manual-pix.ts",
  "lib/global-management.ts",
  "lib/mvp-http.ts",
  "lib/owner-store.ts",
  "lib/mvp-bookings.ts",
  "lib/prisma.ts",
  "lib/bookings/types.ts",
  "lib/bookings/rules.ts",
  "lib/bookings/timezone.ts",
  "lib/bookings/availability.ts",
  "lib/bookings/core.ts",
  "lib/bookings/postgres.ts",
]);

export class ValidationError extends Error {}

// Only the framework wrapper is simulated; schemas and production callbacks run.
export const actionClient = {
  inputSchema: (schema) => ({
    action: (handler) => (input) =>
      handler({ parsedInput: schema.parse(input) }),
  }),
};

export function loadProduction(file, mocks, cache = new Map()) {
  assertSafeEnvironment(process.env);
  if (!sources.has(file))
    throw new Error("Production source is not allowlisted");
  if (cache.has(file)) return cache.get(file);
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: file,
  });
  const exports = {};
  cache.set(file, exports);
  const context = vm.createContext(
    {
      exports,
      Date,
      URL,
      Buffer,
      process: {
        env: Object.freeze({
          NODE_ENV: "test",
          STRIPE_SECRET_KEY: "mock-only-not-a-stripe-key",
          STRIPE_WEBHOOK_SECRET: "mock-only-not-a-webhook-secret",
          ...mocks["test:environment"],
        }),
      },
      console: { error() {} },
      require: (id) => {
        if (Object.hasOwn(mocks, id)) return mocks[id];
        if (file.startsWith("lib/bookings/") && id.startsWith("./")) {
          return loadProduction(
            posix.join(posix.dirname(file), `${id}.ts`),
            mocks,
            cache,
          );
        }
        if (id === "zod") return zod;
        if (id === "date-fns") return dateFns;
        throw new Error(`Unmocked import blocked: ${id}`);
      },
    },
    { codeGeneration: { strings: false, wasm: false } },
  );
  new vm.Script(outputText, { filename: file }).runInContext(context, {
    timeout: 1_000,
  });
  return exports;
}

export function dependencies(prisma, userId = "customer-a", Stripe) {
  return {
    "@/lib/prisma": { prisma },
    "@/lib/legacy-stripe/process-event": {
      receiveLegacyStripeEvent: async () => {
        throw new Error("Unexpected legacy processing");
      },
    },
    "@/lib/auth": {
      auth: {
        api: {
          getSession: async () => (userId ? { user: { id: userId } } : null),
        },
      },
    },
    "@/lib/action-client": { actionClient },
    "next-safe-action": {
      returnValidationErrors: (_schema, errors) => {
        throw new ValidationError(errors._errors[0]);
      },
    },
    "next/headers": { headers: async () => ({}) },
    "next/cache": { revalidatePath() {} },
    "next/server": {
      NextResponse: {
        error: () => ({ status: 500 }),
        json: (body, init) => ({ status: init?.status ?? 200, body }),
      },
    },
    stripe:
      Stripe ??
      class {
        constructor() {
          throw new Error("Unexpected Stripe usage");
        }
      },
  };
}
