# YouTube Integration

**Implemented, Phase 9** (ADR-0039). Studio publishes a finished render to YouTube as
part of Job delivery, triggered by the Worker's result-upload request
(docs/integrations/worker-api.md §2). **YouTube Target management moved to ADMIN-only,
many-to-many Department scope, Phase 11** (ADR-0040).

## 1. Legacy behavior (reference only) `LEGACY`

From `qtical-backend-node/src/render/job/job.service.ts` (`uploadJobToYoutube`) and
`src/youtubeapi` (see [../legacy/render-module-analysis.md](../legacy/render-module-analysis.md)
§7, §10, §18).

- A **Template** optionally references a `_channel` (a `Channel` document = a connected
  YouTube channel with an OAuth token, auto-refreshed via `channel.token()`).
- A Job is uploaded to YouTube only if **`job.upload === true` AND the Template has a
  `_channel`**.
- After the Worker uploads the rendered `.mp4`:
  - `YoutubeapiService.insertVideo(token, videoStream, job.title, template.description,
tags)` — **privacy forced to `private`, `madeForKids: false`, hard-coded**.
  - `YoutubeapiService.setVideoThumbnail(token, screenshotStream, videoId)`.
  - Tags = `Template.tags` with `{{layer}}` placeholders substituted from the Job's
    `data` asset values; any tag still containing an unresolved `{{...}}` is dropped.
- Called **fire-and-forget** (unawaited) right after returning `200` to the Worker.
- On **any** error: the Job is flipped to `State.Error`; the **reason is only logged
  server-side** — the Worker already got `200` and the operator sees only "Error".
- A **global** daily cap of **3** `upload:true` jobs across the entire system gates
  creation and retry (a stand-in for the YouTube Data API quota).

## 2. Studio design (implemented, Phase 9, ADR-0039)

### Rendered result flow

```text
Worker: POST /api/worker/v1/jobs/:id/result   (raw video bytes)
        │
        ▼
accept-job-result.ts
  ├─ Job must be RENDERING (else: duplicate-result idempotency, see §5)
  ├─ generate-render-artifacts.ts (MediaProcessingService)
  │    ├─ ffmpeg: extract a screenshot frame (00:00:04.000, retried at 0s for a
  │    │  short render)
  │    ├─ ffmpeg: resize the screenshot to a small thumbnail (scale filter —
  │    │  no ImageMagick, see §3)
  │    └─ create 3 JOB_ARTIFACT Files: video, screenshot, thumbnail
  ├─ atomic RENDERING -> RENDERED transition, setting all 3 File ids together
  └─ deliver-job-result.ts (Delivery Orchestrator, awaited synchronously)
       ├─ Telegram: best-effort "rendered" notification
       ├─ no YouTube needed  -> RENDERED -> UPLOADED, "uploaded" notification
       └─ YouTube needed     -> RENDERED -> DELIVERING
            ├─ DeliveryAttempt(YOUTUBE, PENDING) committed first
            ├─ upload video + set thumbnail (server/adapters/youtube/youtube-client.ts)
            ├─ success -> DeliveryAttempt SUCCEEDED, DELIVERING -> UPLOADED, notify
            └─ failure -> DeliveryAttempt FAILED,   DELIVERING -> ERROR,    notify
```

### YouTube Target

The legacy `Channel` concept is `YouTubeTarget` (`prisma/schema.prisma`):

| Field                                          | Notes                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`, `name`, `youtubeChannelId`               | `youtubeChannelId` is resolved server-side from the real YouTube API at connection time — never client-supplied.                                                                                 |
| `encryptedRefreshToken`/`encryptedAccessToken` | AES-256-GCM, `server/adapters/youtube/token-cipher.ts` — never plaintext at rest, never logged, never returned to a client.                                                                      |
| `accessTokenExpiresAt`                         | Drives on-demand refresh with a safety margin (`features/youtube/use-cases/get-valid-access-token.ts`).                                                                                          |
| `status`                                       | `CONNECTED` \| `DISCONNECTED` \| `ERROR` — a refresh failure (revoked token) marks it `ERROR` with a safe `lastErrorReason`, taking it out of future Job creation eligibility until reconnected. |
| `departments`                                  | **Revised, ADR-0040: many-to-many with `Department`, not a single FK.** A Target may serve several Departments (one channel is commonly shared) — see "Management & Department scope" below.     |

**Connection is a verified refresh-token entry, not a "Connect with Google" OAuth
consent-screen flow** (ADR-0039 point 5) — a deliberate scope reduction, not an
oversight:

1. An **ADMIN** (revised, ADR-0040 — was MANAGER+, department-scoped) obtains a refresh
   token for the target channel out-of-band (Google's OAuth Playground, or an equivalent
   one-time consent flow against Studio's own registered `YOUTUBE_CLIENT_ID`/
   `YOUTUBE_CLIENT_SECRET`).
2. They paste it into Studio's `/youtube` page (`features/youtube/components/
youtube-targets-manager.tsx`) along with a display name and the set of Departments the
   channel should serve.
3. `connectYoutubeTarget` (`features/youtube/use-cases/connect-youtube-target.ts`)
   immediately exchanges it for an access token and calls the real `channels.list` API —
   a bad/expired/revoked token is rejected right there, never silently stored.
4. The refresh token is encrypted and stored; the resolved `youtubeChannelId`/channel
   title come from the API response, never the client's input. `youtubeChannelId` is now
   globally unique (was unique per-Department) — a channel is no longer owned by exactly
   one Department, so reconnecting the same channel updates the existing row rather than
   creating a duplicate per Department.

### Management & Department scope — revised, ADR-0040

`youtube:manage` (connect/disconnect/edit-Department-scope) is **ADMIN-only** — the same
reasoning `worker_key:manage` uses (docs/integrations/worker-api.md §3a): choosing which
Departments may use a shared channel is system-wide infrastructure configuration, not a
Department-local operation a MANAGER should own. From `/youtube`, an ADMIN can also edit
an existing Target's Department scope — a full replace of the assigned Departments
(never a diff), taking effect immediately (nothing cached; the next Template-form load or
Job creation re-reads the relation fresh).

**Non-ADMIN users are unaffected in what they can _do_.** `USER`/`MANAGER` never manage
Target connections — they only ever _select_ an already-connected, already-scoped
channel when authoring a Job or Template, filtered to Targets assigned to their own
Department (`findConnectedYoutubeTargetForDepartment`), gated by `template:manage`/
`job:manage` exactly as before, never by `youtube:manage`.

A full self-service OAuth consent-screen UI (`GET /api/youtube/oauth/callback` + a
"Connect with Google" button) is a documented, deliberately deferred future enhancement —
it improves connection UX but is not required for the delivery pipeline itself to work
correctly and safely.

### Template ↔ Target

- A Template may set `youtubeTargetId` (verified server-side, on every create/update, to
  belong to the Template's own Department and be `CONNECTED` —
  `features/templates/use-cases/verify-youtube-target.ts`, mirrors
  `verify-file-references.ts`'s pattern for `defaultFileId`).
- **Job creation enforces this**: `deliverToYouTube: true` with a Template that has no
  `youtubeTargetId`, or whose Target is no longer `CONNECTED`, is rejected with a clear
  `business_rule` error (`features/jobs/use-cases/create-job.ts`) — matching legacy's
  "upload only if the Template has a channel" rule, enforced once, at creation.
- The Target's identity (`id`, `name`, `youtubeChannelId`) is captured in the Job's
  immutable `snapshot.youtubeTarget` at creation — a later Target disconnect/rename/
  Template edit never changes what an already-created Job believes it should deliver to
  (docs/data/historical-integrity.md).

### Delivery (ADR-0039 — durable, not fire-and-forget)

- Runs **synchronously, awaited**, inside the Worker's own result-upload request — the
  direct fix for legacy's unawaited `this.uploadJobToYoutube(job)` call.
- Every attempt is recorded as a `DeliveryAttempt` row, **written as `PENDING` before the
  external API call runs** — the actual durability guarantee: a process crash mid-upload
  leaves an accurate, retryable record rather than a silently lost one. See
  §5 "Idempotency & concurrency."
- On failure: Job → `ERROR` with `errorReason` **surfaced to the operator** (dashboard +
  a generic "failed" Telegram DM, never the raw provider error), not just logged — the
  direct fix for legacy's "reason is only logged server-side."
- **Delivery-only retry** (resolves OD-13 for YouTube): `retryJobDelivery`
  (`features/delivery/use-cases/retry-job-delivery.ts`) re-runs only the YouTube upload
  from an `ERROR` Job that still has its rendered video — it never re-renders or
  recreates the Job (docs/domain/jobs.md "Job Retry vs Delivery Retry"). Refuses if the
  delivery already succeeded, or if the render itself failed (no video to redeliver —
  use `retryJob` instead). Available from the Job detail page (`/jobs/:id`) whenever a
  Job is `ERROR`, `deliverToYouTube` is true, and a rendered video exists.

### Video privacy / metadata

**Kept hard-coded, exactly like legacy** (OD-37 stays open, unresolved by design this
phase): `privacyStatus: 'private'`, `madeForKids: false`
(`server/adapters/youtube/youtube-client.ts`'s `uploadVideo`). No per-Template/per-Job
override exists.

### Tags

- Same substitution model as legacy: `Template.tags` with `{{layer}}` tokens replaced by
  the Job's `DATA` asset values (`features/delivery/domain/tag-substitution.ts`), computed
  at delivery time from the Job's own immutable `snapshot`/`JobAsset` rows.
- Tags with unresolved placeholders are dropped (legacy behavior kept).
- The redundant legacy `excludeTags` set is not reproduced (dead logic — unchanged from
  the Phase 0 design).

### Media processing

`ffmpeg` only — **ImageMagick was deliberately not migrated** (ADR-0039 point 2): legacy
used `fluent-ffmpeg` for the screenshot and a separate `exec('convert ... -resize
x150 ...')` for the thumbnail; Studio's `ffmpeg` `scale` video filter covers the resize
need exactly, so one native dependency does both steps
(`server/adapters/media/ffmpeg-adapter.ts`). Every invocation is `execFile` with a fixed
argument array — **never** a template-built shell string, **never** `shell: true`
(docs/security/security.md §6). All work happens in a private `mkdtemp` temp directory,
always removed. Manually verified against a real, generated test video, including the
"ffmpeg exits `0` but writes nothing" edge case when the seek offset exceeds a very short
render's actual duration (the fallback checks the output file's actual size, not just the
exit code).

### Idempotency & concurrency

- **Duplicate Worker result submission**: a Job no longer in `RENDERING` that already has
  a `videoFileId` is recognized as already-processed and returned as-is — no
  reprocessing, no second delivery run (docs/integrations/worker-api.md §2).
- **Concurrent result submissions racing** (two genuinely simultaneous Worker requests
  for the same Job): both generate artifacts, but only one wins the atomic conditional
  `RENDERING -> RENDERED` update (`transitionJobRow`); the loser rolls back its own
  artifacts and returns the winner's result.
- **Concurrent delivery retries**: `(jobId, provider, attemptNumber)` is a unique
  database constraint — a second, simultaneous retry click fails with a clean `conflict`
  rather than creating two `DeliveryAttempt` rows for the same attempt.
- **Already-successful delivery**: `retryJobDelivery` refuses if any prior `DeliveryAttempt`
  for that provider is `SUCCEEDED` — a YouTube upload is never repeated once it landed.
- The YouTube Data API itself provides no exactly-once upload guarantee beyond this —
  Studio's own guarantee is "never _initiates_ a second upload once one has recorded
  success," not "the network call itself cannot partially succeed in a way Studio can't
  observe." No stronger guarantee was pursued this phase.

### Quota / cap

- Unchanged from Phase 6 (ADR-0030): a **global**, UTC-day, count-based cap
  (`JOB_UPLOAD_DAILY_CAP`). **Still open:** a per-`YouTubeTarget` cap — no concrete
  quota-per-channel requirement was given this phase, so the model now exists but the cap
  does not scope to it (OD-01).

## 3. External boundary

- YouTube is an **external service**; Studio owns only the `YouTubeTarget` record and
  `DeliveryAttempt` rows. The uploaded video and its analytics live on YouTube.
- All calls go through `server/adapters/youtube/youtube-client.ts` (the only module that
  imports `googleapis`) with explicit error mapping to `dependencyError`; a
  `features/youtube/infrastructure`-equivalent split was not needed since the client is
  already a thin, Studio-domain-free wrapper.

## 4. Out of scope for Studio

- YouTube analytics, copyright, competitor tracking, channel management dashboards — all
  legacy-wide features unrelated to the render pipeline. Studio does **not** absorb them.
- A self-service "Connect with Google" OAuth consent-screen UI (§2 above).
- Per-YouTube-target upload quota, configurable privacy/scheduling, automatic artifact
  cleanup scheduling — all documented `OPEN DECISION`s, not silently decided.
