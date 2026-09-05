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
