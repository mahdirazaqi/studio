import {
  Building2,
  FileVideo,
  FolderOpen,
  LayoutDashboard,
  ListVideo,
  Users,
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
      {
        label: "Overview",
        href: "/",
        icon: LayoutDashboard,
        placeholder: true,
      },
    ],
  },
  {
    label: "Rendering",
    items: [
      { label: "Jobs", href: "/jobs", icon: ListVideo, placeholder: true },
      {
        label: "Templates",
        href: "/templates",
        icon: FileVideo,
        placeholder: true,
      },
      { label: "Files", href: "/files", icon: FolderOpen, placeholder: true },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        label: "Users",
        href: "/users",
        icon: Users,
        minRole: "MANAGER",
        placeholder: true,
      },
      {
        label: "Departments",
        href: "/departments",
        icon: Building2,
        minRole: "ADMIN",
        placeholder: true,
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
