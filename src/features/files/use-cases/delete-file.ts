import { notFoundError } from "@/server/errors/app-error";
import type { Actor } from "@/server/authz";
import { logger } from "@/server/logger";
import { storage } from "@/server/adapters/storage";
import {
  assertCanDeleteFile,
  assertNoActiveJobDependencies,
} from "@/features/files/use-cases/authorize-file-management";
import {
  deleteFileRow,
  findFileInScope,
  findStorageKey,
} from "@/features/files/repository/file-repository";

/**
 * Hard-delete a file (row + bytes) — there is no soft delete
 * (docs/data/lifecycle-rules.md "Files — hard delete when safe").
 *
 * The database row is deleted *before* the storage bytes: if the storage
 * delete then fails, the result is an orphaned object with nothing pointing
 * at it (wasted space, safe) rather than a database row pointing at bytes
 * that might not exist (a broken "file" a user could still try to open).
 */
export async function deleteFile(actor: Actor, fileId: string): Promise<void> {
  const file = await findFileInScope(actor, fileId);
  if (!file) throw notFoundError();

  assertCanDeleteFile(actor, file);
  await assertNoActiveJobDependencies(file);

  const storageKey = await findStorageKey(fileId);
  if (!storageKey) throw notFoundError();

  await deleteFileRow(fileId);

  try {
    await storage.delete(storageKey);
  } catch (error) {
    logger.error(
      "Failed to delete storage object after deleting its File row",
      {
        fileId,
        storageKey,
        cause: error,
      },
    );
  }
}
