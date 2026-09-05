import "server-only";

import { forbiddenError } from "@/server/errors/app-error";
import { ROLE_RANK, type Role } from "@/lib/roles";
import type { CurrentUser } from "@/server/auth/current-user";

/**
 * AUTHORIZATION BOUNDARY.
 *
 * Authorization is always enforced server-side, in or below the application
 * layer — never in the UI. This module defines the vocabulary and the
 * enforcement helpers. The concrete capability rules land with the Users /
 * Departments / Roles feature; see docs/domain/authorization.md.
 *
 * Phase 1 provides:
 *   - the `Actor` shape every use case receives
 *   - `requireRole` / `assertSameDepartment` primitives
 *   - `authorize(...)` — the single entry point use cases must call before
 *     acting. It currently rejects everything that is not ADMIN because no
 *     capability matrix exists yet; this keeps callers honest without
 *     hard-coding real policy.
 */

/** The minimal actor context passed into every use case. */
export interface Actor {
  userId: string;
  role: Role;
  departmentId: string;
}

export function toActor(user: CurrentUser): Actor {
  return {
    userId: user.id,
    role: user.role,
    departmentId: user.departmentId,
  };
}

export function hasAtLeastRole(actor: Actor, role: Role): boolean {
  return ROLE_RANK[actor.role] >= ROLE_RANK[role];
}

export function requireRole(actor: Actor, role: Role): void {
  if (!hasAtLeastRole(actor, role)) {
    throw forbiddenError();
  }
}

/**
 * Department isolation primitive. ADMIN bypasses; everyone else must match the
 * resource's department.
 */
export function assertSameDepartment(
  actor: Actor,
  resourceDepartmentId: string,
): void {
  if (actor.role === "ADMIN") return;
  if (actor.departmentId !== resourceDepartmentId) {
    // 404 rather than 403 is often preferable to avoid leaking existence;
    // callers can choose. Default here is forbidden.
    throw forbiddenError();
  }
}

/** A capability string, e.g. `job:create`, `template:delete`. */
export type Capability = `${string}:${string}`;

export interface AuthorizeOptions {
  /** The department the action targets, for isolation checks. */
  departmentId?: string;
}

/**
 * The single authorization entry point for use cases.
 *
 * TODO(phase-authz): replace the body with the real capability matrix from
 * docs/domain/authorization.md once roles exist. Until then it allows ADMIN
 * only, so no feature can accidentally ship without an explicit rule.
 */
export function authorize(
  actor: Actor,
  capability: Capability,
  options: AuthorizeOptions = {},
): void {
  void capability;
  if (options.departmentId !== undefined) {
    assertSameDepartment(actor, options.departmentId);
  }
  if (actor.role !== "ADMIN") {
    throw forbiddenError();
  }
}
