import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { redact } from "./logger";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("redact", () => {
  it("masks sensitive keys anywhere in the tree", () => {
    const input = {
      userId: "u_1",
      password: "hunter2",
      nested: { apiKey: "sk-live-123", ok: "visible" },
      headers: { Authorization: "Bearer abc", "x-request-id": "r1" },
    };
    const out = redact(input) as Record<string, unknown>;

    expect(out.userId).toBe("u_1");
    expect(out.password).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).apiKey).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).ok).toBe("visible");
    expect((out.headers as Record<string, unknown>).Authorization).toBe(
      "[redacted]",
    );
    expect((out.headers as Record<string, unknown>)["x-request-id"]).toBe("r1");
  });

  it("redacts sensitive values inside arrays", () => {
    const out = redact([{ token: "t" }, { name: "n" }]) as Array<
      Record<string, unknown>
    >;
    expect(out[0]?.token).toBe("[redacted]");
    expect(out[1]?.name).toBe("n");
  });

  it("summarizes Error objects", () => {
    const out = redact(new Error("boom")) as Record<string, unknown>;
    expect(out.name).toBe("Error");
    expect(out.message).toBe("boom");
  });

  it("passes primitives through untouched", () => {
    expect(redact(42)).toBe(42);
    expect(redact("plain")).toBe("plain");
    expect(redact(null)).toBe(null);
  });

  it("truncates excessively deep structures", () => {
    let deep: Record<string, unknown> = { value: "leaf" };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    expect(JSON.stringify(redact(deep))).toContain("[truncated]");
  });
});

describe("logger", () => {
  it("emits at/above the configured level and skips below", async () => {
    const { logger } = await import("./logger");
    logger.info("hello", { a: 1 });
    logger.debug("should be filtered at default info level");
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it("child loggers merge bindings", async () => {
    const { logger } = await import("./logger");
    const child = logger.child({ requestId: "r-123" });
    child.warn("careful");
    expect(console.warn).toHaveBeenCalledOnce();
    const line = (console.warn as unknown as { mock: { calls: string[][] } })
      .mock.calls[0]?.[0];
    expect(line).toContain("r-123");
  });
});
