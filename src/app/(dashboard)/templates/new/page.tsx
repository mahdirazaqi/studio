import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ForbiddenPage } from "@/components/layout/forbidden-page";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { hasAtLeastRole } from "@/lib/roles";
import { TemplateForm } from "@/features/templates/components/template-form";
import { listGalleryFiles } from "@/features/files/use-cases/list-files";
import { listAllGalleryFilesForAdmin } from "@/features/files/use-cases/list-all-gallery-files-for-admin";
import { listYoutubeTargetsForTemplateForm } from "@/features/templates/use-cases/list-youtube-targets-for-template-form";
import { listAllYoutubeTargetsForTemplateFormAdmin } from "@/features/templates/use-cases/list-all-youtube-targets-for-template-form-admin";
import { listDepartmentsForAdmin } from "@/features/departments/read/list-departments-for-admin";

export const metadata: Metadata = { title: "New Template" };

export default async function NewTemplatePage() {
  const user = await requireUser();
  const actor = toActor(user);

  // Role-gated exactly like a click would be (docs/architecture/authorization.md
  // "Server Component authorization") — `template:manage` is MANAGER+, direct
  // URL navigation is checked independently of whether the "New template"
  // button was ever rendered.
  if (!hasAtLeastRole(actor.role, "MANAGER")) {
    return <ForbiddenPage />;
  }

  const isAdmin = actor.role === "ADMIN";
  const [galleryFiles, youtubeTargets, departmentChoices] = await Promise.all([
    isAdmin
      ? listAllGalleryFilesForAdmin(actor)
      : listGalleryFiles(actor, { page: 1, pageSize: 100 }).then(
          (result) => result.items,
        ),
    isAdmin
      ? listAllYoutubeTargetsForTemplateFormAdmin(actor)
      : listYoutubeTargetsForTemplateForm(actor, actor.departmentId),
    isAdmin ? listDepartmentsForAdmin(actor) : undefined,
  ]);

  return (
    <PageShell>
      <PageHeader
        title="New template"
        description="Define a render recipe and its asset slots."
      />
      <TemplateForm
        mode="create"
        departmentChoices={departmentChoices}
        galleryFiles={galleryFiles}
        youtubeTargets={youtubeTargets}
      />
    </PageShell>
  );
}
