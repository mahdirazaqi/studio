import { describe, expect, it } from "vitest";

import { decryptToken, encryptToken } from "./token-cipher";

describe("token-cipher", () => {
  it("round-trips a token through encrypt/decrypt", () => {
    const plaintext = "1//0gExampleRefreshToken";
    const encrypted = encryptToken(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it("never stores the plaintext token in the ciphertext string", () => {
    const plaintext = "super-secret-refresh-token-value";
    const encrypted = encryptToken(plaintext);
    expect(encrypted).not.toContain(plaintext);
  });

  it("produces a different ciphertext each time (fresh IV per call)", () => {
    const plaintext = "same-token";
    expect(encryptToken(plaintext)).not.toBe(encryptToken(plaintext));
  });

  it("fails to decrypt a tampered ciphertext (GCM auth tag integrity)", () => {
    const encrypted = encryptToken("a-token");
    const [iv, authTag, ciphertext] = encrypted.split(":") as [
      string,
      string,
      string,
    ];
    const tamperedCiphertextByte = Buffer.from(ciphertext, "base64");
    tamperedCiphertextByte[0] = tamperedCiphertextByte[0]! ^ 0xff;
    const tampered = `${iv}:${authTag}:${tamperedCiphertextByte.toString("base64")}`;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("throws a clean internal error for a malformed stored value", () => {
    expect(() => decryptToken("not-a-valid-format")).toThrow();
  });
});
