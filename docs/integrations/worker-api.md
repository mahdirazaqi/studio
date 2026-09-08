# Render Worker REST API

**Implemented, Phase 7** (claim/get/state/progress/duration). **Result acceptance
implemented, Phase 9** (§2, ADR-0039). **Per-Worker, Department-scoped API keys
implemented, Phase 11** (§3/§4, ADR-0040 — supersedes ADR-0032's single shared static
key). **YouTube delivery removed, Phase 12** (ADR-0041) — `POST .../upload` now simply
registers the rendered result and marks the Job `RENDERED`, its final state; no
external upload of any kind happens. **Verified against the actual Worker's real
source, Phase 14 (ADR-0043)** — the `navaak-ae-renderer` repository, not assumptions;
every gap this closed is listed in §7, which this phase's own audit rewrote from a
"not confirmed" disclaimer into a verified record. ADR-0004 (surface & auth
requirement), ADR-0033 (API surface & versioning), ADR-0034 (trust model &
idempotency, revised by ADR-0040), ADR-0043 (real-Worker compatibility fixes).

The **Render Worker** is an external service (not in this repo, source at
`/home/mahdirazaqi/Projects/navaak-ae-renderer` in this environment) that performs the
actual video rendering. It is the **only** first-class REST client of Studio. Studio
must keep it working with **minimal changes** — the endpoint semantics are a
compatibility contract, and (ADR-0043) the Worker's own code, not a prior design
document's assumptions about it, is the source of truth for that contract.

## 1. Legacy contract (baseline) `LEGACY`

From `qtical-backend-node/src/render/job/job.controller.ts` and `file.controller.ts`.

| Method  | Path                 | Auth (legacy)            | Body                           | Purpose                                                          |
| ------- | -------------------- | ------------------------ | ------------------------------ | ---------------------------------------------------------------- |
| `POST`  | `/files`             | ✅ `FILE_ADD` (user JWT) | multipart `file`               | Upload an input media asset.                                     |
| `GET`   | `/jobs/fetch`        | ❌ **none**              | —                              | Claim the oldest queued job; flips it to `Fetched`. 404 if none. |
| `GET`   | `/jobs/:id`          | ❌ **none**              | —                              | Read one job.                                                    |
| `PATCH` | `/jobs/:id/progress` | ❌ **none**              | `{ progress: number }`         | Report render progress %.                                        |
| `PATCH` | `/jobs/:id/duration` | ❌ **none**              | `{ duration: number }`         | Report rendered duration (seconds).                              |
| `PATCH` | `/jobs/:id/state`    | ❌ **none**              | `{ state: number }`            | Advance job lifecycle state (raw integer, unvalidated).          |
| `POST`  | `/jobs/:id/upload`   | ❌ **none**              | multipart `file` (`.mp4` only) | Deliver the finished render.                                     |

Legacy `GET /jobs/fetch` response (`FetchJobOutput`):

```json
{ "id": "...", "output": "...", "title": "...", "composition": "...",
  "template": "<Template.src>", "assets": [ { "composition","layer","type","src","text" } ] }
```

Legacy job states (integers): `Queued=0 Fetched=1 Downloading=2 Started=3 InProgress=4
Rendered=5 Uploading=6 Uploaded=7 Error=8 Cancel=9`.

Legacy retry/cancel were **GraphQL**, not REST — the Worker did not call them, and
Studio's Worker API does not expose either (Phase 7 brief §18/§19 — don't expose an
internal capability the Worker never needed).

## 2. Studio Worker API — implemented

### Principles

- **Compatibility first:** the claim/get-by-id response keeps legacy's exact field
  names; only new fields are added.
- **Authenticated:** every endpoint requires a valid, ACTIVE `WorkerApiKey` credential
  (ADR-0004, ADR-0040), scoped to one or more Departments. **This is the one deliberate
  breaking change from legacy.**
- **Versioned:** `/api/v1/worker/...`.
- **Thin handlers → shared use cases.** Every handler is `defineRouteHandler({ name,
authenticate: authenticateWorker, params/body, handler })` — authenticate, validate,
  call a Phase 6 use case (or a small Phase 7 adapter over one, for input mapping only),
  map the result. No business/state-machine logic lives in `src/app/api/worker/**`.
- **Atomic claim**, **validated state transitions** — both entirely Phase 6's guarantees
  (ADR-0029), untouched by this layer.

### Endpoints

| Method  | Path                               | Maps to legacy             | Handler calls                                                                                            |
| ------- | ---------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST`  | `/api/v1/worker/jobs/next`         | `GET /jobs/fetch`          | `claimNextJob()` — atomic; `404 "Not Found"` when the queue is empty (ADR-0043 — see below).             |
| `GET`   | `/api/v1/worker/jobs/:id`          | `GET /jobs/:id`            | `getJobForWorker(id, allowedDepartmentIds)` — Department-scoped, see §4.                                 |
| `PATCH` | `/api/v1/worker/jobs/:id/state`    | `PATCH /jobs/:id/state`    | `transitionJobForWorker(id, body)` → `transitionJob` (Phase 6); same-state calls are a no-op (ADR-0043). |
| `PATCH` | `/api/v1/worker/jobs/:id/progress` | `PATCH /jobs/:id/progress` | `updateJobProgress({ jobId, progress })` (Phase 6).                                                      |
| `PATCH` | `/api/v1/worker/jobs/:id/duration` | `PATCH /jobs/:id/duration` | `{ duration }` (Worker's real field name, ADR-0043) → `updateJobDuration({ jobId, durationSeconds })`.   |
| `POST`  | `/api/v1/worker/jobs/:id/upload`   | `POST /jobs/:id/upload`    | `acceptJobResult(id, videoBuffer, allowedDepartmentIds \| null)` — multipart, ADR-0043.                  |
| `GET`   | `/api/files/:fileId`               | n/a (new)                  | Worker-authenticated **or credential-less-if-active-Job-input** branch — see §5.                         |
| `GET`   | `{origin}/jobs/:id` (no `/api`)    | n/a (Worker-internal only) | Rewritten by `middleware.ts` to the internal legacy cancel-status handler — see §5a, ADR-0043.           |

**`POST /api/v1/worker/jobs/:id/upload` — implemented, Phase 9; path and body format
corrected against the real Worker, Phase 14 (ADR-0043).** Accepts the finished render
and registers it as the Job's completion (docs/domain/jobs.md "Rendered result"). **Two
real defects, found and fixed by reading the actual Worker source
(`navaak-ae-renderer/renderer/operator/upload.go`) rather than assuming:**

1. **Path**: the originally implemented route was `.../jobs/:id/result` — the actual
   Worker's `UploadJob()` builds `uploadEndpoint = "/api/v1/worker/jobs/%v/upload"`
   verbatim. Renamed (not duplicated — nothing else ever called `.../result`).
2. **Body format**: the originally implemented handler read `request.arrayBuffer()`,
   assuming raw bytes. The actual Worker sends a real `multipart/form-data` request
   (Go's `mime/multipart`) with the video under form field **`"file"`** — exactly like a
   browser file input, not raw bytes. The handler now reads `request.formData()` and
   extracts that field.
3. **No Authorization header, ever, from the real Worker's `UploadJob`** — unlike
   fetch/state/progress/duration (all routed through `operator.Request()`, which does
   set `Authorization: Bearer <key>`), `UploadJob` builds its `http.NewRequest`
   manually and never sets one. Requiring a Worker credential here (matching every
   other route) made every real upload fail with `401`. The route now uses
   `authenticateWorkerLenient` (`@/server/worker-auth`): a header, if present, is still
   validated exactly as strictly as before; a **missing** header is tolerated
   (`allowedDepartmentIds: null` passed to `acceptJobResult`), with the Job's own state
   as the compensating gate — see the "No-credential compensating checks" callout below.
4. **Call-order broadening**: the actual Worker calls `ChangeState(Rendered)` (a bare
   `PATCH .../state`) **before** uploading — by the time the upload request arrives,
   the Job is very often already `RENDERED` with no artifact attached yet, not still
   `RENDERING`. `acceptJobResult` now accepts from either state (see its own doc
   comment) — requiring strictly `RENDERING` rejected every real upload.

- Legal from a Job in `RENDERING`, or `RENDERED` with no `videoFileId` yet (ADR-0043). A
  duplicate Worker request (the Job already has a `videoFileId`) is recognized and
  returned as-is — no reprocessing.
- Success response: `{ id, state, videoFileId }` — `state` is `RENDERED` (the Job's
  final, successful completion state) or `ERROR` if something about the result was
  rejected. There is no `DELIVERING`/`UPLOADED` to report — those states were removed
  (ADR-0041).
- `POST /api/v1/worker/files` (a Worker uploading an input file) remains **not
  implemented** — see §6.

**No-credential compensating checks (ADR-0043).** Since the real Worker sends no
Authorization header on this call, Studio cannot Department-scope it by credential.
The compensating controls: the Job must be in an acceptable state to begin with
(above); every existing content-sniffing/size-limit validation still runs in full; Job
ids are unguessable (`cuid()`). This is a genuine, explained trade-off — see the final
compatibility report's Security section — not a silent weakening.

### State mapping at the boundary — implemented

`features/jobs/domain/legacy-state-mapping.ts`'s `mapWorkerState`:

| Legacy int | Legacy name | Studio canonical state                                                  |
| ---------- | ----------- | ----------------------------------------------------------------------- |
| 0          | Queued      | `QUEUED`                                                                |
| 1          | Fetched     | `CLAIMED`                                                               |
| 2          | Downloading | `RENDERING` (substate not tracked internally — unchanged OPEN DECISION) |
| 3          | Started     | `RENDERING`                                                             |
| 4          | InProgress  | `RENDERING`                                                             |
| 5          | Rendered    | `RENDERED` (the Job's final, successful state — ADR-0041)               |
| 6          | Uploading   | **no longer mapped** — rejected `422 validation` (ADR-0041)             |
| 7          | Uploaded    | **no longer mapped** — rejected `422 validation` (ADR-0041)             |
| 8          | Error       | `ERROR`                                                                 |
| 9          | Cancel      | `CANCELED`                                                              |

`PATCH .../state` accepts **either** a legacy integer (0–9) **or** a Studio canonical
name (case-insensitive) in the same `state` field — whichever the Worker's own code
currently sends keeps working. An unrecognized value → `422 validation`. The actually
legal transition from the Job's current state is still decided entirely by
`transitionJob`/`isValidTransition` (Phase 6) — an authenticated Worker sending a legal
credential but an illegal transition still gets rejected (`422 business_rule`, or `409
conflict` if it raced another update).

**Same-state calls are a no-op, not an error — verified against the real Worker,
ADR-0043.** The actual Worker (`navaak-ae-renderer/renderer/renderer.go`'s `next()`)
reports three distinct legacy codes in sequence while a Job is actively rendering —
`Downloading(2)`, `Started(3)`, `InProgress(4)` — all three mapping onto the same
Studio `RENDERING` bucket above. Only the first is a real `CLAIMED -> RENDERING`
transition; the other two are same-state reports. The state machine's own
`isValidTransition` deliberately forbids a self-loop for every _other_ caller (tested,
`job-state-machine.test.ts` — untouched by this fix); `transitionJobForWorker`
(the Worker-facing adapter only) now special-cases "mapped target equals current
state" as success, returning the Job unchanged rather than calling `transitionJob` at
all. Without this fix, the real Worker's very first render always failed at the
`Started` step with a `422 business_rule` error — self-loops were never actually
exercised end-to-end against the real Worker before this phase.

**Reporting failure**: set `state` to `ERROR` (int `8` or the string) and include
`errorReason` (required exactly when the target is `ERROR`, ≤ 2000 characters, ignored
otherwise) — no separate failure-reporting endpoint exists; the state machine's own
`ERROR` transition already carries this field (`Job.errorReason`, shown to dashboard
users as-is — keep it a short, safe, human-readable summary, never a raw stack trace or
log dump).

### Claim / get-by-id response — implemented

```json
{
  "id": "job_...",
  "state": "CLAIMED",
  "output": "out/%s.mp4",
  "title": "Hello World",
  "composition": "main-comp",
  "template": "src://project",
  "assets": [
    {
      "key": null,
      "composition": null,
      "layer": null,
      "type": "script",
      "src": "script.js",
      "text": null
    },
    {
      "key": "caption",
      "composition": "c1",
      "layer": "l1",
      "type": "data",
      "src": null,
      "text": "Hello World"
    },
    {
      "key": "cover",
      "composition": "c2",
      "layer": "l2",
      "type": "image",
      "src": "/api/files/file_...",
      "text": null
    }
  ]
}
```

Field names (`output`, `template`, `type`, `src`, `text`) are legacy's, kept verbatim so
the Worker's existing parsing is unchanged — including the confusing `template` name,
which is actually the Template's opaque `source` field, not "the template." `state` and
`key` are new, additive fields. Built entirely from the Job's immutable
`snapshot`/`JobAsset` rows (`buildWorkerJobPayload`,
`features/jobs/domain/worker-job-payload.ts`) — never a live Template/File read, so a
historical or in-flight Job's payload can never change meaning underneath the Worker.

**`src` is now a relative path, not an absolute URL — fixed against the real Worker,
ADR-0043.** The originally implemented `buildFileUrlFromRequest` returned
`${origin}/api/files/{id}` (a full `https://host/...` URL). The actual Worker's
downloader (`navaak-ae-renderer/renderer/operator/downloader.go`'s `download()`)
resolves a non-`file://` reference by taking only the **path** portion and joining it
onto its own configured `BaseURL` (`u.Path = path.Join(u.Path, addr)`); handed a full
URL, Go's `path.Join`/`path.Clean` collapses the `"://"` inside it, producing a
mangled, unreachable request (verified by hand — see `build-file-url.ts`'s doc
comment for the exact garbled result). Every Template/asset download the Worker made
was silently broken until this fix.

**Per-asset `src`/`text` mapping** (`type` is always the lowercase `JobAssetKind`):

| `type`                      | Carries the value in | Notes                                                                                                  |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `script`                    | `src`                | The Template's `scriptRef`, copied verbatim — matches legacy's `{type:'script', src:...}`.             |
| `data`                      | `text`               | The literal value the Job was created with.                                                            |
| `image` / `audio` / `video` | `src`                | A relative path, **not a filesystem path** — see §5. `null` if the source File has since been deleted. |

### Empty-queue behavior — corrected against the real Worker (ADR-0043)

`POST /api/v1/worker/jobs/next` now returns **`404`** (`notFoundError("Not Found")`)
when no Job is eligible — **revised from the originally documented `204 No Content`.**
The actual Worker (`navaak-ae-renderer/renderer/operator/request.go`'s `Request()`)
treats any status `> 300` as an error, and `renderer.go`'s polling loop silences that
error only when its text contains the literal substring `"Not Found"` — a check
written for the legacy backend's `404 Not Found` response, never updated for a `204`.
A `204` has no body; the Worker's own `json.Unmarshal` on it fails with an unrelated
"unexpected end of JSON input" that does **not** contain "Not Found", so it was logged
as a real error on every single empty poll. The message text `"Not Found"` is chosen
specifically to satisfy the Worker's exact substring check — do not change it without
re-verifying against the actual Worker source.

## 3. Authentication — implemented (ADR-0040, supersedes ADR-0032)

Each Worker identity is a `WorkerApiKey` row — created, scoped to one or more
Departments, revoked/reactivated, and re-scoped by an **ADMIN** at `/worker-keys`
(`worker_key:manage`, ADMIN-only) — sent as `Authorization: Bearer <secret>` on every
`/api/v1/worker/**` request and on a Worker-authenticated `/api/files/[fileId]` request.
`@/server/worker-auth`'s `authenticateWorker` is the sole place this credential is read,
hashed (SHA-256, `WorkerApiKey.keyHash`, `@unique` — doubles as the lookup index), or
compared — the same "only a hash is ever stored" trust model `Session` already uses
(ADR-0020): a database read alone never yields a usable credential. Missing, malformed
(no `Bearer` prefix, empty token), revoked, or unknown credentials all produce the same
`401 unauthenticated` response, with no indication of which case it was and no part of
the submitted value echoed back. The raw secret is shown to the ADMIN **exactly once**,
immediately after creation — never stored anywhere retrievable, never re-displayed.

`authenticateWorker` resolves a `WorkerAuthContext { workerApiKeyId,
allowedDepartmentIds }` once, at authentication — every Worker Route Handler receives
it as `ctx.auth` (a `defineRouteHandler` `authenticate` hook, `@/server/api`) and passes
`allowedDepartmentIds` straight into its use case. **This is the only place a Worker's
Department scope is ever resolved** — never re-derived from anything client-supplied,
never trusted from a request body/query param.

**Not implemented, deliberately** (ADR-0040): per-Worker rate limiting beyond what
ADR-0034 already covers, key rotation that auto-expires the old secret (revoking and
creating a new key is the rotation mechanism), a `WorkerApiKey`-scoped audit log beyond
`lastUsedAt` (best-effort telemetry, never blocks or fails a request).

The Worker principal:

- is not a `User`, has no single Department (it may hold several), never becomes an
  `Actor`;
- can call `/api/worker/**` and (with the same credential) `/api/files/[fileId]`;
- is **not** individually rate-limited or logged beyond what
  [../security/security.md](../security/security.md) already covers for the whole app —
  a dedicated Worker-credential rate limiter was not built this phase (OD-41 stays
  open; Worker authentication itself remains mandatory regardless).

### 3a. Managing Worker API Keys — implemented (`/worker-keys`, ADMIN-only)

An ADMIN creates a Worker API Key at `/worker-keys`: a human-readable name plus at
least one Department. The raw secret is displayed **once**, immediately after
creation, in a dismissible banner with a "copy this now" warning — it is never stored
anywhere it could be re-displayed, and no endpoint returns it again. From the same
page, an ADMIN can:

- **Revoke** a key (its very next Worker request gets `401`, nothing cached) or
  **reactivate** a previously revoked one — never a hard delete, so a revoked key's
  history (who created it, when it was last used) stays inspectable.
- **Edit its Department scope** — a full replace of the assigned Departments (never a
  diff), taking effect on the Worker's very next request.
- Inspect metadata: status, assigned Departments, `lastUsedAt` (best-effort, updated
  opportunistically on each authenticated request), `createdAt`, who created it.

A key with zero Departments cannot be created (`departmentIds` requires at least one) —
there is no such thing as an unscoped Worker credential under this mechanism.

## 4. Trust model & Department scope — implemented (ADR-0034, revised ADR-0040)

Studio's Worker is a machine principal identified by its `WorkerApiKey`, scoped to one
or more Departments (never zero — creation requires at least one) — this is the one
piece ADR-0034's "single shared, non-departmental principal" framing no longer describes
correctly; ADR-0040 supersedes it:

- Every Worker operation on a _specific_ Job (`GET /jobs/:id`, `PATCH .../state`,
  `PATCH .../progress`, `PATCH .../duration`, `POST .../result`) checks
  `assertWorkerDepartmentAccess(allowedDepartmentIds, job.departmentId)` before touching
  it — `404 not_found`, **never** `403 forbidden`, matching every other cross-department
  access pattern in this codebase: a scoped-out Worker cannot distinguish "exists in a
  Department I can't reach" from "doesn't exist." Resolves OD-30 honestly in the other
  direction from ADR-0034's original answer — there **is** now a real per-credential
  boundary to enforce.
- `POST /api/v1/worker/jobs/next`'s atomic claim (`SELECT ... FOR UPDATE SKIP LOCKED`)
  filters `WHERE "departmentId" = ANY(allowedDepartmentIds)` as part of the same atomic
  statement, not a check applied after the row is already locked — a scoped-out `QUEUED`
  Job is never considered for claiming by a Worker that can't reach it, race or no race.
- If two physical Worker processes share the same credential, each can read and mutate
  any Job within that credential's Department scope the other is working on — an
  accepted consequence of one credential having no _sub_-identity within its own scope,
  not an oversight. Issue separate `WorkerApiKey`s per physical Worker process if that
  distinction matters.
- Dashboard-user Department isolation is completely unaffected — this is a property of
  the Worker being a different kind of principal, not a weakening of `Actor`-based
  authorization anywhere.

## 5. Worker access to input Files — implemented; broadened Phase 14 (ADR-0043)

`GET /api/files/[fileId]` (Phase 4) gained a second, Worker-authenticated path rather
than a new endpoint: a request bearing an `Authorization` header is authenticated as a
Worker and served **unscoped** by Department; a request without one, but with a valid
session cookie, serves through the original, unchanged Department-scoped path. A
request is never silently retried on the other path — a bad `Authorization` header
fails as a Worker-auth failure, it does not fall back to session or unauthenticated
serving even if a valid session cookie is also present.

This closes a gap none of Phases 4–6 addressed explicitly: the claim/get-by-id payload
must include "resolved File information required for download" (Phase 7 brief §12), but
Studio's storage abstraction (ADR-0024) never hands out a raw filesystem path the way
legacy's `File.path` did. The Worker downloads bytes the same way a browser does — an
authenticated `GET`, byte-range support included — just with its own Bearer credential
instead of a session cookie. The URL is built from the inbound request's own origin
(`new URL(request.url).origin`), not a separate `APP_URL` config value, so it works
correctly regardless of how the Worker reaches Studio.

**Third path — no credential, no session (ADR-0043).** The actual Worker's
asset/template downloader (`navaak-ae-renderer/renderer/operator/downloader.go`'s
`downloadFile`, called from `download()`) is a plain `http.Get` with **no headers set
at all** — it never sends the `Authorization` header the second path above relies on.
This is not a hypothetical: every real Job asset/Template download the Worker performs
uses this exact call. A request with neither header nor session now falls to
`getFileForUnauthenticatedWorkerDownload`
(`features/files/use-cases/get-file-for-unauthenticated-worker-download.ts`), which
serves the File **only if it is a genuine input (`JobAsset.fileId`) of a Job currently
`QUEUED`/`CLAIMED`/`RENDERING`** — not an arbitrary Gallery File, and not once the Job
leaves those states. This does not reproduce full Department isolation (there is no
credential to scope by), but it is a real, bounded narrowing rather than opening the
endpoint outright; File ids are unguessable (`cuid()`). See the compatibility report's
Security section for the explicit trade-off this represents.

## 5a. Unauthenticated legacy cancel-status poll (`GET {origin}/jobs/:id`) — implemented, ADR-0043

The actual Worker's supervisor process (`navaak-ae-renderer/worker/worker.go`) runs a
background goroutine (`checkCancelJob`) that polls, roughly every 5 seconds while a
render is active, `GET {baseURL}/jobs/{activeJobId}` — **no `/api` prefix, no
credential at all** (`utils/request/request.go`'s `Get` is a plain, headerless
`http.Get`) — to learn whether the Job it's rendering has been canceled, so it can kill
the local AfterFX process. The expected response is the **legacy backend's exact
shape**, never updated for Studio: `{"job":{"_id":"...","state":<int>}}` on success (a
`_id` field, Mongo-style, wrapped in `"job"`), or `{"statusCode":404}` on a missing Job
— `CanCancel` treats `state == 9` as "canceled, proceed to kill" and a `404` the same
way (job gone ⇒ safe to kill).

That literal URL, `/jobs/:id`, is already the human-facing Job detail dashboard page
(`(dashboard)/jobs/[jobId]/page.tsx`) — a `page.tsx` and a `route.ts` cannot both
resolve the same path in the App Router, so this cannot be a second, co-located Route
Handler. `src/middleware.ts` distinguishes the two real callers by content
negotiation — a browser navigating here always sends `Accept: text/html,...`; the
Worker's plain `http.Get` sets no `Accept` header at all — and rewrites only the
non-`text/html` `GET` to an internal handler
(`src/app/api/internal/legacy-job-status/[jobId]/route.ts`) that returns the legacy
shape. This is a pure routing decision, not an authorization one (CLAUDE.md's "no
authorization in middleware" rule doesn't apply — there is no credential to decide
anything about); the dashboard page's own session/authorization checks are completely
untouched for every request middleware does not rewrite.

**Deliberately unauthenticated, and deliberately minimal.** There is no credential the
real Worker sends on this call, so there is nothing to check — the response carries
only a Job id (already known to the caller) and a coarse numeric lifecycle state,
nothing else. This is a genuine, explained gap; see the compatibility report's
Security section.

## 6. Deferred — not implemented

- **`POST /api/v1/worker/jobs/:id/result`** — implemented, Phase 9. See §2 above.
- **`POST /api/v1/worker/files`** — a Worker uploading an input file directly. No
  concrete requirement calls for this yet (input files come from the Gallery, resolved
  at Job creation) — deferred until the result-upload endpoint above needs it, if ever.
- **Cancel / retry over the Worker API** — never part of the legacy Worker contract
  (both were dashboard/GraphQL-only) and nothing in the current lifecycle needs them
  (Phase 7 brief §18/§19).
- **Rate limiting per Worker credential** — OD-41 stays open.
- **Worker-timeout requeue sweep** (a Job stuck in `CLAIMED`/`RENDERING`) — OD-31 stays
  open; the `CLAIMED → QUEUED` transition exists in the state graph for it.

## 6a. Worker compatibility matrix (verified against the real Worker, ADR-0043)

| Legacy route                                                                 | Legacy method | Studio route                       | Studio method | Request                                                              | Response                                                                                     | Auth                                                                                                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------- | ---------------------------------- | ------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /jobs/fetch`                                                            | `GET`         | `/api/v1/worker/jobs/next`         | `POST`        | none (a literal `"null"` body — harmless, unread)                    | `200` claim payload (see §2) or `404 {"error":{"message":"Not Found",...}}` if none eligible | `Authorization: Bearer <WorkerApiKey secret>` (Department-scoped, ADR-0040)                                      | Method intentionally changed: a side-effecting `GET` is forbidden (Security Requirements §11); atomic claim (`SELECT ... FOR UPDATE SKIP LOCKED`), never a find-then-update race. **Empty-queue response corrected `204 → 404` (ADR-0043)** — see §2.                                                                                                                                                                                                                  |
| `POST /jobs/:id/upload`                                                      | `POST`        | `/api/v1/worker/jobs/:id/upload`   | `POST`        | `multipart/form-data`, field `"file"` (ADR-0043 — **not** raw bytes) | `200 { id, state, videoFileId }`                                                             | **None, as the real Worker sends none** (ADR-0043) — an `Authorization` header, if present, is still validated   | **Path corrected `result → upload`; body format corrected `raw bytes → multipart` (ADR-0043)** — the originally implemented route/format never actually worked against the real Worker. Registers the render as the Job's completion (state becomes `RENDERED`, terminal — ADR-0041). Idempotent on a duplicate submission; also accepts from an already-`RENDERED`, no-video Job (ADR-0043, since the Worker's own `ChangeState(Rendered)` call usually lands first). |
| `PATCH /jobs/:id/state`                                                      | `PATCH`       | `/api/v1/worker/jobs/:id/state`    | `PATCH`       | `{ state }` — legacy integer 0–9 **or** a Studio state name          | `200 { id, state }`                                                                          | `Authorization: Bearer <WorkerApiKey secret>` (Department-scoped, ADR-0040)                                      | Legacy accepted **any** integer with no validation; Studio validates against the state machine (`422`/`409` for an illegal/raced transition). `errorReason` required when the target is `ERROR`. **A call reporting the state the Job is already in is now a no-op, not an error (ADR-0043)** — the real Worker reports 3 legacy codes (`Downloading`/`Started`/`InProgress`) that all map to `RENDERING`; without this, the very first real render always failed.     |
| `PATCH /jobs/:id/progress`                                                   | `PATCH`       | `/api/v1/worker/jobs/:id/progress` | `PATCH`       | `{ progress: 0..100 }`                                               | `200 { id, progress }`                                                                       | `Authorization: Bearer <WorkerApiKey secret>` (Department-scoped, ADR-0040)                                      | Legacy `{progress}` was unvalidated; Studio validates the range and rejects once the Job is terminal. Field name confirmed to match the real Worker as-is.                                                                                                                                                                                                                                                                                                             |
| `PATCH /jobs/:id/duration`                                                   | `PATCH`       | `/api/v1/worker/jobs/:id/duration` | `PATCH`       | `{ duration: >=0 }` (ADR-0043 — the real Worker's actual field name) | `200 { id, duration }`                                                                       | `Authorization: Bearer <WorkerApiKey secret>` (Department-scoped, ADR-0040)                                      | **Field name corrected `durationSeconds → duration` at the wire boundary (ADR-0043)** — the originally implemented schema required `durationSeconds`, which the real Worker never sends, so every duration report was silently rejected with `422`. Studio's internal domain field stays `Job.durationSeconds`; this route is the one translation point.                                                                                                               |
| n/a (Worker had none)                                                        | —             | `GET /api/v1/worker/jobs/:id`      | `GET`         | none                                                                 | `200` same payload shape as claim                                                            | `Authorization: Bearer <WorkerApiKey secret>` (Department-scoped, ADR-0040)                                      | New — lets a Worker that crashed mid-render re-fetch the Job it was working on, by id, instead of losing its place. Not called by the real Worker's current code, but harmless to keep.                                                                                                                                                                                                                                                                                |
| n/a (Worker had none, under `/api`)                                          | —             | `GET {origin}/jobs/:id`            | `GET`         | none                                                                 | `200 {"job":{"_id":...,"state":<int>}}` or `404 {"statusCode":404}`                          | **None — the real Worker sends none** (ADR-0043)                                                                 | New, ADR-0043 — the real Worker's mid-render cancellation poll (`CanCancel`), previously entirely unsupported. Reached via `middleware.ts`'s content-negotiated rewrite, not a co-located Route Handler (see §5a).                                                                                                                                                                                                                                                     |
| Asset/Template download (`GET`, whatever URL `template`/`assets[].src` held) | `GET`         | `/api/files/[fileId]`              | `GET`         | none                                                                 | file bytes (byte-range supported)                                                            | **None — the real Worker sends none on this call** (ADR-0043); a real credential, if presented, is still honored | `src`/`template` corrected `absolute URL → relative path` (ADR-0043, see §2) — a full URL broke the real Worker's downloader outright. Credential-less serving bounded to a File that's a genuine input of a currently-active Job (§5).                                                                                                                                                                                                                                |

All routes above (plus the two ADR-0043-only additions) were re-verified with real HTTP
requests against a running dev server during this phase's audit — not just unit tests.
The most significant confirmed finding: **the render pipeline the previously
implemented contract described could never actually complete a single real render** —
the `Started` state report always failed (same-state rejection), and even had it not,
the result upload would have failed next (wrong path, wrong body format, and a
required-`RENDERING` check that the Worker's own call order defeats). Every item above
marked "(ADR-0043)" is a fix for a concrete, traced failure in that pipeline, not a
speculative hardening.

## 7. Compatibility notes / risks — resolved against the real Worker, Phase 14 (ADR-0043)

This section previously flagged the items below as **unconfirmed assumptions** ("not
confirmed against the real Worker's code... coordinate before cutover"). Phase 14 read
the actual Worker source (`navaak-ae-renderer`) and resolved every one:

- **Empty-queue response**: the real Worker's error-suppression logic expects a `404`
  whose body contains the literal substring `"Not Found"` (a leftover check written for
  the legacy backend, per `renderer.go`) — **not** `204`. Fixed; see §2.
- **`GET` vs `POST` for claim**: the Worker's uncommitted local source already calls
  `POST /api/v1/worker/jobs/next` — confirmed compatible, no further change needed.
- **Base path / version prefix**: the Worker's uncommitted local source already targets
  `/api/v1/worker/...` — confirmed compatible.
- **Result upload path/format**: **not** compatible as originally implemented — see §2's
  `.../upload` writeup and §6a. Fixed.
- **Duration field name**: **not** compatible as originally implemented (`duration` vs.
  `durationSeconds`) — see §6a. Fixed.
- **Same-state `PATCH .../state` calls**: **not** compatible as originally implemented
  (rejected as an illegal self-loop) — see §2. Fixed.
- **Asset/Template `src` URLs**: **not** compatible as originally implemented (absolute
  URL broke the Worker's own path-joining logic) — see §2. Fixed.
- **Worker credential on upload/download/cancel-poll**: the real Worker sends **no**
  credential on three specific calls (result upload, asset/Template download, the
  mid-render cancel poll) — a genuine, structural gap, not a bug to "fix" by adding a
  header the Worker's own code doesn't send. Compensating, bounded checks were added in
  each case instead of either (a) requiring a credential the Worker can never present,
  breaking those calls outright, or (b) opening the endpoint with no scope at all — see
  §2, §5, §5a, and the compatibility report's Security section for the explicit
  trade-off.
- **`config.json`'s `api_key`**: the real Worker's config file (`config-example.json`/
  `config.json`) already includes an `api_key` field and sends it as
  `Authorization: Bearer <api_key>` on fetch/state/progress/duration — confirming a
  real `WorkerApiKey` provisioned in Studio for that exact secret is expected to exist
  in the target deployment; provisioning one is an operational step, not a code change.

Full behavior-by-behavior analysis: [../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).
