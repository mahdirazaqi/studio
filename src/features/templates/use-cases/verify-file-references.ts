import { businessRuleError } from "@/server/errors/app-error";
import { findGalleryFileIdsInDepartment } from "@/features/files/repository/file-repository";

/**
 * Every asset's `defaultFileId` must resolve to a real Gallery Asset in the
 * Template's own Department — never the actor's, and never trusted from the
 * client as-is (docs/domain/templates.md "File Gallery Integration"; Phase 5
 * brief §11/§29). This is what actually stops "create a Template in
 * Department A, submit a File id from Department B": the id is looked up
 * scoped to `departmentId`, so a cross-department id simply doesn't come back
 * — the same 403-vs-404-shaped "existence" caution
 * (docs/architecture/authorization.md) applies here too, so the error names
 * no specific id or department.
 */
export async function verifyAssetFileReferences(
  departmentId: string,
  assets: readonly { defaultFileId?: string | null }[],
): Promise<void> {
  const fileIds = [
    ...new Set(
      assets
        .map((asset) => asset.defaultFileId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (fileIds.length === 0) return;

  const found = await findGalleryFileIdsInDepartment(departmentId, fileIds);
  const missing = fileIds.some((id) => !found.has(id));
  if (missing) {
    throw businessRuleError(
      "One or more selected files could not be found in this department's gallery. They may have been deleted or belong to a different department.",
    );
  }
}
