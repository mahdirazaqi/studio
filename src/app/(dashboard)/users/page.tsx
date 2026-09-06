import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Users as UsersIcon,
} from "lucide-react";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ForbiddenPage } from "@/components/layout/forbidden-page";
import {
  firstSearchParamValue,
  PageLink,
} from "@/components/layout/pagination-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { safeParseInput } from "@/server/validation";
import { hasAtLeastRole } from "@/lib/roles";
import { listUsersSchema } from "@/features/users/schemas/list-users.schema";
import { listUsers } from "@/features/users/use-cases/list-users";
import { UserListItem } from "@/features/users/components/user-list-item";
import { UsersToolbar } from "@/features/users/components/users-toolbar";
import { listDepartmentsForAdmin } from "@/features/departments/read/list-departments-for-admin";

export const metadata: Metadata = { title: "Users" };

/**
 * `/users` requires at least MANAGER (docs/domain/authorization.md — "View
 * users": MANAGER own department, ADMIN all). Direct URL access is checked
 * here server-side; hiding the nav item for a plain USER (`navigationForRole`
 * in the sidebar) is only a presentation choice, not the enforcement
 * (docs/architecture/authorization.md).
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const actor = toActor(user);
  if (!hasAtLeastRole(actor.role, "MANAGER")) {
    return <ForbiddenPage />;
  }
  const isAdmin = actor.role === "ADMIN";

  const rawParams = await searchParams;
  const parsed = safeParseInput(listUsersSchema, {
    q: firstSearchParamValue(rawParams.q),
    page: firstSearchParamValue(rawParams.page),
    pageSize: firstSearchParamValue(rawParams.pageSize),
  });
  const filters = parsed.ok ? parsed.data : listUsersSchema.parse({});

  const [{ items, page, pageSize, total }, departments] = await Promise.all([
    listUsers(actor, filters),
    isAdmin ? listDepartmentsForAdmin(actor) : undefined,
  ]);
  const departmentNameById = new Map(
    departments?.map((department) => [department.id, department.name]),
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <PageShell>
      <PageHeader
        title="Users"
        description="Department members, roles, and the active / disabled lifecycle."
        actions={
          <Button asChild>
            <Link href="/users/new">
              <Plus /> New user
            </Link>
          </Button>
        }
      />

      <div className="space-y-6">
        <UsersToolbar />

        {items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                <UsersIcon className="size-6" />
              </div>
              <p className="text-sm font-medium">No users yet</p>
              <p className="text-muted-foreground max-w-sm text-sm">
                {filters.q
                  ? "No users match your search."
                  : "Create a user to give someone access to this department."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <UserListItem
                key={item.id}
                user={item}
                isSelf={item.id === actor.userId}
                canManage
                isAdmin={isAdmin}
                departmentName={departmentNameById.get(item.departmentId)}
              />
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-center gap-2">
            <PageLink
              href="/users"
              page={page - 1}
              disabled={page <= 1}
              searchParams={rawParams}
            >
              <ChevronLeft /> Previous
            </PageLink>
            <span className="text-muted-foreground text-sm">
              Page {page} of {totalPages}
            </span>
            <PageLink
              href="/users"
              page={page + 1}
              disabled={page >= totalPages}
              searchParams={rawParams}
            >
              Next <ChevronRight />
            </PageLink>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
