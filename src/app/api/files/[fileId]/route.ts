import { Readable } from "node:stream";

import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { storage } from "@/server/adapters/storage";
import { AppError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import { getFileForServing } from "@/features/files/use-cases/get-file-for-serving";

/**
 * Serves a File's bytes to the browser (`<img>`/`<audio>`/`<video>` `src`).
 *
 * This is deliberately a plain Route Handler, not `defineRouteHandler`
 * (`@/server/api`) — that helper always returns JSON, and binary streaming
 * with byte-range support needs a raw `Response`. It is also deliberately
 * **not** an exception to "no internal REST for UI features"
 * (docs/architecture/boundaries.md): it carries no business logic, only an
 * authenticated read-and-stream, because a browser media element fetches its
 * `src` as a plain GET and there is no Server Component/Action equivalent for
 * that. See docs/architecture/files.md "Access & preview".
 *
 * Every request re-authenticates the session and re-checks department scope
 * — there is no signed/cacheable URL. A cross-department or unknown id
 * resolves identically (404), matching `assertDepartmentScopeOrNotFound`'s
 * reasoning even though this path uses the query-scoping variant instead
 * (`findFileForServing`).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  const { fileId } = await params;

  let actor;
  try {
    actor = toActor(await requireUser());
  } catch {
    return new Response(null, { status: 401 });
  }

  let file;
  try {
    file = await getFileForServing(actor, fileId);
  } catch (error) {
    const status = AppError.isAppError(error) ? error.httpStatus : 500;
    if (status === 500) {
      logger.error("Unexpected error resolving a file for serving", {
        fileId,
        cause: error,
      });
    }
    return new Response(null, { status });
  }

  const range = parseRange(request.headers.get("range"), file.sizeBytes);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${file.sizeBytes}` },
    });
  }

  const headers = new Headers({
    "Content-Type": file.mimeType,
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  });

  try {
    if (range) {
      headers.set("Content-Length", String(range.end - range.start + 1));
      headers.set(
        "Content-Range",
        `bytes ${range.start}-${range.end}/${file.sizeBytes}`,
      );
      const nodeStream = storage.readStream(file.storageKey, range);
      return new Response(toWebStream(nodeStream), {
        status: 206,
        headers,
      });
    }

    headers.set("Content-Length", String(file.sizeBytes));
    const nodeStream = storage.readStream(file.storageKey);
    return new Response(toWebStream(nodeStream), { status: 200, headers });
  } catch (error) {
    logger.error("Storage read failed while serving a file", {
      fileId,
      cause: error,
    });
    return new Response(null, { status: 503 });
  }
}

function toWebStream(nodeStream: NodeJS.ReadableStream): ReadableStream {
  return Readable.toWeb(nodeStream as Readable) as ReadableStream;
}

/** A single `bytes=start-end` range. No multi-range support. */
function parseRange(
  header: string | null,
  sizeBytes: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  let start: number;
  let end: number;
  if (!startText) {
    // Suffix range: last N bytes.
    const suffixLength = Number(endText);
    start = Math.max(sizeBytes - suffixLength, 0);
    end = sizeBytes - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : sizeBytes - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start > end ||
    start >= sizeBytes
  ) {
    return "unsatisfiable";
  }

  return { start, end: Math.min(end, sizeBytes - 1) };
}
