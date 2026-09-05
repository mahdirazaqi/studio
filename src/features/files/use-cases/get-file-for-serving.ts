import { notFoundError } from "@/server/errors/app-error";
import type { Actor } from "@/server/authz";
import {
  findFileForServing,
  type FileForServing,
} from "@/features/files/repository/file-repository";

/**
 * The one place `storageKey` is read for an actual byte read (as opposed to
 * `delete-file.ts`'s cleanup read). Used only by `/api/files/[fileId]`
 * — see docs/architecture/files.md "Access & preview".
 */
export async function getFileForServing(
  actor: Actor,
  fileId: string,
): Promise<FileForServing> {
  const file = await findFileForServing(actor, fileId);
  if (!file) throw notFoundError();
  return file;
}
