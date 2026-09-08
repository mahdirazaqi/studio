import { authorize, type Actor } from "@/server/authz";
import { listFiles as listFilesRepo } from "@/features/files/repository/file-repository";
import type { SafeFile } from "@/features/files/domain/file";
import type { SearchGalleryFilesInput } from "@/features/files/schemas/search-gallery-files.schema";
import type { Paginated } from "@/types";

/**
 * Live search backing the Job asset File Picker
 * (`features/files/components/file-picker.tsx`) — same `file:manage`
 * (USER+) floor and same department scoping as `listGalleryFiles`, just with
 * an additional advisory `departmentId` narrowing for ADMIN (see
 * `ListFilesFilters.departmentId`). Always `GALLERY_ASSET` — a `JOB_ARTIFACT`
 * is never selectable here.
 */
export async function searchGalleryFiles(
  actor: Actor,
  input: SearchGalleryFilesInput,
): Promise<Paginated<SafeFile>> {
  authorize(actor, "file:manage");
  return listFilesRepo(actor, { category: "GALLERY_ASSET", ...input });
}
