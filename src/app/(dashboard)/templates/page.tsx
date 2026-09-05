import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileVideo, Plus } from "lucide-react";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
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
import { listTemplatesSchema } from "@/features/templates/schemas/list-templates.schema";
import { listDepartmentTemplates } from "@/features/templates/use-cases/list-templates";
import { listDepartmentsForAdmin } from "@/features/departments/read/list-departments-for-admin";
import { TemplateListItem } from "@/features/templates/components/template-list-item";
import { TemplatesToolbar } from "@/features/templates/components/templates-toolbar";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const actor = toActor(user);
  const canManage = hasAtLeastRole(actor.role, "MANAGER");

  const rawParams = await searchParams;
  const parsed = safeParseInput(listTemplatesSchema, {
    q: firstSearchParamValue(rawParams.q),
    status: firstSearchParamValue(rawParams.status),
    page: firstSearchParamValue(rawParams.page),
    pageSize: firstSearchParamValue(rawParams.pageSize),
  });
  const filters = parsed.ok ? parsed.data : listTemplatesSchema.parse({});

  const [{ items, page, pageSize, total }, departments] = await Promise.all([
    listDepartmentTemplates(actor, filters),
    actor.role === "ADMIN" ? listDepartmentsForAdmin(actor) : undefined,
  ]);
  const departmentNameById = new Map(
    departments?.map((department) => [department.id, department.name]),
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <PageShell>
      <PageHeader
        title="Templates"
        description="Reusable render recipes and their asset slots."
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/templates/new">
                <Plus /> New template
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-6">
        <TemplatesToolbar activeStatus={filters.status} />

        {items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                <FileVideo className="size-6" />
              </div>
              <p className="text-sm font-medium">No templates yet</p>
              <p className="text-muted-foreground max-w-sm text-sm">
                {filters.q || filters.status
                  ? "No templates match your search/filter."
                  : canManage
                    ? "Create a template to define a reusable render recipe."
                    : "Your department manager hasn't created any templates yet."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((template) => (
              <TemplateListItem
                key={template.id}
                template={template}
                canManage={canManage}
                departmentName={departmentNameById.get(template.departmentId)}
              />
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-center gap-2">
            <PageLink
              href="/templates"
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
              href="/templates"
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
