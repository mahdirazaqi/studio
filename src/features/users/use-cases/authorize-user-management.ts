import { forbiddenError } from "@/server/errors/app-error";
import { authorize, requireRole, type Actor } from "@/server/authz";
import type { Role } from "@/lib/roles";
import type { SafeUser } from "@/features/users/domain/user";

/**
 * Authorization policy for user management (create / change role / disable /
 * re-enable). No create/disable/role-change use case or UI exists yet —
 * that's a later phase — but CLAUDE.md and docs/domain/users.md ask for the
 * *rules* to be prepared now, so that phase only has to wire these into a
 * repository write, not design the policy. See
 * docs/architecture/authorization.md and docs/domain/authorization.md for the
 * permission matrix these functions implement, and
 * docs/development/open-decisions.md OD-05 for the still-open question noted
 * below.
 *
 * Every function here starts by calling `authorize(actor, "user:manage", ...)`
 * — the coarse-grained "does this actor manage users in this department at
 * all" gate — then layers the specific escalation/self-modification rule on
 * top. None of this does I/O; callers pass in already-loaded actor/target
 * data and apply the result.
 */

/** The subset of a User a caller needs to make an authorization decision. */
export type ManagedUserRef = Pick<SafeUser, "id" | "role" | "departmentId">;

/**
 * Can `actor` create a new user, in `departmentId`, with `role`?
 *
 * - ADMIN: any department, any role.
 * - MANAGER: only their own department, and — matching docs/domain/users.md's
 *   "MANAGER can create Users in their own Department with role USER or
 *   MANAGER" clause being OD-05 (can a MANAGER mint another MANAGER) — only
 *   role `USER`, the conservative reading, until OD-05 is resolved.
 * - USER: never (rejected by the `user:manage` capability floor).
 */
export function assertCanCreateUserWithRole(
  actor: Actor,
  departmentId: string,
  role: Role,
): void {
  authorize(actor, "user:manage", { departmentId });
  if (actor.role !== "ADMIN" && role !== "USER") {
    throw forbiddenError();
  }
}

/**
 * Can `actor` change `target`'s role to `nextRole`?
 *
 * - Nobody may change their own role through this path, regardless of role —
 *   the simplest way to make an accidental ADMIN self-lockout structurally
 *   impossible, without needing a "last remaining ADMIN" count-based
 *   safeguard (see docs/domain/authorization.md §"ADMIN Protection" — a
 *   bulk-operation lockout guard, if one is ever built, remains an OPEN
 *   DECISION; this function only closes the self-service path).
 * - Whether a MANAGER may change anyone's role at all is
 *   `docs/domain/authorization.md`'s "Change a user's role" row, marked OPEN
 *   DECISION. The conservative default implemented here is ADMIN-only until
 *   that's resolved.
 */
export function assertCanChangeRole(
  actor: Actor,
  target: ManagedUserRef,
  nextRole: Role,
): void {
  authorize(actor, "user:manage", { departmentId: target.departmentId });
  if (actor.userId === target.id) {
    throw forbiddenError();
  }
  requireRole(actor, "ADMIN");
  void nextRole;
}

/**
 * Can `actor` disable or re-enable `target`?
 *
 * - Nobody may disable/re-enable themselves through this path (same
 *   self-lockout reasoning as `assertCanChangeRole`).
 * - MANAGER may only act on a `USER`-role target — matching
 *   docs/domain/authorization.md's "Disable / re-enable user" row exactly
 *   ("MANAGER 🟨 (USERs only)"), not merely "not an ADMIN": a MANAGER cannot
 *   disable a peer MANAGER either.
 * - ADMIN may act on anyone (except themselves, per the rule above).
 */
export function assertCanSetActiveStatus(
  actor: Actor,
  target: ManagedUserRef,
): void {
  authorize(actor, "user:manage", { departmentId: target.departmentId });
  if (actor.userId === target.id) {
    throw forbiddenError();
  }
  if (actor.role !== "ADMIN" && target.role !== "USER") {
    throw forbiddenError();
  }
}
