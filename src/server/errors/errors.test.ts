import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toAppError, toPublicError } from "./index";
import { businessRuleError, validationError } from "./app-error";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toAppError", () => {
  it("passes through an AppError unchanged", () => {
    const err = validationError("bad");
    expect(toAppError(err)).toBe(err);
  });

  it("wraps an unknown value as an internal error and keeps the cause", () => {
    const raw = new Error("secret internal detail");
    const app = toAppError(raw);
    expect(app.kind).toBe("internal");
    expect(app.cause).toBe(raw);
  });
});

describe("toPublicError", () => {
  it("never leaks internal error details", () => {
    const raw = new Error("SELECT * FROM users; connection string leaked");
    const pub = toPublicError(raw);
    expect(pub.kind).toBe("internal");
    expect(pub.message).not.toContain("SELECT");
    expect(pub.message).toBe("Something went wrong. Please try again.");
    expect(pub).not.toHaveProperty("stack");
    expect(pub).not.toHaveProperty("cause");
  });

  it("passes through a safe, exposed message for handled errors", () => {
    const pub = toPublicError(
      businessRuleError("You cannot cancel a finished job."),
    );
    expect(pub.kind).toBe("business_rule");
    expect(pub.message).toBe("You cannot cancel a finished job.");
  });

  it("includes field errors for validation failures", () => {
    const pub = toPublicError(
      validationError("bad", { fieldErrors: { title: ["Required"] } }),
    );
    expect(pub.fieldErrors).toEqual({ title: ["Required"] });
  });

  it("logs internal errors at error level", () => {
    toPublicError(new Error("boom"));
    expect(console.error).toHaveBeenCalled();
  });
});
