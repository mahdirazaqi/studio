import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ForbiddenPage } from "@/components/layout/forbidden-page";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { DepartmentsManager } from "@/features/departments/components/departments-manager";
import { listAllDepartments } from "@/features/departments/repository/department-repository";

export const metadata: Metadata = { title: "Departments" };

/**
 * `/departments` is **ADMIN-only** (revised — docs/domain/departments.md
 * "Profile display"): Department management now sits alongside Worker API
 * Key and YouTube Channel scoping as system-wide admin configuration, not a
 * resource any USER/MANAGER views directly. A USER/MANAGER instead sees
 * their own Department's name in the sidebar footer
 * (`components/layout/app-sidebar.tsx`) — resolved from their own session,
 * no separate page or query. Direct URL access is checked here server-side;
 * hiding the nav item (`navigationForRole`) is only a presentation choice.
 */
export default async function DepartmentsPage() {
  const user = await requireUser();
  const actor = toActor(user);
  if (actor.role !== "ADMIN") {
    return <ForbiddenPage />;
  }

  const departments = await listAllDepartments();

  return (
    <PageShell>
      <PageHeader
        title="Departments"
        description="The tenancy boundary. Create and rename departments system-wide."
      />
      <DepartmentsManager departments={departments} isAdmin />
    </PageShell>
  );
}
