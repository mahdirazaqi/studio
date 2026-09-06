import "server-only";

import {
  forbiddenError,
  internalError,
  notFoundError,
} from "@/server/errors/app-error";
import { ROLE_RANK, type Role } from "@/lib/roles";
import type { CurrentUser } from "@/server/auth/current-user";

/**
 * AUTHORIZATION BOUNDARY.
 *
 * "Who are you?" is `@/server/auth` (authentication). "What are you allowed to
 * do, on which data?" is here. Every use case's first step calls into this
 * module before touching a repository — see docs/architecture/authorization.md
 * and docs/domain/authorization.md for the full model and permission matrix.
 *
 * This module is deliberately transport-agnostic: everything below operates on
 * the plain `Actor` shape, not on cookies/sessions. A web request builds an
 * `Actor` via `toActor(currentUser)`; a future Telegram adapter would build
 * one the same way from its own resolved `CurrentUser`-equivalent; the Render
 * Worker is a *different*, narrower principal that never becomes an `Actor` at
 * all (see docs/architecture/authorization.md "Non-user principals").
 */

/** The minimal actor context every use case receives. */
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
 * Department isolation, for capability-style checks (e.g. "can this actor
 * even list resources in this department") where there is no single resource
 * whose existence could be leaked. ADMIN bypasses; everyone else must match.
 * Throws `forbidden` (403).
 *
 * For a check gating access to one *specific* resource by id, prefer
 * `assertDepartmentScopeOrNotFound` instead — see its doc comment.
 */
export function assertSameDepartment(
  actor: Actor,
  resourceDepartmentId: string,
): void {
  if (actor.role === "ADMIN") return;
  if (actor.departmentId !== resourceDepartmentId) {
    throw forbiddenError();
  }
}

/**
 * Department isolation for a *specific, identified* resource (e.g. `GET
 * /jobs/:id`). Throws `not_found` (404) instead of `forbidden` (403) so a
 * USER/MANAGER probing another department's resource ids learns nothing about
 * whether the id exists — matches docs/domain/authorization.md's enforcement
 * pattern ("prefer 404 over 403 to avoid leaking existence") and Security
 * Requirements §2. ADMIN bypasses.
 *
 * Only Job/Template/File will actually call this once they exist; it is
 * established now so those features don't have to invent it later.
 */
export function assertDepartmentScopeOrNotFound(
  actor: Actor,
  resourceDepartmentId: string,
): void {
  if (actor.role === "ADMIN") return;
  if (actor.departmentId !== resourceDepartmentId) {
    throw notFoundError();
  }
}

/**
 * A Prisma `where`-shaped fragment that scopes a query to the actor's
 * department — spread it into a repository's `where` clause so the
 * authorization boundary is encoded in the query itself, not bolted on after
 * the fact (docs/architecture/authorization.md "Query-level isolation").
 *
 * `{}` for ADMIN (no filter — sees everything); `{ departmentId }` for
 * everyone else.
 *
 * ```ts
 * db.job.findMany({ where: { ...departmentScopeFilter(actor), state: "QUEUED" } })
 * ```
 */
export function departmentScopeFilter(actor: Actor): { departmentId?: string } {
  return actor.role === "ADMIN" ? {} : { departmentId: actor.departmentId };
}

/** A capability string, e.g. `job:manage`, `user:view`. */
export type Capability = `${string}:${string}`;

interface CapabilityPolicy {
  /** The minimum role required to hold this capability at all. */
  minRole: Role;
}

/**
 * The capability registry — every capability a use case can check must be
 * registered here with its role floor. This is intentionally the *only*
 * place role requirements are declared; a use case never inlines
 * `actor.role === "ADMIN"` for a capability check (department-instance checks
 * are a separate, orthogonal concern — see `assertSameDepartment` /
 * `assertDepartmentScopeOrNotFound` / `departmentScopeFilter` above).
 *
 * Transcribed directly from the decided rows of
 * docs/domain/authorization.md's permission matrix — nothing here is invented
 * past what that matrix already states. Where the matrix marks a capability
 * `OPEN DECISION` (e.g. can a USER author Templates — OD-04), the registered
 * floor is the conservative reading (deny until decided), and the matrix/
 * open-decisions doc is the source of truth for what's still unsettled.
 *
 * `job:*`, `template:*`, `file:*` have no caller yet (those features don't
 * exist) — they're registered now so those later phases don't have to design
 * this registry from scratch, per docs/architecture/authorization.md.
 */
const CAPABILITY_POLICIES: Partial<Record<Capability, CapabilityPolicy>> = {
  "department:view_all": { minRole: "ADMIN" },
  "department:manage": { minRole: "ADMIN" },

  "user:view": { minRole: "MANAGER" },
  "user:manage": { minRole: "MANAGER" },

  // Role floor only — OD-03 ("own resource" vs "department resource" for
  // USER) is not resolved by this registry; a Jobs/Files use case adds that
  // narrower check itself once it exists.
  "job:manage": { minRole: "USER" },
  "file:manage": { minRole: "USER" },

  "template:view": { minRole: "USER" },
  // OD-04 (can USER author Templates) is open; MANAGER+ is the conservative
  // default until decided.
  "template:manage": { minRole: "MANAGER" },

  // Connecting/disconnecting a YouTube channel is department-level
  // infrastructure configuration, not a per-Job operation — MANAGER+, same
  // floor as `template:manage` (Phase 9, docs/integrations/youtube.md).
  "youtube:manage": { minRole: "MANAGER" },
};

export interface AuthorizeOptions {
  /** The department the action targets, for isolation checks. */
  departmentId?: string;
}

/**
 * The single authorization entry point for use cases: does `actor` hold
 * `capability` at all (role floor), and — if `departmentId` is given — does
 * it match the actor's department (ADMIN bypasses)?
 *
 * This checks the *capability*, not a specific resource instance. For "can
 * this actor read/mutate resource X specifically", combine this with
 * `assertDepartmentScopeOrNotFound(actor, resource.departmentId)` after
 * loading the resource, or use `departmentScopeFilter` at query time.
 *
 * Throws `internal` if `capability` has no registered policy — a caller
 * forgot to register one, which must fail loudly in development/tests rather
 * than silently allow or deny.
 */
export function authorize(
  actor: Actor,
  capability: Capability,
  options: AuthorizeOptions = {},
): void {
  const policy = CAPABILITY_POLICIES[capability];
  if (!policy) {
    throw internalError(
      `No authorization policy registered for capability "${capability}".`,
    );
  }

  requireRole(actor, policy.minRole);

  if (options.departmentId !== undefined) {
    assertSameDepartment(actor, options.departmentId);
  }
}
