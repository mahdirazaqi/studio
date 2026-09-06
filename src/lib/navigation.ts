import {
  Building2,
  FileVideo,
  FolderOpen,
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
      // Implemented, Phase 10 — every role may view their own department;
      // only ADMIN sees create/rename (enforced server-side, not by this
      // nav filter — see `/departments`'s own page comment).
      {
        label: "Departments",
        href: "/departments",
        icon: Building2,
      },
      // Implemented, Phase 9 — connect/manage YouTube delivery channels.
      {
        label: "YouTube",
        href: "/youtube",
        icon: Youtube,
        minRole: "MANAGER",
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
