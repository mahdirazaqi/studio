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
  /** Normalized digits-only (`features/telegram/domain/phone.ts`'s
   * `normalizePhone`) or `null` if never set — Phase 8/ADR-0036 added the
   * column for Telegram linking; Phase 20/ADR-0051 added the profile-editing
   * UI that lets a user set/change it themselves. */
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}
