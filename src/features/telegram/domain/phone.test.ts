import { describe, expect, it } from "vitest";

import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("strips spaces, dashes, and parens", () => {
    expect(normalizePhone("+98 (912) 123-4567")).toBe("989121234567");
  });

  it("drops a leading +", () => {
    expect(normalizePhone("+989121234567")).toBe("989121234567");
  });

  it("is already-normalized-safe (idempotent)", () => {
    const once = normalizePhone("989121234567");
    expect(normalizePhone(once ?? "")).toBe(once);
  });

  it("returns null for a string with no digits", () => {
    expect(normalizePhone("not a phone number")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(normalizePhone("")).toBeNull();
  });
});
