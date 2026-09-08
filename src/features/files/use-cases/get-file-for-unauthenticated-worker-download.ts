import { notFoundError } from "@/server/errors/app-error";
import {
  findFileIfActiveJobInput,
  type FileForServing,
} from "@/features/files/repository/file-repository";

/**
 * ADR-0043 — see `findFileIfActiveJobInput`'s doc comment for the full
 * reasoning. Only `/api/files/[fileId]` calls this, and only for a request
 * with neither an `Authorization` header nor a session cookie — the actual
 * Worker's real behavior when downloading a Job's Template/asset files.
 */
export async function getFileForUnauthenticatedWorkerDownload(
  fileId: string,
): Promise<FileForServing> {
  const file = await findFileIfActiveJobInput(fileId);
  if (!file) throw notFoundError();
  return file;
}
