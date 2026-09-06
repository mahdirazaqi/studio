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

    /**
     * The Render Worker's shared service credential (docs/integrations/worker-api.md,
     * ADR-0032, resolves OD-27). Sent as `Authorization: Bearer <key>` on every
     * `/api/worker/v1/**` request and compared with a timing-safe check
     * (`@/server/worker-auth`). **Required** — Studio never starts with Worker
     * authentication silently disabled because this is unset (Phase 7 brief §8).
     * Not hashed at rest: it lives only in environment configuration, never in a
     * database table, so there is no "at rest" store to protect beyond the
     * environment itself — the same trust boundary `DATABASE_URL` already relies
     * on. Rotate by changing this value and redeploying; there is no
     * revoke-without-redeploy mechanism (a `WorkerCredential` table would add
     * one, deliberately deferred — see ADR-0032).
     */
    WORKER_API_KEY: z
      .string()
      .min(
        16,
        "WORKER_API_KEY is required (see .env.example) and should be a long, random value.",
      ),

    /**
     * The Telegram Bot API token from @BotFather (docs/integrations/telegram.md,
     * ADR-0035). **Optional** — unlike `WORKER_API_KEY`, the Telegram bot is an
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
     * at the route, not here, so one missing variable never crashes the whole
     * app at startup the way `WORKER_API_KEY` does.
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
     * `ffmpeg` binary path (docs/integrations/youtube.md "Media processing",
     * Phase 9, ADR-0039). Always invoked via `execFile`/`spawn` with an
     * argument array (`shell: false`) — never string-interpolated
     * (docs/security/security.md §6). Deploy-time configuration, not
     * user/request-controlled input, so trusting this path is safe. Defaults
     * to the binary already on `PATH`.
     */
    FFMPEG_PATH: z.string().min(1).default("ffmpeg"),

    /**
     * Google OAuth client credentials for exchanging a `YouTubeTarget`'s
     * stored refresh token for a short-lived access token
     * (`features/youtube/infrastructure/youtube-client.ts`). Optional — like
     * Telegram, YouTube delivery is an optional deployment feature; Studio
     * runs fully without it (connecting a Target fails with a clear
     * `dependency` error instead of crashing the process at startup).
     */
    YOUTUBE_CLIENT_ID: z.string().min(1).optional(),
    YOUTUBE_CLIENT_SECRET: z.string().min(1).optional(),

    /**
     * Symmetric key (32 raw bytes, base64-encoded) used to encrypt every
     * `YouTubeTarget` refresh/access token at rest with AES-256-GCM
     * (`@/server/adapters/youtube/token-cipher.ts`, ADR-0039) — the tokens are
     * the actual credential of record and must never be stored in plaintext
     * (docs/security/security.md). Optional for the same reason as the client
     * credentials above; required in practice before a Target can be
     * connected, checked at that boundary rather than at process startup.
     * Generate with `openssl rand -base64 32`. Rotating this value makes every
     * previously-connected Target's stored tokens unreadable — reconnect them
     * after rotating, there is no re-encryption migration.
     */
    YOUTUBE_TOKEN_ENCRYPTION_KEY: z.string().min(1).optional(),
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
    WORKER_API_KEY: process.env.WORKER_API_KEY,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    TELEGRAM_WIZARD_TTL_MINUTES: process.env.TELEGRAM_WIZARD_TTL_MINUTES,
    SEED_ADMIN_PHONE: process.env.SEED_ADMIN_PHONE,
    FFMPEG_PATH: process.env.FFMPEG_PATH,
    YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET,
    YOUTUBE_TOKEN_ENCRYPTION_KEY: process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY,
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
