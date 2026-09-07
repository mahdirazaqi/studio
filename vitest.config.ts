import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));
const emptyModule = fileURLToPath(
  new URL("./src/test/stubs/empty-module.ts", import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${src}/$1` },
      // `server-only` / `client-only` throw under plain Node resolution.
      { find: /^server-only$/, replacement: emptyModule },
      { find: /^client-only$/, replacement: emptyModule },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    globals: false,
    env: {
      // Unit tests never touch a real database (repositories/session are
      // mocked); this only satisfies `@/server/env`'s required-variable check
      // so importing server modules doesn't fail validation in the test
      // environment. See docs/architecture/environment.md.
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      SESSION_COOKIE_NAME: "studio_session",
      SESSION_DURATION_DAYS: "30",
      TELEGRAM_BOT_TOKEN: "123456:test-telegram-bot-token-not-real",
      TELEGRAM_WEBHOOK_SECRET: "test-telegram-webhook-secret-not-a-real-secret",
      YOUTUBE_CLIENT_ID: "test-youtube-client-id.apps.googleusercontent.com",
      YOUTUBE_CLIENT_SECRET: "test-youtube-client-secret-not-real",
      YOUTUBE_TOKEN_ENCRYPTION_KEY:
        "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    },
  },
});
