import { conflictError, forbiddenError } from "@/server/errors/app-error";
import { authorize, hasAtLeastRole, type Actor } from "@/server/authz";
import type { SafeFile } from "@/features/files/domain/file";
import { countTemplateAssetReferencesToFile } from "@/features/templates/repository/template-repository";
import { countActiveJobAssetReferencesToFile } from "@/features/jobs/repository/job-repository";

/**
 * Authorization policy for file mutations. `authorize(actor, "file:manage",
 * ...)` (registered in Phase 3) is the coarse gate — role floor `USER` +
 * department match; this module adds the destructive-operation-specific rule
 * the matrix leaves as a parenthetical.
 */

/**
 * Can `actor` delete `file`?
 *
 * docs/domain/authorization.md's "Delete a Persistent Gallery Asset" row
 * shows USER as allowed but flags it `(own uploads? OPEN DECISION)`, and the
 * page's own recommendation leans toward reserving destructive file
 * operations for MANAGER+. This implements the conservative middle reading
 * literally spelled out in that parenthetical, rather than picking either
 * extreme: a USER may delete a file **they uploaded**; MANAGER/ADMIN may
 * delete any file in scope. See ADR-0025.
 */
export function assertCanDeleteFile(actor: Actor, file: SafeFile): void {
  authorize(actor, "file:manage", { departmentId: file.departmentId });
  if (actor.role === "USER" && file.uploadedByUserId !== actor.userId) {
    throw forbiddenError();
  }
}

/**
 * Non-throwing predicate for the UI (e.g. "show the delete button"). Purely a
 * rendering decision — `deleteFile`'s own `assertCanDeleteFile` call is what
 * actually enforces this; see docs/architecture/authorization.md "UI
 * restrictions are not authorization."
 */
export function canDeleteFile(actor: Actor, file: SafeFile): boolean {
  if (!hasAtLeastRole(actor, "USER")) return false;
  if (actor.departmentId !== file.departmentId && actor.role !== "ADMIN") {
    return false;
  }
  return actor.role !== "USER" || file.uploadedByUserId === actor.userId;
}

/**
 * A File must not be deleted while an **active** Job
 * (`QUEUED`/`CLAIMED`/`RENDERING`/`DELIVERING`) depends on it as an input —
 * historical (terminal-state) Jobs never depend on this row, because their
 * `JobAsset` rows already carry a copy of everything they need
 * (`fileOriginalName`/`fileMimeType`/`fileSizeBytes`/`fileWidth`/`fileHeight`,
 * ADR-0028), only in-flight ones do (docs/data/lifecycle-rules.md "Files —
 * hard delete when safe").
 *
 * **Real, Phase 6** — this was a documented no-op through Phase 5 (ADR-0025)
 * because no Job model existed; `countActiveJobAssetReferencesToFile`
 * (`features/jobs/repository/job-repository.ts`) is the query that hook was
 * always meant to gain.
 */
export async function assertNoActiveJobDependencies(
  file: SafeFile,
): Promise<void> {
  const referenceCount = await countActiveJobAssetReferencesToFile(file.id);
  if (referenceCount > 0) {
    throw conflictError(
      "This file is used as an input by one or more active jobs and cannot be deleted until they finish, fail, or are canceled.",
    );
  }
}

/**
 * The Phase 5 counterpart to `assertNoActiveJobDependencies`, and — unlike
 * that one — a real check: a File currently used as a Template asset's
 * default (`TemplateAsset.defaultFileId`, ADR-0027) must not be deleted out
 * from under that Template (docs/domain/templates.md "Template → File
 * dependency"; Phase 5 brief §13). `defaultFileId`'s `onDelete: Restrict` FK
 * would refuse the delete at the database level regardless, but checking
 * first means the caller gets a clean, safe `conflict` error instead of a raw
 * Postgres foreign-key violation — the same reasoning ADR-0025 already
 * applied to the (still not-yet-real) Job check above.
 */
export async function assertNoActiveTemplateDependencies(
  file: SafeFile,
): Promise<void> {
  const referenceCount = await countTemplateAssetReferencesToFile(file.id);
  if (referenceCount > 0) {
    throw conflictError(
      "This file is used as the default for one or more template assets and cannot be deleted. Remove it from those templates first.",
    );
  }
}
