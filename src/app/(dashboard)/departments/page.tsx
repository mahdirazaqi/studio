import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { DepartmentsManager } from "@/features/departments/components/departments-manager";
import { listDepartmentsForManagement } from "@/features/departments/use-cases/list-departments-for-management";

export const metadata: Metadata = { title: "Departments" };

/**
 * `/departments` is reachable by every signed-in role (docs/domain/
 * authorization.md — "View own department" ✅ for USER/MANAGER/ADMIN); only
 * ADMIN sees the create/rename controls. There is no separate `ForbiddenPage`
 * gate here the way `/users` has — viewing your own department is not a
 * privileged operation, matching the permission matrix exactly (only
 * "List all departments" and "Create / rename department" are ADMIN-only,
 * and both are gated inside `listDepartmentsForManagement`/the
 * create-rename actions themselves, not by hiding this page).
 */
export default async function DepartmentsPage() {
  const user = await requireUser();
  const actor = toActor(user);
  const isAdmin = actor.role === "ADMIN";

  const departments = await listDepartmentsForManagement(actor);

  return (
    <PageShell>
      <PageHeader
        title="Departments"
        description={
          isAdmin
            ? "The tenancy boundary. Create and rename departments system-wide."
            : "Your department — the tenancy boundary your resources belong to."
        }
      />
      <DepartmentsManager departments={departments} isAdmin={isAdmin} />
    </PageShell>
  );
}
