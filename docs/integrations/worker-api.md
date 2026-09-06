# Render Worker REST API

**Implemented, Phase 7** (all rows below except the result-upload endpoint — see §6).
ADR-0004 (surface & auth requirement), ADR-0032 (authentication mechanism), ADR-0033
(API surface & versioning), ADR-0034 (trust model & idempotency).

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
- **Authenticated:** every endpoint requires the Worker's shared service credential
  (ADR-0004, ADR-0032). **This is the one deliberate breaking change.**
- **Versioned:** `/api/worker/v1/...`.
- **Thin handlers → shared use cases.** Every handler is `defineRouteHandler({ name,
authenticate: authenticateWorker, params/body, handler })` — authenticate, validate,
  call a Phase 6 use case (or a small Phase 7 adapter over one, for input mapping only),
  map the result. No business/state-machine logic lives in `src/app/api/worker/**`.
- **Atomic claim**, **validated state transitions** — both entirely Phase 6's guarantees
  (ADR-0029), untouched by this layer.

### Endpoints

| Method  | Path                               | Maps to legacy             | Handler calls                                                       |
| ------- | ---------------------------------- | -------------------------- | ------------------------------------------------------------------- |
| `POST`  | `/api/worker/v1/jobs/next`         | `GET /jobs/fetch`          | `claimNextJob()` — atomic; `204` when the queue is empty.           |
| `GET`   | `/api/worker/v1/jobs/:id`          | `GET /jobs/:id`            | `getJobForWorker(id)` — unscoped, see §4.                           |
| `PATCH` | `/api/worker/v1/jobs/:id/state`    | `PATCH /jobs/:id/state`    | `transitionJobForWorker(id, body)` → `transitionJob` (Phase 6).     |
| `PATCH` | `/api/worker/v1/jobs/:id/progress` | `PATCH /jobs/:id/progress` | `updateJobProgress({ jobId, progress })` (Phase 6).                 |
| `PATCH` | `/api/worker/v1/jobs/:id/duration` | `PATCH /jobs/:id/duration` | `updateJobDuration({ jobId, durationSeconds })` (Phase 6).          |
| `GET`   | `/api/files/:fileId`               | n/a (new)                  | Worker-authenticated branch of the existing Phase 4 route — see §5. |

`POST /api/worker/v1/files` (a Worker uploading an input file) and `POST
/api/worker/v1/jobs/:id/result` (delivering the finished render) are **not
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
| 5          | Rendered    | `RENDERED`                                                              |
| 6          | Uploading   | `DELIVERING`                                                            |
| 7          | Uploaded    | `UPLOADED`                                                              |
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

## 3. Authentication — implemented (ADR-0032)

A single shared static API key, `WORKER_API_KEY` (required environment variable — the
process refuses to start without it), sent as `Authorization: Bearer <key>` on every
`/api/worker/v1/**` request and on a Worker-authenticated `/api/files/[fileId]` request.
Compared with a timing-safe check (`@/server/worker-auth`) — see ADR-0032 for exactly
why (fixed-length digest comparison, not a raw string compare). Missing, malformed
(no `Bearer` prefix, empty token), or incorrect credentials all produce the same `401
unauthenticated` response, with no indication of which case it was and no part of the
submitted value echoed back.

**Not implemented, deliberately** (ADR-0032): a `WorkerCredential` database table,
per-Worker identity, key rotation without a redeploy, multiple simultaneous keys,
API-key management UI. Rotating the credential means changing the environment variable
and redeploying.

The Worker principal:

- is not a `User`, has no Department, never becomes an `Actor`;
- can call `/api/worker/**` and (with the same credential) `/api/files/[fileId]`;
- is **not** individually rate-limited or logged beyond what
  [../security/security.md](../security/security.md) already covers for the whole app —
  a dedicated Worker-credential rate limiter was not built this phase (OD-41 stays
  open; Worker authentication itself remains mandatory regardless).

## 4. Trust model — implemented (ADR-0034)

Studio's Worker is **one shared, non-departmental principal** — there is no per-Worker
identity to restrict by, and this page does not pretend otherwise (Phase 7 brief §14):

- `GET /api/worker/v1/jobs/:id` returns **any** Job by id, claimed or not, from any
  Department. Resolves OD-30.
- If two physical Worker processes somehow share the credential, each can read and
  mutate (via progress/duration/state) any Job the other is working on. This is an
  accepted consequence of skipping per-Worker identity (ADR-0032), not an oversight.
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

## 6. Deferred — not implemented this phase

- **`POST /api/worker/v1/jobs/:id/result`** (legacy `POST /jobs/:id/upload`) — delivering
  the finished render. Needs `JOB_ARTIFACT` File creation and a screenshot/thumbnail
  pipeline (`execFile`/`spawn` only, ADR-0015), neither of which exists yet (Phase 6
  explicitly deferred both). A placeholder endpoint that stores nothing real was
  explicitly rejected (Phase 7 brief §20) as worse than not building it.
- **`POST /api/worker/v1/files`** — a Worker uploading an input file directly. No
  concrete requirement calls for this yet (input files come from the Gallery, resolved
  at Job creation) — deferred until the result-upload endpoint above needs it, if ever.
- **Cancel / retry over the Worker API** — never part of the legacy Worker contract
  (both were dashboard/GraphQL-only) and nothing in the current lifecycle needs them
  (Phase 7 brief §18/§19).
- **Rate limiting per Worker credential** — OD-41 stays open.
- **Worker-timeout requeue sweep** (a Job stuck in `CLAIMED`/`RENDERING`) — OD-31 stays
  open; the `CLAIMED → QUEUED` transition exists in the state graph for it.

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
