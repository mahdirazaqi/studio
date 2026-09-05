import type { Role } from "@/lib/roles";

/**
 * User domain types. Pure — no I/O, no Prisma import (see
 * docs/architecture/project-structure.md §3: `domain` layers are pure).
 *
 * docs/domain/users.md is the source of truth for the full field set. Phase 2
 * implements only what authentication needs; user management (create,
 * disable, role change, Telegram linking) is a later phase.
 */

export const USER_STATUSES = ["ACTIVE", "DISABLED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** A User with everything except its password hash — safe to pass around. */
export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  departmentId: string;
  createdAt: Date;
  updatedAt: Date;
}
