import { describe, expect, it } from "vitest";

import {
  hashPassword,
  verifyPassword,
  UNKNOWN_USER_DUMMY_HASH,
} from "./password";

describe("password hashing", () => {
  it("verifies a password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(
      verifyPassword("correct horse battery staple", hash),
    ).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("produces a different hash for the same input each time (random salt)", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same input"),
      hashPassword("same input"),
    ]);
    expect(a).not.toBe(b);
  });

  it("never returns the plain-text input as the hash", async () => {
    const hash = await hashPassword("plain-text-password");
    expect(hash).not.toBe("plain-text-password");
    expect(hash).not.toContain("plain-text-password");
  });

  it("the dummy hash is a well-formed bcrypt hash that always fails to verify", async () => {
    await expect(
      verifyPassword("anything at all", UNKNOWN_USER_DUMMY_HASH),
    ).resolves.toBe(false);
  });
});
