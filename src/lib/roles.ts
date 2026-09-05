/**
 * Role vocabulary. Client-safe (no server imports) so navigation and UI can
 * reason about roles without pulling in server-only modules.
 *
 * The authorization *rules* that use these roles live in `@/server/authz`
 * and are enforced server-side only. See docs/domain/authorization.md.
 */
export const ROLES = ["USER", "MANAGER", "ADMIN"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = {
  USER: 1,
  MANAGER: 2,
  ADMIN: 3,
};

export function hasAtLeastRole(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
