import { notFoundError } from "@/server/errors/app-error";
import type { Actor } from "@/server/authz";
import { normalizePhone } from "@/features/telegram/domain/phone";
import type { SafeUser } from "@/features/users/domain/user";
import {
  findUserInScope,
  updateUserProfile as updateUserProfileRepo,
} from "@/features/users/repository/user-repository";
import { assertCanEditProfile } from "@/features/users/use-cases/authorize-user-management";
import type { UpdateUserProfileInput } from "@/features/users/schemas/update-user-profile.schema";

/**
 * Update a User's basic profile fields (`fullName`/`phone` only —
 * Phase 20/ADR-0051, docs/domain/users.md). One write path, two
 * authorization shapes, chosen by whether `targetUserId` is the caller's own
 * id:
 *
 * - **Self** (`actor.userId === targetUserId`): unconditionally allowed, no
 *   `authorize()`/capability floor at all — every authenticated User,
 *   `USER` role included, may edit their own name/phone
 *   (docs/domain/authorization.md "Edit own profile"). This is the one
 *   operation in the Users feature a plain `USER` can perform on themselves.
 * - **Someone else**: `findUserInScope` (department-scoped — folds
 *   "doesn't exist" and "exists in another department" into the same
 *   `not_found`) then `assertCanEditProfile` (MANAGER: `USER`-role targets
 *   in their own department only; ADMIN: anyone).
 *
 * Either way, `role`/`departmentId`/`status`/`email` are structurally
 * unreachable from this function — `UpdateUserProfileInput` has no such
 * fields (`update-user-profile.schema.ts`), so there is nothing to
 * accidentally forward even if a caller tried.
 */
export async function updateUserProfile(
  actor: Actor,
  targetUserId: string,
  input: UpdateUserProfileInput,
): Promise<SafeUser> {
  const normalizedPhone =
    input.phone === "" ? null : normalizePhone(input.phone);

  if (actor.userId === targetUserId) {
    return updateUserProfileRepo(targetUserId, {
      fullName: input.fullName,
      phone: normalizedPhone,
    });
  }

  const target = await findUserInScope(actor, targetUserId);
  if (!target) throw notFoundError();
  assertCanEditProfile(actor, target);

  return updateUserProfileRepo(targetUserId, {
    fullName: input.fullName,
    phone: normalizedPhone,
  });
}
