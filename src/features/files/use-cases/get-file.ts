import { notFoundError } from "@/server/errors/app-error";
import type { Actor } from "@/server/authz";
import { findFileInScope } from "@/features/files/repository/file-repository";
import type { SafeFile } from "@/features/files/domain/file";

/**
 * Load a single file for metadata display or as the authorization step
 * before serving its bytes (`/api/files/[fileId]`). `findFileInScope` already
 * returns `null` for a cross-department id exactly like a nonexistent one —
 * see docs/architecture/authorization.md's 403-vs-404 guidance.
 */
export async function getFile(actor: Actor, fileId: string): Promise<SafeFile> {
  const file = await findFileInScope(actor, fileId);
  if (!file) throw notFoundError();
  return file;
}
