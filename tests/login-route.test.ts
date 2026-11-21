import assert from "node:assert/strict";
import test from "node:test";
import config from "../next.config";

test("/login redirects to the existing Better Auth access page", async () => {
  const rules = await config.redirects!();
  assert.deepEqual(rules.find((rule) => rule.source === "/login"), {
    source: "/login",
    destination: "/acesso/proprietario",
    permanent: false,
  });
  assert.equal(rules.some((rule) => rule.source === "/acesso/proprietario"), false);
});
