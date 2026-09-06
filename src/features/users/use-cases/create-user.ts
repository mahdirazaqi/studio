import type { Actor } from "@/server/authz";
import { hashPassword } from "@/server/auth/password";
import type { SafeUser } from "@/features/users/domain/user";
import { createUser as createUserRepo } from "@/features/users/repository/user-repository";
import { assertCanCreateUserWithRole } from "@/features/users/use-cases/authorize-user-management";
import { resolveTargetDepartment } from "@/features/users/use-cases/resolve-target-department";
import type { CreateUserInput } from "@/features/users/schemas/create-user.schema";

/**
 * Create a User (docs/domain/users.md "Creation"). Wires the authorization
 * policy `authorize-user-management.ts` already prepared ahead of this
 * feature (Phase 3) to a real mutation for the first time.
 *
 * - ADMIN: any Department, any role.
 * - MANAGER: only their own Department, only role `USER` (OD-05 — can a
 *   MANAGER mint another MANAGER — stays unresolved; the conservative
 *   reading is enforced by `assertCanCreateUserWithRole`, not here).
 * - A brand-new User is always `ACTIVE` — there is no "invite" concept.
 */
export async function createUser(
  actor: Actor,
  input: CreateUserInput,
): Promise<SafeUser> {
  const departmentId = await resolveTargetDepartment(actor, input.departmentId);
  assertCanCreateUserWithRole(actor, departmentId, input.role);

  const passwordHash = await hashPassword(input.password);

  return createUserRepo({
    email: input.email,
    fullName: input.fullName,
    passwordHash,
    role: input.role,
    departmentId,
  });
}
