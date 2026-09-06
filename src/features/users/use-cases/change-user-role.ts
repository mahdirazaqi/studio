import type { Actor } from "@/server/authz";
import { notFoundError } from "@/server/errors/app-error";
import type { Role } from "@/lib/roles";
import type { SafeUser } from "@/features/users/domain/user";
import {
  findUserInScope,
  setUserRole,
} from "@/features/users/repository/user-repository";
import { assertCanChangeRole } from "@/features/users/use-cases/authorize-user-management";

/**
 * Change a User's role (docs/domain/authorization.md "Change a user's role"
 * — ADMIN-only, OD-05 stays open for a MANAGER's own role-granting ceiling
 * separately). `assertCanChangeRole` also forbids anyone changing their own
 * role — the structural self-lockout guard ADR-0023 describes.
 */
export async function changeUserRole(
  actor: Actor,
  userId: string,
  role: Role,
): Promise<SafeUser> {
  const target = await findUserInScope(actor, userId);
  if (!target) throw notFoundError();

  assertCanChangeRole(actor, target, role);

  if (target.role !== role) {
    await setUserRole(userId, role);
  }
  return { ...target, role };
}
