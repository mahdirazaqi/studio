import { describe, expect, it } from "vitest";

import { authenticateTelegramWebhook } from "./index";

// Matches TELEGRAM_WEBHOOK_SECRET/TELEGRAM_BOT_TOKEN stubbed in vitest.config.ts.
const VALID_SECRET = "test-telegram-webhook-secret-not-a-real-secret";

function requestWithSecret(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set("x-telegram-bot-api-secret-token", header);
  return new Request("http://localhost/api/telegram/webhook", { headers });
}

describe("authenticateTelegramWebhook", () => {
  it("accepts the correct secret", () => {
    expect(() =>
      authenticateTelegramWebhook(requestWithSecret(VALID_SECRET)),
    ).not.toThrow();
  });

  it("rejects a missing header", () => {
    expect(() => authenticateTelegramWebhook(requestWithSecret(null))).toThrow(
      expect.objectContaining({ kind: "unauthenticated" }),
    );
  });

  it("rejects an incorrect secret", () => {
    expect(() =>
      authenticateTelegramWebhook(requestWithSecret("wrong-secret")),
    ).toThrow(expect.objectContaining({ kind: "unauthenticated" }));
  });

  it("rejects a secret of a different length", () => {
    expect(() =>
      authenticateTelegramWebhook(requestWithSecret("short")),
    ).toThrow(expect.objectContaining({ kind: "unauthenticated" }));
  });

  it("never includes the submitted secret in the thrown error", () => {
    try {
      authenticateTelegramWebhook(requestWithSecret("some-guessed-secret"));
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(
        "some-guessed-secret",
      );
    }
  });
});
