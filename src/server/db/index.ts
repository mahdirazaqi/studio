import "server-only";

import { PrismaClient } from "@prisma/client";

import { env } from "@/server/env";

/**
 * The single Prisma Client instance for the whole application.
 *
 * Only repositories (`src/features/<feature>/repository/*.ts`) import this. Nothing else
 * imports `@prisma/client` or constructs a `PrismaClient` — see
 * docs/architecture/database.md and docs/architecture/project-structure.md.
 *
 * Next.js dev mode reloads modules on every change; without the `globalThis`
 * cache below, each reload would create a brand new `PrismaClient` (and a new
 * connection pool) without closing the previous one, quickly exhausting
 * Postgres connections. Caching the instance on `globalThis` in development
 * survives the module reload. Production has one long-lived process, so no
 * caching is needed there.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
