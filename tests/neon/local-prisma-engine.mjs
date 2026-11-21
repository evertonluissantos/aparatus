import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrationFailure } from "./migrate-policy.mjs";

// Resolve the declared dependency only; never pick an arbitrary cached version,
// load a package's postinstall code, install, download, or read application env.
export function localPrismaEngine() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const prismaJson = join(root, "node_modules", "prisma", "package.json");
  const prisma = JSON.parse(readFileSync(prismaJson, "utf8"));
  const version = prisma.dependencies?.["@prisma/engines"];
  if (process.platform !== "win32" || !/^\d+\.\d+\.\d+$/.test(version ?? ""))
    throw migrationFailure("PRISMA_ENGINE_UNAVAILABLE");
  const requirePrisma = createRequire(prismaJson);
  let packagePath;
  try {
    packagePath = requirePrisma.resolve("@prisma/engines/package.json");
  } catch {
    packagePath = join(
      root,
      "node_modules",
      ".pnpm",
      `@prisma+engines@${version}`,
      "node_modules",
      "@prisma",
      "engines",
      "package.json",
    );
  }
  if (!existsSync(packagePath))
    throw migrationFailure("PRISMA_ENGINE_UNAVAILABLE");
  const engines = JSON.parse(readFileSync(packagePath, "utf8"));
  const commit =
    engines.dependencies?.["@prisma/engines-version"]?.match(
      /\.([a-f0-9]{40})$/,
    )?.[1];
  const path = join(dirname(packagePath), "schema-engine-windows.exe");
  if (
    engines.name !== "@prisma/engines" ||
    engines.version !== version ||
    !commit ||
    !existsSync(path)
  )
    throw migrationFailure("PRISMA_ENGINE_UNAVAILABLE");
  return { path: realpathSync(path), version, commit };
}

export function requirePinnedEngine(value, engine = localPrismaEngine()) {
  if (!value || resolve(value) !== engine.path)
    throw migrationFailure("PRISMA_ENGINE_UNAVAILABLE");
}

export function requireEngineVersion(output, engine) {
  if (output.trim() !== `schema-engine-cli ${engine.commit}`)
    throw migrationFailure("PRISMA_ENGINE_UNAVAILABLE");
}
