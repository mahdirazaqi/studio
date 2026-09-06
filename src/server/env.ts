import "server-only";

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment configuration.
 *
 * - `server`: secrets and server-only config. Never sent to the client.
 * - `client`: values safe to expose in the browser. MUST be prefixed `NEXT_PUBLIC_`.
 * - A missing or malformed **required** variable fails the process at startup
 *   with a clear message (see `onValidationError`).
 *
 * Phase 1 keeps this minimal on purpose. Add variables here as features need
 * them (database URL, worker credential, Telegram token, ...). Do not read
 * `process.env` directly anywhere else — import `env` from this module.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    /** Structured log level. */
    LOG_LEVEL: z
      .enum(["debug", "info", "warn", "error", "silent"])
      .default("info"),

    /**
     * Absolute base URL of this deployment, used for building absolute links
     * (e.g. in notifications) and for CORS/webhook configuration later.
     * Optional in development.
     */
    APP_URL: z.url().optional(),

    /**
     * PostgreSQL connection string (Prisma). Required — Phase 2 introduces the
     * persistent data layer (ADR-0002). See docs/architecture/database.md.
     */
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required (see .env.example)."),

    /** Name of the session cookie (docs/architecture/authentication.md, ADR-0020). */
    SESSION_COOKIE_NAME: z.string().min(1).default("studio_session"),

    /** How long an issued session stays valid before the user must sign in again. */
    SESSION_DURATION_DAYS: z.coerce.number().int().min(1).max(365).default(30),

    /**
     * Filesystem root for the local storage adapter (docs/architecture/files.md,
     * ADR-0024). Relative paths resolve against the process working directory.
     * Must be outside `public/` — files are served only through the
     * authenticated `/api/files/[fileId]` route, never as static assets.
     */
    STORAGE_LOCAL_DIR: z.string().min(1).default(".data/storage"),

    /**
     * Local development seed (`prisma/seed.ts`) only — never read by the running
     * application. All optional; when unset the seed creates the development
     * Department but skips creating an admin user. Never a real/production
     * credential — see .env.example.
     */
    SEED_DEPARTMENT_NAME: z.string().min(1).optional(),
    SEED_ADMIN_EMAIL: z.email().optional(),
    SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
    SEED_ADMIN_NAME: z.string().min(1).optional(),

    /**
     * Job retry eligibility window, in days from the original Job's creation
     * (docs/domain/jobs.md "Retry", resolves OD-02). Legacy hard-coded 3 days.
     */
    JOB_RETRY_WINDOW_DAYS: z.coerce.number().int().min(1).max(365).default(3),

    /**
     * Global daily cap on upload-enabled (`deliverToYouTube: true`) Jobs,
     * reset at UTC midnight (docs/domain/jobs.md "Upload cap", ADR-0030).
     * Legacy hard-coded 3. Kept global for Phase 6 — no `YouTubeTarget` model
     * exists yet to scope a per-target cap against (OD-01 stays open on that
     * count).
     */
    JOB_UPLOAD_DAILY_CAP: z.coerce.number().int().min(0).default(3),
  },

  client: {
    // No client-exposed variables yet. Anything added here must start with
    // `NEXT_PUBLIC_` and must never carry a secret.
  },

  /**
   * Next.js does not bundle `process.env` on the client by key access, so
   * client variables must be listed explicitly.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
    SESSION_DURATION_DAYS: process.env.SESSION_DURATION_DAYS,
    STORAGE_LOCAL_DIR: process.env.STORAGE_LOCAL_DIR,
    SEED_DEPARTMENT_NAME: process.env.SEED_DEPARTMENT_NAME,
    SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
    SEED_ADMIN_NAME: process.env.SEED_ADMIN_NAME,
    JOB_RETRY_WINDOW_DAYS: process.env.JOB_RETRY_WINDOW_DAYS,
    JOB_UPLOAD_DAILY_CAP: process.env.JOB_UPLOAD_DAILY_CAP,
  },

  /** Treat empty strings as undefined so blank .env lines don't pass validation. */
  emptyStringAsUndefined: true,

  /** Allow builds/lint without a full env (e.g. CI type-check). */
  skipValidation:
    process.env.SKIP_ENV_VALIDATION === "1" ||
    process.env.SKIP_ENV_VALIDATION === "true",

  onValidationError: (issues) => {
    const lines = issues.map((issue) => {
      const path = (issue.path ?? [])
        .map((seg) =>
          typeof seg === "object" && seg !== null && "key" in seg
            ? String(seg.key)
            : String(seg),
        )
        .join(".");
      return `  • ${path || "(root)"}: ${issue.message}`;
    });
    console.error(
      "\n❌ Invalid environment configuration:\n" +
        lines.join("\n") +
        "\n\nSee .env.example for the required variables.\n",
    );
    throw new Error("Invalid environment configuration");
  },
});

export type Env = typeof env;
