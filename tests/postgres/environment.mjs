// Keep local guard unchanged. Remote mode has its own identity/TLS/network policy.
const remote=process.env.CORTZ_TEST_MODE === "postgres-neon";
const environment=remote?await import("../neon/guard.mjs"):await import("./guard.mjs");
export const configuration=environment.configuration;
export const remoteMode=remote;
export const testSchema=remote?environment.testSchema:"public";
export const isolatedClientPath=remote?environment.isolatedClientPath:null;
