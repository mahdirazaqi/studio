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
 */
export function buildFileUrlFromRequest(
  _request: Request,
  fileId: string,
): string {
  return `/api/files/${fileId}`;
}
