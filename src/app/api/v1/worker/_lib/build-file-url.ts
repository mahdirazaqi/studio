/**
 * Builds the Worker-fetchable reference for a File id.
 *
 * **Revised, ADR-0043 — relative path, not an absolute URL.** The actual
 * Worker (`navaak-ae-renderer/renderer/operator/downloader.go`'s
 * `download()`) resolves a non-`file://` asset reference by taking only the
 * **path** component and joining it onto its own configured `BaseURL`:
 * `u, _ := url.Parse(config.C.BaseURL); u.Path = path.Join(u.Path, addr)`.
 * Go's `path.Join` treats `addr` purely as a path string — if `addr` is
 * itself a full absolute URL (`https://host/api/files/{id}`), the `"://"`
 * inside it collapses under `path.Clean`'s double-slash normalization,
 * producing a mangled, unreachable URL (verified by hand: joining
 * `"http://localhost:3002"` with the *path* `"http://localhost:3002/api/
 * files/abc"` yields `"http://localhost:3002http:/localhost:3002/api/
 * files/abc"`). A relative path (`/api/files/{id}`) joins cleanly and
 * resolves correctly against the Worker's own `BaseURL`. Do not change this
 * back to an absolute URL without re-verifying against the actual Worker
 * source.
 *
 * **Trailing filename segment — ADR-0044.** The same `download()` saves the
 * downloaded bytes locally under `filepath.Base(addr)` — the URL's last
 * path segment, used verbatim as the local filename. A bare
 * `/api/files/{id}` has no extension, so every asset/Template the Worker
 * downloaded was saved locally with none — breaking anything downstream
 * that infers file type from the extension (Adobe's `ImportOptions`
 * included). When `filenameHint` (the File's own original filename, already
 * validated at upload time against its sniffed content type —
 * `features/files/domain/file-types.ts`) is available, it's appended as an
 * extra path segment purely so the Worker's local copy gets a real
 * extension; `/api/files/[fileId]/[[...rest]]` never uses it for lookup
 * (see that route's doc comment) — `fileId` alone still resolves the File.
 */
export function buildFileUrlFromRequest(
  _request: Request,
  fileId: string,
  filenameHint?: string | null,
): string {
  const base = `/api/files/${fileId}`;
  if (!filenameHint) return base;
  return `${base}/${encodeURIComponent(filenameHint)}`;
}
