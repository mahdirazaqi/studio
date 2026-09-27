import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock: {
  APP_URL: string | undefined;
  TELEGRAM_BOT_TOKEN: string | undefined;
  TELEGRAM_WEBHOOK_SECRET: string | undefined;
} = {
  APP_URL: undefined,
  TELEGRAM_BOT_TOKEN: undefined,
  TELEGRAM_WEBHOOK_SECRET: undefined,
};

const loggerWarn = vi.fn();
const loggerInfo = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/server/env", () => ({
  get env() {
    return envMock;
  },
}));
vi.mock("@/server/logger", () => ({
  logger: {
    info: (...args: unknown[]) => loggerInfo(...args),
    warn: (...args: unknown[]) => loggerWarn(...args),
  },
}));

const { registerTelegramWebhookOnStartup } = await import("./register-webhook");

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.APP_URL = undefined;
  envMock.TELEGRAM_BOT_TOKEN = undefined;
  envMock.TELEGRAM_WEBHOOK_SECRET = undefined;
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(jsonResponse({ ok: true, result: true }));
});

describe("registerTelegramWebhookOnStartup", () => {
  it("does nothing when APP_URL is not set", async () => {
    envMock.TELEGRAM_BOT_TOKEN = "token";
    envMock.TELEGRAM_WEBHOOK_SECRET = "secret";
    await registerTelegramWebhookOnStartup();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when TELEGRAM_BOT_TOKEN is not set", async () => {
    envMock.APP_URL = "https://studio.example.com";
    envMock.TELEGRAM_WEBHOOK_SECRET = "secret";
    await registerTelegramWebhookOnStartup();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when TELEGRAM_WEBHOOK_SECRET is not set", async () => {
    envMock.APP_URL = "https://studio.example.com";
    envMock.TELEGRAM_BOT_TOKEN = "token";
    await registerTelegramWebhookOnStartup();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls Telegram's setWebhook with the app's own webhook path and the configured secret", async () => {
    envMock.APP_URL = "https://studio.example.com";
    envMock.TELEGRAM_BOT_TOKEN = "token";
    envMock.TELEGRAM_WEBHOOK_SECRET = "secret";

    await registerTelegramWebhookOnStartup();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottoken/setWebhook",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          url: "https://studio.example.com/api/telegram/webhook",
          secret_token: "secret",
        }),
      }),
    );
  });

  it("builds the webhook URL correctly even when APP_URL has a trailing slash", async () => {
    envMock.APP_URL = "https://studio.example.com/";
    envMock.TELEGRAM_BOT_TOKEN = "token";
    envMock.TELEGRAM_WEBHOOK_SECRET = "secret";

    await registerTelegramWebhookOnStartup();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      url: "https://studio.example.com/api/telegram/webhook",
    });
  });

  it("logs a warning, never throws, when the HTTP request itself fails", async () => {
    envMock.APP_URL = "https://studio.example.com";
    envMock.TELEGRAM_BOT_TOKEN = "token";
    envMock.TELEGRAM_WEBHOOK_SECRET = "secret";
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(registerTelegramWebhookOnStartup()).resolves.toBeUndefined();
    expect(loggerWarn).toHaveBeenCalled();
  });

  it("logs a warning, never throws, when Telegram responds with ok: false", async () => {
    envMock.APP_URL = "https://studio.example.com";
    envMock.TELEGRAM_BOT_TOKEN = "token";
    envMock.TELEGRAM_WEBHOOK_SECRET = "secret";
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, description: "bad url" }),
    );

    await expect(registerTelegramWebhookOnStartup()).resolves.toBeUndefined();
    expect(loggerWarn).toHaveBeenCalled();
    expect(loggerInfo).not.toHaveBeenCalled();
  });
});
