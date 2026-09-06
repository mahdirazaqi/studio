# Render Worker REST API

The **Render Worker** is an external service (not in this repo) that performs the actual
video rendering. It is the **only** first-class REST client of Studio. Studio must keep it
working with **minimal changes** — the endpoint semantics are a compatibility contract.

**Phase 6 status:** none of this REST surface is exposed yet — that's Phase 7. Phase 6
built the application services this surface will call directly, with no `Actor`
parameter (the Worker is never a `User` — see
[../domain/jobs.md](../domain/jobs.md) "Worker identity vs User identity"):
`claimNextJob()` (atomic, `features/jobs/use-cases/claim-next-job.ts`),
`updateJobProgress()`/`updateJobDuration()` (`features/jobs/use-cases/`), and
`transitionJob(jobId, targetState)` (`features/jobs/use-cases/transition-job.ts`) for
state changes. A future `POST /api/worker/v1/jobs/next` Route Handler authenticates the
Worker's service credential first, then calls `claimNextJob()` directly — no business
logic is duplicated at the REST layer, per this page's own "thin handlers → shared use
cases" principle below.

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

Legacy retry/cancel were **GraphQL**, not REST — the Worker did not call them.

## 2. Studio Worker API — design

### Principles

- **Compatibility first:** same operations, same request/response _shape_ where
  reasonable, so the Worker's diff is small.
- **Authenticated:** every endpoint requires a Worker service credential (ADR-0004).
  **This is the one deliberate breaking change.**
- **Versioned:** `/api/worker/v1/...` (exact scheme = OPEN DECISION — path prefix vs
  header).
- **Thin handlers** → shared use cases.
- **Atomic claim**, **validated state transitions**.

### Endpoints (proposed)

| Method  | Path                               | Maps to legacy          | Notes                                                                                                                                                                                                                                                     |
| ------- | ---------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`  | `/api/worker/v1/files`             | `POST /files`           | Upload an input file the Worker needs to attach. Stored as `JOB_ARTIFACT` (or `GALLERY_ASSET` if flagged). Content-type + size validated.                                                                                                                 |
| `POST`  | `/api/worker/v1/jobs/next`         | `GET /jobs/fetch`       | **Atomic claim.** Returns the next job built from its **snapshot**, or `204 No Content` when the queue is empty (legacy returned 404 — see compat note). Changed to `POST` because it mutates state; supporting `GET` too is an OPEN DECISION for compat. |
| `GET`   | `/api/worker/v1/jobs/:id`          | `GET /jobs/:id`         | Read one job (snapshot view). Worker may only read jobs it has claimed (OPEN DECISION on strictness).                                                                                                                                                     |
| `PATCH` | `/api/worker/v1/jobs/:id/progress` | same                    | `{ progress: 0..100 }`, validated.                                                                                                                                                                                                                        |
| `PATCH` | `/api/worker/v1/jobs/:id/duration` | same                    | `{ durationSeconds: number }`, validated ≥ 0.                                                                                                                                                                                                             |
| `PATCH` | `/api/worker/v1/jobs/:id/state`    | same                    | `{ state }` — accepts legacy **integers** and/or Studio **names**; mapped and **validated against the state machine**. Invalid transition → `409`.                                                                                                        |
| `POST`  | `/api/worker/v1/jobs/:id/result`   | `POST /jobs/:id/upload` | multipart video. Triggers screenshot/thumbnail + **durable** delivery. Returns `202 Accepted` (work continues asynchronously) — legacy returned `200`.                                                                                                    |

### State mapping at the boundary

| Legacy int | Legacy name | Studio canonical state                                        |
| ---------- | ----------- | ------------------------------------------------------------- |
| 0          | Queued      | `QUEUED`                                                      |
| 1          | Fetched     | `CLAIMED`                                                     |
| 2          | Downloading | `RENDERING` (substate not tracked internally — OPEN DECISION) |
| 3          | Started     | `RENDERING`                                                   |
| 4          | InProgress  | `RENDERING`                                                   |
| 5          | Rendered    | `RENDERED`                                                    |
| 6          | Uploading   | `DELIVERING`                                                  |
| 7          | Uploaded    | `UPLOADED`                                                    |
| 8          | Error       | `ERROR`                                                       |
| 9          | Cancel      | `CANCELED`                                                    |

The Worker API accepts what the Worker already sends; Studio maps and validates.

### Fetch/claim response (proposed, close to legacy)

```json
{
  "id": "job_...",
  "output": "<outputPattern from snapshot>",
  "title": "<title from snapshot>",
  "composition": "<composition from snapshot>",
  "template": "<template source from snapshot>",
  "assets": [
    {
      "composition": "...",
      "layer": "...",
      "type": "script|data|image|audio|video",
      "src": "<file reference>",
      "text": "<literal, for data>"
    }
  ]
}
```

Keeping the field names (`output`, `template`, `type`, `src`, `text`) matches legacy so
the Worker's parsing is unchanged. New fields may be **added**; existing ones are not
renamed without coordination.

## 3. Authentication

**Required on every endpoint.** Mechanism is an **OPEN DECISION**:

| Option                                                                      | Pros                             | Cons                                                           |
| --------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| **Static API key** (header `Authorization: Bearer <key>` or `X-Worker-Key`) | Trivial for the Worker to adopt  | Key rotation is manual; leaked key = full access until rotated |
| **HMAC-signed requests** (shared secret signs method+path+body+timestamp)   | Replay-resistant, body integrity | Worker code change to sign                                     |
| **mTLS**                                                                    | Strong, transport-level          | Cert management, infra support needed                          |
| **Short-lived token** from a credential exchange                            | Rotatable, revocable             | Extra endpoint + Worker token-refresh logic                    |

Recommended starting point: **static API key stored as a `WorkerCredential` (hashed at
rest), sent as a Bearer token**, with a documented rotation procedure; revisit HMAC/mTLS
if the Worker runs outside a trusted network.

The Worker principal:

- is not a `User`, has no Department;
- can only call `/api/worker/**`;
- can be **revoked** without touching any user;
- its calls are rate-limited and logged.

## 4. Deliberate improvements over legacy

| Legacy problem                                | Studio                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| No auth                                       | Service credential on every endpoint.                                                                                   |
| Non-atomic `fetch` (race → double claim)      | Atomic claim (`FOR UPDATE SKIP LOCKED`).                                                                                |
| `state` accepts any integer                   | Validated against the state machine; invalid → `409`.                                                                   |
| `progress`/`duration` unvalidated             | Range-checked.                                                                                                          |
| Fetch leaks template internals to anyone      | Auth required; response from snapshot.                                                                                  |
| Result upload → fire-and-forget delivery, 200 | `202 Accepted`; delivery is durable with recorded outcome.                                                              |
| No idempotency                                | Progress/state/duration should be idempotent; `result` upload should be safe to retry (same job id → overwrite/dedupe). |
| `.mp4`-only by extension                      | Validate by content type + extension + size.                                                                            |

## 5. Compatibility notes / risks

- **404 → 204 for empty queue** on the claim endpoint: the Worker may treat 404 as
  "empty" today; confirm and keep whichever the Worker expects, or support both.
  Tracked as OPEN DECISION.
- **`GET` vs `POST` for claim**: legacy used `GET /jobs/fetch` (a side-effecting GET —
  not ideal). Studio prefers `POST /jobs/next`. Supporting a `GET` alias for the Worker's
  current code is an OPEN DECISION.
- **Base path / version prefix**: legacy had no `/api` prefix and no version. The Worker
  config must be updated for the new base URL — the minimal unavoidable change beyond
  auth.
- The Worker's own implementation and technology are **unknown** — coordinate any
  contract change with whoever owns it.

Full behavior-by-behavior analysis: [../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).
