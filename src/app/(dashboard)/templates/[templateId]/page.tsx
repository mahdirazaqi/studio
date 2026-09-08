import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ForbiddenPage } from "@/components/layout/forbidden-page";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { AppError } from "@/server/errors/app-error";
import { hasAtLeastRole } from "@/lib/roles";
import { TemplateForm } from "@/features/templates/components/template-form";
import { TransferTemplateDepartmentForm } from "@/features/templates/components/transfer-template-department-form";
import { getTemplate } from "@/features/templates/use-cases/get-template";
import { listGalleryFiles } from "@/features/files/use-cases/list-files";
import { listAllGalleryFilesForAdmin } from "@/features/files/use-cases/list-all-gallery-files-for-admin";
import { listDepartmentsForAdmin } from "@/features/departments/read/list-departments-for-admin";

export const metadata: Metadata = { title: "Template" };

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const user = await requireUser();
  const actor = toActor(user);

  // `getTemplate` folds "doesn't exist" and "exists in another department"
  // into the same `not_found` (docs/architecture/authorization.md's
  // 403-vs-404 guidance) — a direct AppError catch here is this page's own
  // translation of that into the Next.js `notFound()` boundary, since no
  // Server Component in this codebase has needed that translation before
  // Templates got a detail-by-id page.
  let template;
  try {
    template = await getTemplate(actor, templateId);
  } catch (error) {
    if (error instanceof AppError && error.kind === "not_found") notFound();
    if (error instanceof AppError && error.kind === "forbidden") {
      return <ForbiddenPage />;
    }
    throw error;
  }

  const canManage = hasAtLeastRole(actor.role, "MANAGER");
  const isAdmin = actor.role === "ADMIN";
  const [galleryFiles, departmentChoices] = await Promise.all([
    isAdmin
      ? listAllGalleryFilesForAdmin(actor)
      : listGalleryFiles(actor, { page: 1, pageSize: 100 }).then(
          (result) => result.items,
        ),
    // ADMIN-only — renders the separate Transfer Department control below,
    // never `TemplateForm` itself (docs/domain/templates.md "Department
    // transfer" — deliberately distinct from Template Edit, ADR-0040/0042).
    isAdmin ? listDepartmentsForAdmin(actor) : undefined,
  ]);

  return (
    <PageShell>
      <PageHeader
        title={template.name}
        description={
          template.deletedAt
            ? "This template has been deleted — it is kept only for historical record and can no longer be edited."
            : canManage
              ? "Edit this template's configuration and asset slots."
              : "View this template's configuration and asset slots."
        }
      />
      <TemplateForm
        mode="edit"
        template={template}
        galleryFiles={galleryFiles}
        readOnly={!canManage || Boolean(template.deletedAt)}
      />
      {isAdmin && departmentChoices && !template.deletedAt ? (
        <TransferTemplateDepartmentForm
          templateId={template.id}
          currentDepartmentId={template.departmentId}
          departmentChoices={departmentChoices}
        />
      ) : null}
    </PageShell>
  );
}
