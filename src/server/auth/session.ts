import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { db } from "@/server/db";
import { env } from "@/server/env";
import type { Role } from "@/lib/roles";

/**
 * Session infrastructure (docs/architecture/authentication.md, ADR-0020).
 *
 * Mechanism: an opaque random token is set in an httpOnly cookie. The server
 * never stores the token itself — only its SHA-256 hash, in the `Session`
 * table. A request is authenticated by hashing the cookie value and looking up
 * that hash. This means:
 *
 *   - A database read alone never yields a usable session (only hashes are at
 *     rest), unlike a signed JWT approach where leaking the signing key (or a
 *     valid token) is enough.
 *   - Sessions are revoked by deleting the row — logout, and (in a later phase)
 *     disabling a user, take effect immediately, with no blocklist needed.
 *   - No `SESSION_SECRET` is required: tampering with the cookie just fails the
 *     hash lookup, it doesn't forge a valid session.
 *
 * This module is the only place that touches the session cookie or the
 * `Session` table directly. `@/server/auth/current-user` is the public
 * boundary; `@/features/auth` use cases call the functions here to issue and
 * end sessions.
 */

const SESSION_TOKEN_BYTES = 32;

export interface IssuedSession {
  /** The raw, unhashed token — this is what goes in the cookie. Never persisted. */
  token: string;
  expiresAt: Date;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  departmentId: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionDurationMs(): number {
  return env.SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
}

/** Create a new session for `userId` and return the raw token to put in a cookie. */
export async function createSession(userId: string): Promise<IssuedSession> {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDurationMs());

  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  return { token, expiresAt };
}

/**
 * Resolve a raw session token to its user, or `null` if the token is missing,
 * expired, or the user is no longer `ACTIVE`. Opportunistically deletes the
 * session row when it has expired.
 */
export async function resolveSession(
  token: string,
): Promise<SessionUser | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { department: true } } },
  });

  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {
      // Best-effort cleanup; a concurrent delete/expiry race is harmless.
    });
    return null;
  }

  if (session.user.status !== "ACTIVE") return null;

  return {
    id: session.user.id,
    email: session.user.email,
    fullName: session.user.fullName,
    role: session.user.role,
    departmentId: session.user.departmentId,
  };
}

/** End a session by its raw token. Safe to call with an already-invalid token. */
export async function endSession(token: string): Promise<void> {
  await db.session
    .delete({ where: { tokenHash: hashToken(token) } })
    .catch(() => {
      // Already gone (expired sweep, double sign-out) — nothing to do.
    });
}

/* ---------------------------------------------------------------------------
 * Cookie helpers. These are the only functions in the codebase that read or
 * write the session cookie.
 * ------------------------------------------------------------------------- */

export async function getSessionTokenFromCookies(): Promise<string | null> {
  const store = await cookies();
  return store.get(env.SESSION_COOKIE_NAME)?.value ?? null;
}

export async function setSessionCookie(session: IssuedSession): Promise<void> {
  const store = await cookies();
  store.set(env.SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(env.SESSION_COOKIE_NAME);
}
