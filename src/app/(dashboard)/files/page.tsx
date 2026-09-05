import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, FolderOpen } from "lucide-react";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import {
  firstSearchParamValue,
  PageLink,
} from "@/components/layout/pagination-link";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { safeParseInput } from "@/server/validation";
import { listFilesSchema } from "@/features/files/schemas/list-files.schema";
import { listGalleryFiles } from "@/features/files/use-cases/list-files";
import { canDeleteFile } from "@/features/files/use-cases/authorize-file-management";
import { listDepartmentsForAdmin } from "@/features/departments/read/list-departments-for-admin";
import { FileCard } from "@/features/files/components/file-card";
import { FilesToolbar } from "@/features/files/components/files-toolbar";
import { UploadFileForm } from "@/features/files/components/upload-file-form";

export const metadata: Metadata = { title: "Files" };

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const actor = toActor(user);

  const rawParams = await searchParams;
  const parsed = safeParseInput(listFilesSchema, {
    q: firstSearchParamValue(rawParams.q),
    kind: firstSearchParamValue(rawParams.kind),
    page: firstSearchParamValue(rawParams.page),
    pageSize: firstSearchParamValue(rawParams.pageSize),
  });
  // A malformed query string (e.g. a hand-edited URL) falls back to the
  // schema's defaults rather than erroring the whole page.
  const filters = parsed.ok ? parsed.data : listFilesSchema.parse({});

  const [{ items, page, pageSize, total }, departmentChoices] =
    await Promise.all([
      listGalleryFiles(actor, filters),
      actor.role === "ADMIN" ? listDepartmentsForAdmin(actor) : undefined,
    ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <PageShell>
      <PageHeader
        title="Files"
        description="Your department's reusable media library."
      />

      <div className="space-y-6">
        <UploadFileForm departmentChoices={departmentChoices} />
        <FilesToolbar activeKind={filters.kind} />

        {items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                <FolderOpen className="size-6" />
              </div>
              <p className="text-sm font-medium">No files yet</p>
              <p className="text-muted-foreground max-w-sm text-sm">
                {filters.q || filters.kind
                  ? "No files match your search/filter."
                  : "Upload a file above to add it to your gallery."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                canDelete={canDeleteFile(actor, file)}
              />
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-center gap-2">
            <PageLink
              href="/files"
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
              href="/files"
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
