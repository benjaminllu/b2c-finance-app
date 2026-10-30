import { PrismaClient } from "@prisma/client";

export * from "./mappers";
export { Prisma } from "@prisma/client";
export type { PrismaClient } from "@prisma/client";

/** True when a Postgres database is configured. Without one the app reads seed JSON. */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Shared client; reused across hot reloads in dev. */
export function getPrisma(): PrismaClient {
  if (!hasDatabase()) throw new Error("DATABASE_URL is not set");
  globalForPrisma.prisma ??= new PrismaClient();
  return globalForPrisma.prisma;
}
