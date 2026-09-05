import type { Metadata } from "next";

import { ForbiddenPage } from "@/components/layout/forbidden-page";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
import { requireUser } from "@/server/auth/current-user";
import { hasAtLeastRole, toActor } from "@/server/authz";

export const metadata: Metadata = { title: "Users" };

/**
 * `/users` requires at least MANAGER (docs/domain/authorization.md — "View
 * users": MANAGER own department, ADMIN all). Direct URL access is checked
 * here server-side; hiding the nav item for a plain USER (`navigationForRole`
 * in the sidebar) is only a presentation choice, not the enforcement
 * (docs/architecture/authorization.md).
 */
export default async function UsersPage() {
  const actor = toActor(await requireUser());
  if (!hasAtLeastRole(actor, "MANAGER")) {
    return <ForbiddenPage />;
  }

  return (
    <PlaceholderPage
      title="Users"
      description="Department members, roles, and the active / disabled lifecycle."
      phase="the Users management phase"
    />
  );
}
