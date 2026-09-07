import {
  Building2,
  FileVideo,
  FolderOpen,
  KeyRound,
  LayoutDashboard,
  ListVideo,
  Users,
  Youtube,
  type LucideIcon,
} from "lucide-react";

import { ROLE_RANK, type Role } from "@/lib/roles";

/**
 * Centralized navigation definition.
 *
 * Navigation is data, not logic. Each item may declare a minimum role; the
 * sidebar filters items with a pure helper once the real session exists. No
 * authorization decision is made here — this only controls what is *shown*.
 * Route access is always enforced server-side.
 */
export interface NavItem {
  /** Visible label (English). */
  label: string;
  /** App route. */
  href: string;
  icon: LucideIcon;
  /** Minimum role required to see this item. Omit = visible to any signed-in user. */
  minRole?: Role;
  /** Marked as not yet built — rendered with a "soon" affordance in Phase 1. */
  placeholder?: boolean;
}

export interface NavGroup {
  /** Group heading, or `null` for an unlabeled group. */
  label: string | null;
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  {
    label: null,
    items: [
      // The "Soon" badge stuck around from Phase 1, long after the page
      // itself became real (Phase 10) — a misleading UI defect, fixed here.
      {
        label: "Overview",
        href: "/",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "Rendering",
    items: [
      // Implemented, Phase 6.
      { label: "Jobs", href: "/jobs", icon: ListVideo },
      {
        // Implemented, Phase 5 — the `placeholder` badge was still on Templates
        // from before this feature existed; also fixing the same leftover flag
        // on Files below (implemented since Phase 4, never flipped off).
        label: "Templates",
        href: "/templates",
        icon: FileVideo,
      },
      { label: "Files", href: "/files", icon: FolderOpen },
    ],
  },
  {
    label: "Administration",
    items: [
      // Implemented, Phase 10 — create/list/disable-enable/role-change.
      {
        label: "Users",
        href: "/users",
        icon: Users,
        minRole: "MANAGER",
      },
      // ADMIN-only (revised): Department *management* is a system-wide
      // operation now that Worker API Keys and YouTube Channels are also
      // Department-scoped from the same admin surface. USER/MANAGER see
      // their own Department name in the sidebar footer instead
      // (docs/domain/departments.md "Profile display") — enforced
      // server-side on the route itself, not just hidden here.
      {
        label: "Departments",
        href: "/departments",
        icon: Building2,
        minRole: "ADMIN",
      },
      // ADMIN-only (revised) — connecting/managing a YouTube channel and its
      // Department scope is system-wide infrastructure configuration;
      // non-admins only *pick* an already-connected, already-scoped channel
      // from a Template, they never manage the connection itself
      // (docs/integrations/youtube.md).
      {
        label: "YouTube",
        href: "/youtube",
        icon: Youtube,
        minRole: "ADMIN",
      },
      // New — ADMIN-only management of Worker API Keys and their Department
      // scope (docs/integrations/worker-api.md "Worker API Keys").
      {
        label: "Worker API Keys",
        href: "/worker-keys",
        icon: KeyRound,
        minRole: "ADMIN",
      },
    ],
  },
];

/** Pure filter: which nav groups/items a given role may see. */
export function navigationForRole(role: Role | null): NavGroup[] {
  return navigation
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !item.minRole ||
          (role !== null && ROLE_RANK[role] >= ROLE_RANK[item.minRole]),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/** Flattened list, useful for breadcrumb / active-route lookup. */
export const navItems: NavItem[] = navigation.flatMap((g) => g.items);
