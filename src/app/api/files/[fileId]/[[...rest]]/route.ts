import { Readable } from "node:stream";

import { getCurrentUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { authenticateWorker } from "@/server/worker-auth";
import { storage } from "@/server/adapters/storage";
import { AppError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import { getFileForServing } from "@/features/files/use-cases/get-file-for-serving";
import { getFileForWorkerServing } from "@/features/files/use-cases/get-file-for-worker-serving";
import { getFileForUnauthenticatedWorkerDownload } from "@/features/files/use-cases/get-file-for-unauthenticated-worker-download";
import type { FileForServing } from "@/features/files/repository/file-repository";

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
 * Every request re-authenticates and re-checks scope — there is no
 * signed/cacheable URL. A cross-department or unknown id resolves
 * identically (404) for a dashboard session, matching
 * `assertDepartmentScopeOrNotFound`'s reasoning even though this path uses
 * the query-scoping variant instead (`findFileForServing`).
 *
 * **Three callers, three trust models (Phase 7; broadened ADR-0043):** an
 * `Authorization` header present on the request is treated strictly as a
 * Worker credential attempt — authenticated via `authenticateWorker` and, if
 * valid, served **unscoped** (no Department check; see
 * `findFileForWorkerServing`'s doc comment for why that is the honest
 * reflection of Studio's single-shared-Worker trust model). A
 * malformed/incorrect `Authorization` header fails as a Worker auth
 * failure — it never falls back to session or unauthenticated serving.
 *
 * No `Authorization` header: a valid session cookie serves through the
 * original, fully Department-scoped path, unchanged. **No session either**
 * (ADR-0043) falls to `getFileForUnauthenticatedWorkerDownload` — the
 * actual Worker's asset/template downloader
 * (`navaak-ae-renderer/renderer/operator/downloader.go`) sends no
 * credential of any kind, so this is the one real way its downloads can
 * succeed; see that function's doc comment for the bounded scope this
 * fallback is restricted to (only a File that is a genuine input to a
 * currently-active Job).
 *
 * **Optional trailing filename segment (`/api/files/[fileId]/[[...rest]]`) —
 * ADR-0044.** The real Worker's downloader
 * (`navaak-ae-renderer/renderer/operator/downloader.go`'s `download()`)
 * saves a downloaded URL locally under `filepath.Base(addr)` — the URL's
 * **last path segment**. A bare `/api/files/{fileId}` has no extension, so
 * the Worker's local temp copy of every downloaded asset/Template had none
 * either — breaking anything downstream that infers file type from the
 * extension (Adobe's `ImportOptions`/`replaceFootage` included). The claim
 * payload now appends the File's own original filename as an extra,
 * ignored path segment (`buildFileUrlFromRequest`,
 * `worker-job-payload.ts`), giving the Worker's local copy a real
 * extension. `rest` is **never used for lookup** — `fileId` alone still
 * resolves the File, exactly as before; a request with no trailing segment
 * (every existing caller — the dashboard, `FileCard`, etc.) is completely
 * unaffected.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string; rest?: string[] }> },
): Promise<Response> {
  const { fileId } = await params;

  let file: FileForServing;
  try {
    file = await resolveFileForServing(request, fileId);
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
    "Content-Disposition": buildContentDisposition(file.originalName),
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

/**
 * An `Authorization` header means "this is a Worker" — authenticate and serve
 * unscoped, or fail outright (never falls through to session or
 * unauthenticated serving). No header, with a valid session, serves through
 * the original Department-scoped path. No header and no session falls to
 * the bounded, credential-less Worker fallback (ADR-0043) — see this file's
 * top doc comment.
 */
async function resolveFileForServing(
  request: Request,
  fileId: string,
): Promise<FileForServing> {
  if (request.headers.get("authorization")) {
    await authenticateWorker(request);
    return getFileForWorkerServing(fileId);
  }
  const user = await getCurrentUser();
  if (user) {
    return getFileForServing(toActor(user), fileId);
  }
  return getFileForUnauthenticatedWorkerDownload(fileId);
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

/**
 * `/api/files/{fileId}` is deliberately extension-less (the id, not a path,
 * is the identity — see `docs/architecture/files.md`), so a browser saving
 * this response with no other hint falls back to the URL's last segment,
 * i.e. the bare id, with no extension at all. `Content-Disposition` is the
 * standard way to give a response a real, correct download filename without
 * the URL itself needing one — `inline` (not `attachment`) so this keeps
 * rendering directly in an `<img>`/`<audio>`/`<video>` tag exactly as
 * before; only the *filename* a "Save As"/direct-navigation download uses
 * changes.
 *
 * Always the File's own `originalName` (never `storedName`/`storageKey` —
 * those stay internal, per docs/architecture/files.md) — this is real,
 * potentially-Unicode, user-supplied text (docs/domain/files.md "Original
 * Filename"), so it's carried both as an ASCII-sanitized `filename` fallback
 * (RFC 6266) and the exact original as `filename*` (RFC 5987/8187,
 * UTF-8-percent-encoded) for the clients that support it — every modern
 * browser does.
 */
function buildContentDisposition(originalName: string): string {
  const asciiFallback =
    originalName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'") || "file";
  const encoded = encodeURIComponent(originalName);
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
