import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ForbiddenPage } from "@/components/layout/forbidden-page";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { AppError } from "@/server/errors/app-error";
import { hasAtLeastRole } from "@/lib/roles";
import { TemplateForm } from "@/features/templates/components/template-form";
import { getTemplate } from "@/features/templates/use-cases/get-template";
import { listGalleryFiles } from "@/features/files/use-cases/list-files";
import { listAllGalleryFilesForAdmin } from "@/features/files/use-cases/list-all-gallery-files-for-admin";
import { listYoutubeTargetsForTemplateForm } from "@/features/templates/use-cases/list-youtube-targets-for-template-form";
import { listAllYoutubeTargetsForTemplateFormAdmin } from "@/features/templates/use-cases/list-all-youtube-targets-for-template-form-admin";
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
  const [galleryFiles, youtubeTargets, departmentChoices] = await Promise.all([
    isAdmin
      ? listAllGalleryFilesForAdmin(actor)
      : listGalleryFiles(actor, { page: 1, pageSize: 100 }).then(
          (result) => result.items,
        ),
    // `listYoutubeTargetsForTemplateForm` requires `template:manage` — a
    // plain USER (view-only) never reaches it, so a read-only viewer simply
    // sees an empty picker rather than the connected channel's name (a
    // cosmetic gap only; the Template's own `youtubeTargetId` is unaffected
    // and still drives real delivery behavior regardless of what this page
    // renders).
    canManage
      ? isAdmin
        ? listAllYoutubeTargetsForTemplateFormAdmin(actor)
        : listYoutubeTargetsForTemplateForm(actor, template.departmentId)
      : Promise.resolve([]),
    // ADMIN-only — lets `TemplateForm` offer a Department transfer
    // (docs/domain/templates.md "Department transfer", ADR-0040).
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
        youtubeTargets={youtubeTargets}
        departmentChoices={departmentChoices}
        readOnly={!canManage || Boolean(template.deletedAt)}
      />
    </PageShell>
  );
}
