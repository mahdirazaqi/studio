import "server-only";

import bcrypt from "bcryptjs";

/**
 * Password hashing (docs/architecture/authentication.md, ADR-0020).
 *
 * bcrypt via `bcryptjs` — a well-established, pure-JS implementation (no native
 * build step, so it installs reliably everywhere this app runs). Cost factor 12
 * is a reasonable default for an interactive login endpoint in 2026.
 *
 * Never log a password or a hash. Never return a hash from a use case /
 * Server Action / repository read that a client component could receive.
 */
const BCRYPT_COST_FACTOR = 12;

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, BCRYPT_COST_FACTOR);
}

export async function verifyPassword(
  plainTextPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}

/**
 * A precomputed hash of a value nobody can type, used to run the same bcrypt
 * comparison work when no user record was found for the submitted email.
 *
 * Without this, `verifyPassword` is skipped entirely on an unknown email, and
 * the failure path becomes measurably faster than "known email, wrong
 * password" — a timing side channel an attacker can use to enumerate valid
 * accounts. Always calling `verifyPassword` (against this constant when there
 * is no real hash) keeps both paths doing the same work.
 */
export const UNKNOWN_USER_DUMMY_HASH =
  "$2b$12$I481rx..fN7d9fW69Y.kDOf2oA0MKb/nqKSx0iiVxmmbFPT1PKXOS";
