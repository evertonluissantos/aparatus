import { isAbsolute, win32 } from "node:path";

export function requireDisposableOptIn(env) {
  const bin = env.CORTZ_POSTGRES_BIN;
  if (
    env.CORTZ_RUN_POSTGRES !== "disposable-local" ||
    typeof bin !== "string" ||
    !bin ||
    !(isAbsolute(bin) || win32.isAbsolute(bin)) ||
    bin.startsWith("\\\\") ||
    bin.startsWith("//")
  ) {
    throw new Error(
      "Explicit disposable-local opt-in and absolute local CORTZ_POSTGRES_BIN are required; no connection attempted",
    );
  }
  if (
    Object.keys(env).some(
      (key) =>
        /DATABASE_URL|^PG(HOST|PORT|DATABASE|USER|PASSWORD|SERVICE|OPTIONS|PASSFILE)|NODE_OPTIONS|DOTENV/i.test(
          key,
        ) && env[key],
    )
  ) {
    throw new Error("External database/preload configuration is not accepted");
  }
  return bin;
}
