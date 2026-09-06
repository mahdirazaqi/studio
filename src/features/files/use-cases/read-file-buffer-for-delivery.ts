import { notFoundError } from "@/server/errors/app-error";
import { storage } from "@/server/adapters/storage";
import { findFileForWorkerServing } from "@/features/files/repository/file-repository";

/**
 * Reads an entire File's bytes into memory — for `features/delivery`'s
 * YouTube upload step, which needs a `Buffer`/`Readable` to hand `googleapis`,
 * not a streamed HTTP response. Unscoped, like `findFileForWorkerServing`:
 * the caller (the post-render delivery orchestrator) already resolved this
 * id from the Job's own `videoFileId`/`screenshotFileId`, not from client
 * input — the same system-internal trust level the Worker's own file access
 * already documents (docs/architecture/files.md "Access & preview: Worker
 * access").
 */
export async function readFileBufferForDelivery(
  fileId: string,
): Promise<Buffer> {
  const file = await findFileForWorkerServing(fileId);
  if (!file) {
    throw notFoundError("The referenced file no longer exists.");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of storage.readStream(
    file.storageKey,
  ) as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
