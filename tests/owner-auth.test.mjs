import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadProduction } from "./load-production.mjs";

const policy = loadProduction("lib/owner-auth-policy.ts", {});

test("owner auth: schemas validate registration, preserve passwords and reject mismatches", () => {
  const input = {
    name: " Pessoa Fictícia ",
    email: " pessoa@example.invalid ",
    password: "  ficticia123456  ",
    confirmPassword: "  ficticia123456  ",
  };
  const parsed = policy.ownerRegistrationSchema.parse(input);
  assert.equal(parsed.name, "Pessoa Fictícia");
  assert.equal(parsed.email, "pessoa@example.invalid");
  assert.equal(parsed.password, input.password);
  for (const change of [
    { name: "" },
    { email: "inválido" },
    { password: "curta", confirmPassword: "curta" },
    { password: "a".repeat(129), confirmPassword: "a".repeat(129) },
    { confirmPassword: "outra senha" },
  ])
    assert.equal(
      policy.ownerRegistrationSchema.safeParse({ ...input, ...change }).success,
      false,
    );
  assert.equal(
    policy.ownerLoginSchema.safeParse({
      email: "pessoa@example.invalid",
      password: "senha-legada",
    }).success,
    true,
  );
  assert.equal(
    policy.ownerLoginSchema.safeParse({
      email: "pessoa@example.invalid",
      password: "",
    }).success,
    false,
  );
});

test("owner auth: email/password remains disabled in actual Better Auth configuration", () => {
  const { auth } = loadProduction("lib/auth.ts", {
    "better-auth": { betterAuth: (options) => options },
    "better-auth/adapters/prisma": { prismaAdapter: () => "mock-adapter" },
    "./prisma": { prisma: {} },
    "./owner-auth-policy": policy,
  });
  assert.equal(auth.emailAndPassword.enabled, false);
  assert.equal(auth.emailAndPassword.minPasswordLength, 12);
  assert.equal(auth.emailAndPassword.maxPasswordLength, 128);
  assert.equal(auth.socialProviders.google, undefined);
  assert.equal(policy.OWNER_AUTH_CALLBACK, "/painel");
  for (const operation of ["login", "register", "google", "logout"])
    assert.equal(
      /password|token|https?:\/\/|@/.test(
        policy.ownerAuthErrorMessage(operation),
      ),
      false,
    );
});

test("management access: disabled rollout denies production and never loads auth/database in local preview", async () => {
  assert.equal(policy.disabledManagementAccess("production"), "unavailable");
  assert.equal(policy.disabledManagementAccess(undefined), "unavailable");
  assert.equal(policy.disabledManagementAccess("development"), "demo");
  const access = loadProduction("lib/management-access.ts", {
    "server-only": {},
    "./owner-auth-policy": policy,
    // No authorization/Prisma mock: any attempt to import them fails this test.
  });
  assert.equal(await access.managementAccess("owner"), "demo");
  assert.equal(await access.managementAccess("global"), "demo");
  assert.equal(await access.managementAccess("unexpected"), "forbidden");
  const missingDependencies = loadProduction("lib/management-access.ts", {
    "server-only": {},
    "./owner-auth-policy": { ...policy, OWNER_AUTH_ENABLED: true },
  });
  assert.equal(
    await missingDependencies.managementAccess("owner"),
    "unavailable",
  );
});

test("owner auth: explicit server rollout enables credentials and Google only when configured", () => {
  const enabled = loadProduction("lib/owner-auth-policy.ts", {
    "test:environment": { CORTZ_PERSISTENCE_ENABLED: "true" },
  });
  assert.equal(enabled.OWNER_AUTH_ENABLED, true);
  const { auth } = loadProduction("lib/auth.ts", {
    "test:environment": {
      GOOGLE_CLIENT_ID: "synthetic-client",
      GOOGLE_CLIENT_SECRET: "synthetic-secret",
    },
    "better-auth": { betterAuth: (options) => options },
    "better-auth/adapters/prisma": { prismaAdapter: () => "mock-adapter" },
    "./prisma": { prisma: {} },
    "./owner-auth-policy": enabled,
  });
  assert.equal(auth.emailAndPassword.enabled, true);
  assert.equal(auth.socialProviders.google.clientId, "synthetic-client");
});

test("management access: prepared server guard redirects anonymous, rejects owner at global and fails closed", async () => {
  class AuthorizationError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }
  let ownerCalls = 0,
    globalCalls = 0,
    globalPermission;
  let failure = new AuthorizationError("UNAUTHENTICATED");
  const access = loadProduction("lib/management-access.ts", {
    "server-only": {},
    "./owner-auth-policy": { ...policy, OWNER_AUTH_ENABLED: true },
    "./authorization": {
      AuthorizationError,
      requireOwnerPanelAccess: async () => {
        ownerCalls++;
        if (failure) throw failure;
      },
      requireGlobalPermission: async (permission) => {
        globalCalls++;
        globalPermission = permission;
        if (failure) throw failure;
      },
    },
  });
  assert.equal(await access.managementAccess("owner"), "login");
  failure = new AuthorizationError("FORBIDDEN");
  assert.equal(await access.managementAccess("global"), "forbidden");
  assert.equal(globalPermission, "subscriptions:read");
  assert.equal(ownerCalls, 1);
  assert.equal(globalCalls, 1);
  failure = new Error("mock missing tables, sensitive details not returned");
  assert.equal(await access.managementAccess("global"), "unavailable");
  failure = null;
  assert.equal(await access.managementAccess("owner"), "authorized");
  assert.equal(await access.managementAccess("global"), "authorized");
});

test("owner server authorization: validates session, owner identity, suspension and duplicate ownership", async () => {
  let userId = null,
    rows = [],
    queries = 0;
  const auth = loadProduction("lib/authorization.ts", {
    "server-only": {},
    "next/headers": { headers: async () => ({}) },
    "@/lib/auth": {
      auth: {
        api: {
          getSession: async () =>
            userId ? { user: { id: userId, role: "GLOBAL_ADMIN" } } : null,
        },
      },
    },
    "@/lib/prisma": {
      prisma: {
        $queryRaw: async (_sql, ...values) => {
          queries++;
          assert.equal(values[0], userId);
          return rows;
        },
      },
    },
  });
  await assert.rejects(
    auth.requireOwnerPanelAccess(),
    (error) => error.code === "UNAUTHENTICATED",
  );
  assert.equal(queries, 0);
  userId = "user-fictitious";
  assert.equal((await auth.requireOwnerPanelAccess()).barbershopId, null);
  const owner = {
    id: "membership-a",
    userId,
    barbershopId: "shop-a",
    role: "OWNER",
    active: true,
  };
  rows = [owner];
  assert.equal((await auth.requireOwnerPanelAccess()).barbershopId, "shop-a");
  for (const invalid of [
    [{ ...owner, active: false }],
    [{ ...owner, userId: "other" }],
    [{ ...owner, role: "MANAGER" }],
    [owner, { ...owner, barbershopId: "shop-b", active: false }],
  ]) {
    rows = invalid;
    await assert.rejects(
      auth.requireOwnerPanelAccess(),
      (error) => error.code === "FORBIDDEN",
    );
  }
});

test("management routes: both owner aliases and all global sections use server gate; auth page uses fixed redirect", () => {
  const source = (path) =>
    readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.ok(
    source("app/admin/layout.tsx").includes('ManagementGate area="owner"'),
  );
  assert.ok(source("app/painel/layout.tsx").includes("../admin/layout"));
  assert.ok(
    source("app/gestao/layout.tsx").includes('ManagementGate area="global"'),
  );
  assert.ok(
    source("app/admin/_components/management-gate.tsx").includes(
      'redirect("/acesso/proprietario")',
    ),
  );
  const form = source("app/acesso/proprietario/owner-auth-form.tsx");
  assert.ok(form.includes("!OWNER_AUTH_ENABLED"));
  assert.equal(
    /localStorage|sessionStorage|console\.|signIn\.anonymous/.test(form),
    false,
  );
});
