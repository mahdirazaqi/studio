import "server-only";

import { db } from "@/server/db";
import type { Role } from "@/lib/roles";
import type { SafeUser } from "@/features/users/domain/user";

/**
 * User repository. The only module that queries the `User` table.
 *
 * Phase 2 needs exactly one read: resolving a login by email, including the
 * password hash so the auth use case can verify it. Nothing else in the
 * codebase should read `passwordHash` — it is deliberately typed on a
 * separate, narrowly-named result so it can't be handed to a client by
 * accident (see docs/architecture/authentication.md).
 *
 * User management (create/disable/role-change/list) is a later phase; this
 * repository grows with it.
 */

export interface UserCredentialRecord {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: Role;
  status: SafeUser["status"];
  departmentId: string;
}

/** Case-insensitive lookup by email, for the sign-in credential check only. */
export async function findUserCredentialByEmail(
  email: string,
): Promise<UserCredentialRecord | null> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: {
      id: true,
      email: true,
      fullName: true,
      passwordHash: true,
      role: true,
      status: true,
      departmentId: true,
    },
  });
  return user;
}
