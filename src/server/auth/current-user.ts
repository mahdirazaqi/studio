import "server-only";

import { cache } from "react";

import { unauthenticatedError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import {
  getSessionTokenFromCookies,
  resolveSession,
} from "@/server/auth/session";
import type { Role } from "@/lib/roles";

export type { Role };

/**
 * AUTHENTICATION BOUNDARY.
 *
 * This module is the single place the current principal is resolved. See
 * docs/architecture/authentication-boundary.md and
 * docs/architecture/authentication.md (ADR-0020) for the session mechanism
 * behind it (`@/server/auth/session`).
 *
 * `getCurrentUser()` reads the session cookie, resolves it against the
 * `Session`/`User` tables, and returns `null` for anything that isn't a valid
 * session belonging to an `ACTIVE` user — no cookie, an expired/unknown
 * token, or a `DISABLED` user all resolve to `null`. This is why disabling a
 * user (a later phase's feature) invalidates their access immediately even
 * though old session rows may still exist: this lookup filters on status
 * every time.
 *
 * DO NOT:
 *   - fabricate a user here
 *   - read auth state anywhere else (only this module touches the cookie/DB
 *     for identity — see `@/server/auth/session`)
 *   - hard-code authorization decisions (that is `@/server/authz`)
 */

/** The authenticated principal, backed by the real `User` record. */
export interface CurrentUser {
  id: string;
  role: Role;
  departmentId: string;
  /** Display-only — resolved via the same session join, no extra query
   * (docs/domain/departments.md "Profile display"). ADMIN's own department is
   * just their "home" department (OD-46-adjacent, unresolved) — shown as-is,
   * never hidden or faked. */
  departmentName: string;
  displayName: string;
  email: string;
}

/**
 * Resolve the current user from the request session, or `null` if there is no
 * valid session. De-duplicated per request via React `cache`.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await getSessionTokenFromCookies();
  if (!token) return null;

  const sessionUser = await resolveSession(token);
  if (!sessionUser) return null;

  return {
    id: sessionUser.id,
    role: sessionUser.role,
    departmentId: sessionUser.departmentId,
    departmentName: sessionUser.departmentName,
    displayName: sessionUser.fullName,
    email: sessionUser.email,
  };
});

/**
 * Resolve the current user or throw `unauthenticated`. Use in any server code
 * path that requires a signed-in user.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    logger.debug("requireUser: no authenticated session");
    throw unauthenticatedError();
  }
  return user;
}
