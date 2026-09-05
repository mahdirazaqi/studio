import { authorize, type Actor } from "@/server/authz";
import { listFiles as listFilesRepo } from "@/features/files/repository/file-repository";
import type { SafeFile } from "@/features/files/domain/file";

/**
 * ADMIN-only, cross-department Gallery listing, capped and unpaginated — the
 * only consumer is the Template asset editor's "default file" picker
 * (`features/templates/components/template-asset-editor.tsx`) when ADMIN is
 * authoring a Template for a department other than their own: ADMIN needs
 * *some* file list to pick from before a department is even chosen, and
 * `listGalleryFiles`'s normal department scoping (`departmentScopeFilter`)
 * only ever returns the *actor's* department for a non-ADMIN, which is the
 * wrong scope here. `SafeFile.departmentId` lets the client filter this list
 * down to whichever department is currently selected in the form.
 *
 * Deliberately not a general "browse everything" endpoint: capped at 100
 * files, most-recent first — enough for a picker, not a substitute for the
 * paginated Gallery page. `department:view_all` (ADMIN-only, ADR-0022) is the
 * right capability floor: this is the same "see across departments" grant
 * `listDepartmentsForAdmin` already uses.
 */
export async function listAllGalleryFilesForAdmin(
  actor: Actor,
): Promise<SafeFile[]> {
  authorize(actor, "department:view_all");
  const { items } = await listFilesRepo(actor, {
    category: "GALLERY_ASSET",
    page: 1,
    pageSize: 100,
  });
  return items;
}
