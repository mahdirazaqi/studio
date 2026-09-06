import { notFoundError } from "@/server/errors/app-error";
import {
  findFileForWorkerServing,
  type FileForServing,
} from "@/features/files/repository/file-repository";

/**
 * Worker-facing counterpart to `get-file-for-serving.ts` — no `Actor`, no
 * department scope. Only `/api/files/[fileId]` calls this, and only when the
 * request presented a Worker credential rather than a session cookie (Phase
 * 7). See `findFileForWorkerServing`'s doc comment for the trust reasoning.
 */
export async function getFileForWorkerServing(
  fileId: string,
): Promise<FileForServing> {
  const file = await findFileForWorkerServing(fileId);
  if (!file) throw notFoundError();
  return file;
}
