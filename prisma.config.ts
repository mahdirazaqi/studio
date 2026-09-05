import path from "node:path";

import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (replaces the deprecated `package.json#prisma`
 * field). See docs/architecture/database.md for the full migration/seed
 * workflow.
 *
 * A `prisma.config.ts` file makes the Prisma CLI stop auto-loading `.env` —
 * we load it ourselves so `prisma migrate` / `prisma validate` etc. still see
 * `DATABASE_URL` in local development. In CI/production the real environment
 * already provides it and no `.env` file exists, so this is a no-op there.
 *
 * The seed command runs with `--conditions=react-server` so that `import
 * "server-only"` (present in `@/server/env`, `@/server/auth/password`, ...)
 * resolves to its no-op export instead of throwing — the same condition
 * Next.js's own bundler applies for React Server Components, here applied to
 * plain Node so the seed script can reuse those modules unmodified.
 */
try {
  process.loadEnvFile(path.join(import.meta.dirname, ".env"));
} catch {
  // No .env file (CI, production) — the real environment already provides
  // the required variables.
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "node --conditions=react-server --import tsx prisma/seed.ts",
  },
});
