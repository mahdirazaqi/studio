import "server-only";

import { cache } from "react";

import { unauthenticatedError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import type { Role } from "@/lib/roles";

export type { Role };

/**
 * AUTHENTICATION BOUNDARY.
 *
 * This module is the single place the current principal is resolved. Session
 * handling itself is implemented in a later phase (see
 * docs/architecture/authentication-boundary.md and OPEN DECISION OD-43).
 *
 * Until then `getCurrentUser()` always resolves to `null` (no session backend
 * exists yet). This is a real, honest boundary — not a fake user. Feature code
 * and route handlers already call `getCurrentUser()` / `requireUser()`, so when
 * the session backend is added, nothing else has to change.
 *
 * DO NOT:
 *   - fabricate a user here
 *   - read auth state anywhere else
 *   - hard-code authorization decisions (that is `@/server/authz`)
 */

/**
 * The authenticated principal. Shape is intentionally minimal for Phase 1 and
 * will be backed by the real `User` record once the Users feature exists.
 */
export interface CurrentUser {
  id: string;
  role: Role;
  departmentId: string;
  displayName: string;
  email: string;
}

/**
 * Resolve the current user from the request session, or `null` if there is no
 * valid session. De-duplicated per request via React `cache`.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // TODO(phase-auth): resolve the session cookie -> User record.
  // Deliberately returns null until the session backend is implemented.
  return null;
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
