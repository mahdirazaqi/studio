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
 *
 * **Never percent-encode the filename segment — ADR-0047, fixes a real
 * double-encoding bug found against a real Worker run.** `addr` (this
 * function's whole return value) is assigned directly to `u.Path` — the
 * **decoded** form in Go's `net/url` — and `u.String()` percent-encodes
 * `Path` itself when building the final request URL. Pre-encoding here
 * (the original ADR-0044 implementation called `encodeURIComponent`) means
 * a literal `%` reaches `u.Path`, which `u.String()` encodes *again*
 * (`%20` -> `%2520`) — confirmed against a real render log: the Worker
 * requested a mangled, unreachable URL and `filepath.Base(addr)` (computed
 * on this same, still-encoded `addr` *before* the request is even sent)
 * saved the local temp file under the equally mangled literal name
 * `Screenshot%2520from....png`, which After Effects then failed to import
 * ("Path is not valid"). The filename must reach the Worker exactly as
 * typed (spaces, Unicode, punctuation) — `sanitizeFilenameSegment` only
 * neutralizes the handful of characters (`/`, `\`, `..`) that would
 * otherwise let `path.Clean` (inside `path.Join(u.Path, addr)`) resolve
 * *outside* `/api/files/{id}` entirely; everything else is left as literal
 * text for Go's own URL encoding to handle exactly once.
 */
export function buildFileUrlFromRequest(
  _request: Request,
  fileId: string,
  filenameHint?: string | null,
): string {
  const base = `/api/files/${fileId}`;
  if (!filenameHint) return base;
  return `${base}/${sanitizeFilenameSegment(filenameHint)}`;
}

/**
 * Neutralizes only what could break as a **path** once the Worker's own
 * `path.Join`/`path.Clean` processes this string, or as a **local Windows
 * filename** once `filepath.Base(addr)` becomes the argument to `os.Create`
 * (the real deployment this was verified against runs the renderer on
 * Windows — `C:\Renderer\temp\...` in its own log output):
 *
 * - `/` and `\` — would introduce extra path segments.
 * - `..` — would let `path.Clean` walk back out of `/api/files/{id}`
 *   entirely (e.g. an `originalName` of `../../secret` turning the request
 *   into one for `/api/secret`).
 * - `<>:"|?*` and control characters (0x00–0x1F) — all illegal in a Windows
 *   filename; `os.Create` fails outright on any of them, the same silent
 *   "Path is not valid" failure mode the double-encoding bug produced.
 *
 * Deliberately **not** a general slug/ASCII sanitizer beyond that: spaces,
 * Unicode, and every other punctuation character are left untouched — see
 * this module's top doc comment for why re-encoding them here would corrupt
 * the Worker's own encoding.
 */
function sanitizeFilenameSegment(name: string): string {
  return name
    .replace(/[/\\]/g, "_")
    .replace(/\.\./g, "_")
    .replace(/[<>:"|?*\x00-\x1f]/g, "_");
}
