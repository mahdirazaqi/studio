import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ForbiddenPage } from "@/components/layout/forbidden-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { hasAtLeastRole } from "@/lib/roles";
import { findUserInScope } from "@/features/users/repository/user-repository";
import { EditUserProfileForm } from "@/features/users/components/edit-user-profile-form";
import { UserActions } from "@/features/users/components/user-actions";
import { listDepartmentsForAdmin } from "@/features/departments/read/list-departments-for-admin";

export const metadata: Metadata = { title: "Edit User" };

/**
 * MANAGER/ADMIN editing another User's `fullName`/`phone`, plus the existing
 * role/active-status controls (`UserActions`, unmodified — Phase 20/
 * ADR-0051 adds no new role/status logic, only reuses it here).
 *
 * `/users` requires MANAGER+ (`docs/architecture/authorization.md`) —
 * checked here again for direct URL access, not just hidden from nav.
 * `findUserInScope` is department-scoped, so a MANAGER given another
 * department's user id gets the same `notFound()` a nonexistent id would
 * (403-vs-404 guidance) — `EditUserProfileForm`'s own server-side
 * authorization (`assertCanEditProfile`) is defense-in-depth, not the
 * primary gate.
 */
export default async function EditUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const user = await requireUser();
  const actor = toActor(user);

  if (!hasAtLeastRole(actor.role, "MANAGER")) {
    return <ForbiddenPage />;
  }

  const target = await findUserInScope(actor, userId);
  if (!target) notFound();

  const isAdmin = actor.role === "ADMIN";
  // A MANAGER may only reach a USER-role target at all (mirrors
  // `assertCanSetActiveStatus`/`assertCanEditProfile`'s own rule) — a peer
  // MANAGER or an ADMIN row exists (found above) but isn't editable from
  // here for a non-ADMIN viewer.
  const canEdit = isAdmin || target.role === "USER";
  const isSelf = target.id === actor.userId;

  const departmentChoices = isAdmin
    ? await listDepartmentsForAdmin(actor)
    : undefined;
  const departmentName =
    departmentChoices?.find((d) => d.id === target.departmentId)?.name ??
    user.departmentName;

  return (
    <PageShell>
      <PageHeader
        title={`Edit ${target.fullName}`}
        description={target.email}
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-6 text-sm">
            <span className="text-muted-foreground">Department: </span>
            <Badge variant="outline">{departmentName}</Badge>
            {!isSelf && canEdit ? (
              <div className="ml-auto">
                <UserActions
                  userId={target.id}
                  userName={target.fullName}
                  status={target.status}
                  role={target.role}
                  canChangeRole={isAdmin}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        {canEdit ? (
          <EditUserProfileForm
            userId={target.id}
            fullName={target.fullName}
            phone={target.phone}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            You are not authorized to edit this user.
          </p>
        )}
      </div>
    </PageShell>
  );
}
