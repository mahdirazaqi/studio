import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { JobCreateForm } from "@/features/jobs/components/job-create-form";
import { listDepartmentTemplates } from "@/features/templates/use-cases/list-templates";
import { listDepartmentsForAdmin } from "@/features/departments/read/list-departments-for-admin";

export const metadata: Metadata = { title: "New Job" };

export default async function NewJobPage() {
  const user = await requireUser();
  const actor = toActor(user);
  const isAdmin = actor.role === "ADMIN";

  const [{ items: templates }, departments] = await Promise.all([
    listDepartmentTemplates(actor, {
      status: "ACTIVE",
      page: 1,
      pageSize: 100,
    }),
    isAdmin ? listDepartmentsForAdmin(actor) : undefined,
  ]);

  const departmentNameById = new Map(
    departments?.map((department) => [department.id, department.name]),
  );

  const templateChoices = templates.map((template) => ({
    id: template.id,
    name: template.name,
    departmentName: departmentNameById.get(template.departmentId),
  }));

  return (
    <PageShell>
      <PageHeader
        title="New job"
        description="Create a render request from a template."
      />
      <JobCreateForm templateChoices={templateChoices} />
    </PageShell>
  );
}
