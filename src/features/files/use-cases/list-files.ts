import { authorize, type Actor } from "@/server/authz";
import { listFiles as listFilesRepo } from "@/features/files/repository/file-repository";
import type { SafeFile } from "@/features/files/domain/file";
import type { ListFilesInput } from "@/features/files/schemas/list-files.schema";
import type { Paginated } from "@/types";

/**
 * The Gallery view — always `GALLERY_ASSET`. A `JOB_ARTIFACT` never appears
 * here; it belongs to a specific Job's detail view (a later phase), not the
 * reusable-asset library.
 */
export async function listGalleryFiles(
  actor: Actor,
  input: ListFilesInput,
): Promise<Paginated<SafeFile>> {
  // Role floor only — the actual department scoping happens inside the
  // repository via `departmentScopeFilter(actor)`, not here (there is no
  // single "target department" for a list operation to check against).
  authorize(actor, "file:manage");
  return listFilesRepo(actor, { category: "GALLERY_ASSET", ...input });
}
