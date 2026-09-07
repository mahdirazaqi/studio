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

    // `JOB_UPLOAD_DAILY_CAP` (the global daily cap on upload-enabled Jobs,
    // ADR-0030) is **removed** — YouTube upload no longer exists (ADR-0041),
    // so the quota it gated has no remaining purpose. See
    // docs/domain/jobs.md "Upload cap" for the removal note.

    // `WORKER_API_KEY` (a single shared, non-departmental static credential,
    // ADR-0032/OD-27) is **removed** — superseded by ADR-0040's
    // Department-scoped `WorkerApiKey` database model. Worker credentials are
    // now created/managed entirely through the `/worker-keys` admin UI, not
    // environment configuration. See docs/integrations/worker-api.md.

    /**
     * The Telegram Bot API token from @BotFather (docs/integrations/telegram.md,
     * ADR-0035). **Optional** — the Telegram bot is an
     * optional deployment feature, not a required one: Studio runs perfectly
     * well with it unset (the webhook route responds `dependency` / 503, and
     * outbound sends are skipped and logged, rather than the whole process
     * failing to start). Never logged, never echoed in any Telegram message or
     * error response — the logger's key-based redaction also catches any
     * accidental context field named with "token" in it.
     */
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),

    /**
     * The secret token Studio expects on Telegram's `X-Telegram-Bot-Api-Secret-Token`
     * webhook header (set via the `secret_token` parameter when calling
     * Telegram's `setWebhook`) — verified on every inbound webhook request
     * before anything else runs (docs/integrations/telegram.md "Webhook
     * security", ADR-0035). Optional for the same reason `TELEGRAM_BOT_TOKEN`
     * is; required in practice whenever `TELEGRAM_BOT_TOKEN` is set, checked
     * at the route, not here, so a missing/malformed value never crashes the
     * whole app at startup.
     */
    TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),

    /**
     * How long a Telegram conversation may sit untouched before it's treated
     * as expired and lazily reset to idle on the next message
     * (docs/integrations/telegram.md "Conversation state", ADR-0037, resolves
     * OD-35). No active sweep exists — expiry is checked only when a row is
     * next read, per OD-40's still-open durable-work-mechanism question.
     */
    TELEGRAM_WIZARD_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(1440)
      .default(60),

    /**
     * Local development seed (`prisma/seed.ts`) only — never read by the
     * running application. Lets a developer link the seeded ADMIN's Telegram
     * account locally without a raw SQL/`prisma studio` edit. Never a real
     * phone number in any committed value.
     */
    SEED_ADMIN_PHONE: z.string().min(1).optional(),

    /**
     * `ffmpeg` binary path (docs/domain/jobs.md "Rendered result", Phase 9,
     * ADR-0039). Always invoked via `execFile`/`spawn` with an argument array
     * (`shell: false`) — never string-interpolated (docs/security/security.md
     * §6). Deploy-time configuration, not user/request-controlled input, so
     * trusting this path is safe. Defaults to the binary already on `PATH`.
     * Used to generate a Job's screenshot/thumbnail from its rendered video —
     * independent of any external delivery destination, which Studio no
     * longer has (ADR-0041).
     */
    FFMPEG_PATH: z.string().min(1).default("ffmpeg"),

    // `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`/`YOUTUBE_TOKEN_ENCRYPTION_KEY`
    // are **removed** — Studio no longer uploads rendered Jobs to YouTube
    // (ADR-0041); the `YouTubeTarget` model, the Google OAuth client, and the
    // token-encryption boundary they configured are all gone.
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
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    TELEGRAM_WIZARD_TTL_MINUTES: process.env.TELEGRAM_WIZARD_TTL_MINUTES,
    SEED_ADMIN_PHONE: process.env.SEED_ADMIN_PHONE,
    FFMPEG_PATH: process.env.FFMPEG_PATH,
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
