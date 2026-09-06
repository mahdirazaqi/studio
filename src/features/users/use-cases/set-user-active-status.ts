import type { Actor } from "@/server/authz";
import { notFoundError } from "@/server/errors/app-error";
import type { SafeUser, UserStatus } from "@/features/users/domain/user";
import {
  findUserInScope,
  setUserStatus as setUserStatusRepo,
} from "@/features/users/repository/user-repository";
import { assertCanSetActiveStatus } from "@/features/users/use-cases/authorize-user-management";

/**
 * Disable/re-enable a User (docs/domain/users.md "Disabling"). A `DISABLED`
 * user cannot authenticate or act — enforced once, at session resolution
 * (`@/server/auth`), not re-checked here; this only flips the flag.
 *
 * `findUserInScope` folds "doesn't exist" and "exists in another department"
 * into the same `not_found` (docs/architecture/authorization.md 403-vs-404
 * guidance) — a cross-department attempt never reaches
 * `assertCanSetActiveStatus`, so that function's own department check is
 * defense-in-depth, not the primary gate.
 */
async function setUserActiveStatus(
  actor: Actor,
  userId: string,
  status: UserStatus,
): Promise<SafeUser> {
  const target = await findUserInScope(actor, userId);
  if (!target) throw notFoundError();

  assertCanSetActiveStatus(actor, target);

  // Idempotent — setting the status a user already has is a no-op, not an
  // error (matches `setTemplateStatus`'s own idempotency).
  if (target.status !== status) {
    await setUserStatusRepo(userId, status);
  }
  return { ...target, status };
}

export function enableUser(actor: Actor, userId: string): Promise<SafeUser> {
  return setUserActiveStatus(actor, userId, "ACTIVE");
}

export function disableUser(actor: Actor, userId: string): Promise<SafeUser> {
  return setUserActiveStatus(actor, userId, "DISABLED");
}
