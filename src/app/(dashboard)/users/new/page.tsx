import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ForbiddenPage } from "@/components/layout/forbidden-page";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { hasAtLeastRole } from "@/lib/roles";
import { UserForm } from "@/features/users/components/user-form";
import { listDepartmentsForAdmin } from "@/features/departments/read/list-departments-for-admin";

export const metadata: Metadata = { title: "New User" };

export default async function NewUserPage() {
  const user = await requireUser();
  const actor = toActor(user);

  // Role-gated exactly like a click would be (docs/architecture/authorization.md
  // "Server Component authorization") — `user:manage` is MANAGER+, direct URL
  // navigation is checked independently of whether the "New user" button was
  // ever rendered.
  if (!hasAtLeastRole(actor.role, "MANAGER")) {
    return <ForbiddenPage />;
  }

  const isAdmin = actor.role === "ADMIN";
  const departmentChoices = isAdmin
    ? await listDepartmentsForAdmin(actor)
    : undefined;

  return (
    <PageShell>
      <PageHeader
        title="New user"
        description={
          isAdmin
            ? "Create a user in any department, with any role."
            : "Create a user in your own department."
        }
      />
      <UserForm
        departmentChoices={departmentChoices}
        canCreateManagers={isAdmin}
      />
    </PageShell>
  );
}
