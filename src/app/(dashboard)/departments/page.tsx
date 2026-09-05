import type { Metadata } from "next";

import { ForbiddenPage } from "@/components/layout/forbidden-page";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
import { requireUser } from "@/server/auth/current-user";
import { hasAtLeastRole, toActor } from "@/server/authz";

export const metadata: Metadata = { title: "Departments" };

/**
 * `/departments` is ADMIN-only (docs/domain/authorization.md — "List all
 * departments"). See the note on `/users` for why this check lives here and
 * not only in the sidebar's `navigationForRole` filter.
 */
export default async function DepartmentsPage() {
  const actor = toActor(await requireUser());
  if (!hasAtLeastRole(actor, "ADMIN")) {
    return <ForbiddenPage />;
  }

  return (
    <PlaceholderPage
      title="Departments"
      description="The tenancy boundary. System administration area (ADMIN only)."
      phase="the Departments management phase"
    />
  );
}
