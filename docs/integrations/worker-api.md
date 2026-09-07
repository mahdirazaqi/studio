# Render Worker REST API

**Implemented, Phase 7** (claim/get/state/progress/duration). **Result acceptance
implemented, Phase 9** (§2, ADR-0039). **Per-Worker, Department-scoped API keys
implemented, Phase 11** (§3/§4, ADR-0040 — supersedes ADR-0032's single shared static
key). **YouTube delivery removed, Phase 12** (ADR-0041) — `POST .../result` now simply
registers the rendered result and marks the Job `RENDERED`, its final state; no
external upload of any kind happens. ADR-0004 (surface & auth requirement), ADR-0033
(API surface & versioning), ADR-0034 (trust model & idempotency, revised by ADR-0040).

The **Render Worker** is an external service (not in this repo) that performs the actual
video rendering. It is the **only** first-class REST client of Studio. Studio must keep it
working with **minimal changes** — the endpoint semantics are a compatibility contract.

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
- **Versioned:** `/api/worker/v1/...`.
- **Thin handlers → shared use cases.** Every handler is `defineRouteHandler({ name,
authenticate: authenticateWorker, params/body, handler })` — authenticate, validate,
  call a Phase 6 use case (or a small Phase 7 adapter over one, for input mapping only),
  map the result. No business/state-machine logic lives in `src/app/api/worker/**`.
- **Atomic claim**, **validated state transitions** — both entirely Phase 6's guarantees
  (ADR-0029), untouched by this layer.

### Endpoints

| Method  | Path                               | Maps to legacy             | Handler calls                                                            |
| ------- | ---------------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `POST`  | `/api/worker/v1/jobs/next`         | `GET /jobs/fetch`          | `claimNextJob()` — atomic; `204` when the queue is empty.                |
| `GET`   | `/api/worker/v1/jobs/:id`          | `GET /jobs/:id`            | `getJobForWorker(id, allowedDepartmentIds)` — Department-scoped, see §4. |
| `PATCH` | `/api/worker/v1/jobs/:id/state`    | `PATCH /jobs/:id/state`    | `transitionJobForWorker(id, body)` → `transitionJob` (Phase 6).          |
| `PATCH` | `/api/worker/v1/jobs/:id/progress` | `PATCH /jobs/:id/progress` | `updateJobProgress({ jobId, progress })` (Phase 6).                      |
| `PATCH` | `/api/worker/v1/jobs/:id/duration` | `PATCH /jobs/:id/duration` | `updateJobDuration({ jobId, durationSeconds })` (Phase 6).               |
| `POST`  | `/api/worker/v1/jobs/:id/result`   | `POST /jobs/:id/upload`    | `acceptJobResult(id, videoBuffer)` (Phase 9, ADR-0039).                  |
| `GET`   | `/api/files/:fileId`               | n/a (new)                  | Worker-authenticated branch of the existing Phase 4 route — see §5.      |

**`POST /api/worker/v1/jobs/:id/result` — implemented, Phase 9, revised ADR-0041.**
Accepts the finished render and registers it as the Job's completion
(docs/domain/jobs.md "Rendered result"). **Not multipart** — the request body is the
raw video bytes, any `Content-Type` (the real type is sniffed from the bytes, never
trusted from the header); this mirrors `/api/files/[fileId]`'s own raw-bytes response
in the other direction and needed no new body-parsing capability in
`defineRouteHandler`. The handler is still thin: it reads `request.arrayBuffer()` and
calls `acceptJobResult` — media processing and artifact creation live in
`features/delivery/use-cases/*`, not in the route. **It does not upload anywhere** —
there is no YouTube API call, no external delivery of any kind, ever, from this
endpoint (ADR-0041).

- Legal only from a Job in `RENDERING`. A duplicate Worker request (the Job already has a
  `videoFileId`) is recognized and returned as-is — no reprocessing.
- Success response: `{ id, state, videoFileId }` — `state` is `RENDERED` (the Job's
  final, successful completion state) or `ERROR` if something about the result was
  rejected. There is no `DELIVERING`/`UPLOADED` to report — those states were removed
  (ADR-0041).
- `POST /api/worker/v1/files` (a Worker uploading an input file) remains **not
  implemented** — see §6.

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
      "src": "https://studio.example/api/files/file_...",
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

**Per-asset `src`/`text` mapping** (`type` is always the lowercase `JobAssetKind`):

| `type`                      | Carries the value in | Notes                                                                                        |
| --------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `script`                    | `src`                | The Template's `scriptRef`, copied verbatim — matches legacy's `{type:'script', src:...}`.   |
| `data`                      | `text`               | The literal value the Job was created with.                                                  |
| `image` / `audio` / `video` | `src`                | A URL, **not a filesystem path** — see §5. `null` if the source File has since been deleted. |

### Empty-queue behavior — implemented

`POST /api/worker/v1/jobs/next` returns **`204 No Content`** when no Job is eligible —
not `404` (legacy) and not an ambiguous `200` with an empty body. A Worker's poll
finding nothing to do is a normal outcome (ADR-0033).

## 3. Authentication — implemented (ADR-0040, supersedes ADR-0032)

Each Worker identity is a `WorkerApiKey` row — created, scoped to one or more
Departments, revoked/reactivated, and re-scoped by an **ADMIN** at `/worker-keys`
(`worker_key:manage`, ADMIN-only) — sent as `Authorization: Bearer <secret>` on every
`/api/worker/v1/**` request and on a Worker-authenticated `/api/files/[fileId]` request.
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
- `POST /api/worker/v1/jobs/next`'s atomic claim (`SELECT ... FOR UPDATE SKIP LOCKED`)
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

## 5. Worker access to input Files — implemented

`GET /api/files/[fileId]` (Phase 4) gained a second, Worker-authenticated path rather
than a new endpoint: a request bearing an `Authorization` header is authenticated as a
Worker and served **unscoped** by Department; a request without one falls back to the
original, unchanged session-cookie path. A request is never silently retried on the
other path — a bad `Authorization` header fails as a Worker-auth failure, it does not
fall back to session auth even if a valid session cookie is also present.

This closes a gap none of Phases 4–6 addressed explicitly: the claim/get-by-id payload
must include "resolved File information required for download" (Phase 7 brief §12), but
Studio's storage abstraction (ADR-0024) never hands out a raw filesystem path the way
legacy's `File.path` did. The Worker downloads bytes the same way a browser does — an
authenticated `GET`, byte-range support included — just with its own Bearer credential
instead of a session cookie. The URL is built from the inbound request's own origin
(`new URL(request.url).origin`), not a separate `APP_URL` config value, so it works
correctly regardless of how the Worker reaches Studio.

## 6. Deferred — not implemented

- **`POST /api/worker/v1/jobs/:id/result`** — implemented, Phase 9. See §2 above.
- **`POST /api/worker/v1/files`** — a Worker uploading an input file directly. No
  concrete requirement calls for this yet (input files come from the Gallery, resolved
  at Job creation) — deferred until the result-upload endpoint above needs it, if ever.
- **Cancel / retry over the Worker API** — never part of the legacy Worker contract
  (both were dashboard/GraphQL-only) and nothing in the current lifecycle needs them
  (Phase 7 brief §18/§19).
- **Rate limiting per Worker credential** — OD-41 stays open.
- **Worker-timeout requeue sweep** (a Job stuck in `CLAIMED`/`RENDERING`) — OD-31 stays
  open; the `CLAIMED → QUEUED` transition exists in the state graph for it.

## 6a. Worker compatibility matrix (five required operations)

| Legacy route               | Legacy method | Studio route                       | Studio method | Request                                                                  | Response                                                          | Auth                                                                        | Notes                                                                                                                                                                                                    |
| -------------------------- | ------------- | ---------------------------------- | ------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /jobs/fetch`          | `GET`         | `/api/worker/v1/jobs/next`         | `POST`        | none                                                                     | `200` claim payload (see §2) or `204 No Content` if none eligible | `Authorization: Bearer <WorkerApiKey secret>` (Department-scoped, ADR-0040) | Method intentionally changed: a side-effecting `GET` is forbidden (Security Requirements §11); atomic claim (`SELECT ... FOR UPDATE SKIP LOCKED`), never a find-then-update race.                        |
| `POST /jobs/:id/upload`    | `POST`        | `/api/worker/v1/jobs/:id/result`   | `POST`        | Raw video bytes (any `Content-Type`; sniffed server-side), not multipart | `200 { id, state, videoFileId }`                                  | `Authorization: Bearer <WorkerApiKey secret>` (Department-scoped, ADR-0040) | Renamed `upload` → `result`; registers the render as the Job's completion (state becomes `RENDERED`, terminal — ADR-0041). No YouTube/external upload of any kind. Idempotent on a duplicate submission. |
| `PATCH /jobs/:id/state`    | `PATCH`       | `/api/worker/v1/jobs/:id/state`    | `PATCH`       | `{ state }` — legacy integer 0–9 **or** a Studio state name              | `200 { id, state }`                                               | `Authorization: Bearer <WorkerApiKey secret>` (Department-scoped, ADR-0040) | Legacy accepted **any** integer with no validation; Studio validates against the state machine (`422`/`409` for an illegal/raced transition). `errorReason` required when the target is `ERROR`.         |
| `PATCH /jobs/:id/progress` | `PATCH`       | `/api/worker/v1/jobs/:id/progress` | `PATCH`       | `{ progress: 0..100 }`                                                   | `200 { id, progress }`                                            | `Authorization: Bearer <WorkerApiKey secret>` (Department-scoped, ADR-0040) | Legacy `{progress}` was unvalidated; Studio validates the range and rejects once the Job is terminal.                                                                                                    |
| `PATCH /jobs/:id/duration` | `PATCH`       | `/api/worker/v1/jobs/:id/duration` | `PATCH`       | `{ durationSeconds: >=0 }`                                               | `200 { id, durationSeconds }`                                     | `Authorization: Bearer <WorkerApiKey secret>` (Department-scoped, ADR-0040) | Legacy key was `duration`; Studio renamed to `durationSeconds` (resolves OD-33) and validates non-negative.                                                                                              |
| n/a (Worker had none)      | —             | `GET /api/worker/v1/jobs/:id`      | `GET`         | none                                                                     | `200` same payload shape as claim                                 | `Authorization: Bearer <WorkerApiKey secret>` (Department-scoped, ADR-0040) | New — lets a Worker that crashed mid-render re-fetch the Job it was working on, by id, instead of losing its place.                                                                                      |

All five required routes plus the new GET-by-id were re-verified with real HTTP requests
against a running dev server (not just unit tests) during the most recent Worker-API
review: unauthenticated/wrong-credential requests correctly `401`; the atomic claim
correctly picked the oldest `QUEUED` Job; state/progress/duration validation and
transition-legality errors matched exactly (`422` for both bad input and an illegal
transition, `404` for a nonexistent Job id); the result endpoint accepted a real,
`ffmpeg`-generated test video, transitioned the Job straight to `RENDERED` (its final,
terminal state — ADR-0041, no YouTube/delivery step of any kind), and returned the
identical response (same `videoFileId`, no reprocessing) on a duplicate submission; an
oversized `Content-Length` was rejected before the body was read; legacy state codes `6`
(Uploading) and `7` (Uploaded) were confirmed rejected with a clear `422`.

## 7. Compatibility notes / risks

- **404 → 204 for empty queue**: resolved as `204` (ADR-0033) — if the actual Worker
  hard-depends on `404`, that is a Worker-side update, not a Studio compatibility
  shim; not confirmed against the real Worker's code.
- **`GET` vs `POST` for claim**: resolved as `POST`-only (ADR-0033) — legacy's `GET
/jobs/fetch` was a side-effecting GET, exactly what Security Requirements §11 forbids.
  No `GET` alias was added; confirm the real Worker can be updated to `POST` before
  cutover.
- **Base path / version prefix**: `/api/worker/v1` replaces legacy's unprefixed,
  unversioned routes — the Worker's base-URL config must be updated regardless of auth.
- The Worker's own implementation and technology are **unknown** — coordinate any
  contract change, and this phase's untested assumptions above, with whoever owns it
  before a real cutover.

Full behavior-by-behavior analysis: [../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).
