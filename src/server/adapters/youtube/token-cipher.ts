import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/server/env";
import { dependencyError, internalError } from "@/server/errors/app-error";

/**
 * Encrypts/decrypts `YouTubeTarget` OAuth tokens at rest (AES-256-GCM,
 * docs/security/security.md, ADR-0039). The only module that touches
 * `YOUTUBE_TOKEN_ENCRYPTION_KEY` or produces/consumes ciphertext — everything
 * else in `features/youtube` handles only the decrypted token in memory, for
 * the duration of one request, and never logs it.
 *
 * Format: `<iv>:<authTag>:<ciphertext>`, each base64 — a fresh random IV per
 * encryption call (GCM must never reuse an IV under the same key).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

function getKey(): Buffer {
  if (!env.YOUTUBE_TOKEN_ENCRYPTION_KEY) {
    throw dependencyError(
      "YouTube delivery is not configured on this deployment (missing token encryption key).",
    );
  }
  const key = Buffer.from(env.YOUTUBE_TOKEN_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw internalError(
      "YOUTUBE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (see .env.example).",
    );
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext]
    .map((buf) => buf.toString("base64"))
    .join(":");
}

export function decryptToken(encoded: string): string {
  const key = getKey();
  const [ivPart, authTagPart, ciphertextPart] = encoded.split(":");
  if (!ivPart || !authTagPart || !ciphertextPart) {
    throw internalError("Stored YouTube token is malformed.");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivPart, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagPart, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
