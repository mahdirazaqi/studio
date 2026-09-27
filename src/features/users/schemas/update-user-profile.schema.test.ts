import { describe, expect, it } from "vitest";

import { updateUserProfileSchema } from "./update-user-profile.schema";

function parse(fullName: string, phone: string) {
  return updateUserProfileSchema.safeParse({ fullName, phone });
}

describe("updateUserProfileSchema", () => {
  it("accepts a plain national-style number", () => {
    expect(parse("Mahdi", "5551234567").success).toBe(true);
  });

  it("accepts a full international number with a leading +", () => {
    expect(parse("Mahdi", "+98 912 345 6789").success).toBe(true);
  });

  it("accepts common formatting punctuation (spaces, dashes, parens)", () => {
    expect(parse("Mahdi", "+98 (912) 123-4567").success).toBe(true);
  });

  it("accepts an empty phone number — clearing it is a valid state", () => {
    expect(parse("Mahdi", "").success).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(parse("Mahdi", "  5551234567  ").success).toBe(true);
  });

  it("rejects a number that's too short after stripping formatting", () => {
    const result = parse("Mahdi", "12345");
    expect(result.success).toBe(false);
  });

  it("rejects letters-only input", () => {
    const result = parse("Mahdi", "not a phone number");
    expect(result.success).toBe(false);
  });

  it("rejects a mix of letters and too few digits", () => {
    expect(parse("Mahdi", "call me maybe").success).toBe(false);
  });

  it("gives a clear English error message for an invalid phone number", () => {
    const result = parse("Mahdi", "abc");
    if (result.success) throw new Error("expected failure");
    expect(result.error.issues[0]?.message).toBe(
      "Please enter a valid phone number.",
    );
  });

  it("rejects an empty full name", () => {
    expect(parse("", "5551234567").success).toBe(false);
  });

  it("rejects a phone number over the length ceiling", () => {
    expect(parse("Mahdi", "1".repeat(50)).success).toBe(false);
  });

  it("phone defaults to empty (clears it) when omitted entirely", () => {
    const result = updateUserProfileSchema.safeParse({ fullName: "Mahdi" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("");
  });
});
