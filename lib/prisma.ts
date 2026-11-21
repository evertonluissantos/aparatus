// lib/prisma.ts

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let connectionString = process.env.DATABASE_URL;
if (process.env.CORTZ_PERSISTENCE_ENABLED === "true" && !connectionString)
  throw new Error(
    "Configure a conexão exclusiva da aplicação antes de ativar a persistência.",
  );
if (connectionString) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Configuração PostgreSQL inválida.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    url.hash
  )
    throw new Error("Configuração PostgreSQL inválida.");
  if (
    process.env.CORTZ_PERSISTENCE_ENABLED === "true" &&
    [
      "neondb_owner",
      "cortz_test_runner",
      "cortz_test_migrator",
      "cortz_test_inspector",
    ].includes(decodeURIComponent(url.username))
  )
    throw new Error(
      "Configure uma role exclusiva da aplicação, sem privilégios administrativos.",
    );
  // Normalize only in memory; pg's URL parser must retain full TLS verification.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    url.searchParams.set("sslmode", "verify-full");
  connectionString = url.href;
}

const adapter = new PrismaPg({ connectionString, max: 5 });

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
