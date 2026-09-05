# YouTube Integration

Studio can publish a finished render to YouTube as part of Job delivery.

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

## 2. Studio design

### YouTube Target

The legacy `Channel` concept becomes a **`YouTubeTarget`** in Studio:

| Field              | Notes                                                             |
| ------------------ | ----------------------------------------------------------------- |
| `id`               |                                                                   |
| `name`             | Display name of the connected channel.                            |
| `youtubeChannelId` | The actual YouTube channel id.                                    |
| OAuth credential   | Access + refresh token, auto-refreshed; stored encrypted at rest. |
| `status`           | `CONNECTED` \| `DISCONNECTED` \| `ERROR`.                         |
| `departmentId`?    | **OPEN DECISION** — see below.                                    |

> **`OPEN DECISION` — is a YouTubeTarget department-scoped or global?** _Consequence of
> department-scoped:_ a department manages its own channels; clean isolation; matches the
> rest of the model. _Consequence of global (ADMIN-managed):_ fewer OAuth connections to
> maintain, but any department could publish to any channel. Recommended:
> **department-scoped**, ADMIN may also manage all.

### Template ↔ Target

- A Template may set `youtubeTargetId`. If set, Jobs from that Template **may** be
  delivered to that target (the operator still chooses per Job via `deliverToYouTube`).
- The target must exist and (if department-scoped) belong to the Template's Department at
  save time.
- The `youtubeTargetId` and enough target identity are **captured in the Job snapshot**
  so a historical Job explains where it was published even if the target is later
  disconnected.

### Delivery (ADR-0016 — durable)

- After the render result is attached and screenshot/thumbnail generated:
  - if `deliverToYouTube`: the YouTube adapter uploads the video + sets the thumbnail,
    using `description` and resolved `tags` **from the snapshot**.
  - the outcome (`SUCCESS` / `FAILURE` + reason + YouTube video id) is recorded on the
    Job as a `DeliveryOutcome`.
- **Not fire-and-forget.** Runs via the durable background mechanism (OPEN DECISION).
- On failure: Job → `ERROR` with `errorReason` **surfaced to the operator** (in-app +
  Telegram), not just logged.
- Retry of a failed delivery is via the standard **retry = new Job** path, or a
  targeted "retry delivery only" action (OPEN DECISION — is delivery-only retry worth a
  separate use case, given the render output still exists?).

### Video privacy / metadata

> **`OPEN DECISION` — privacy status & metadata configurability.** Legacy hard-coded
> `private` + `madeForKids: false`. Should Studio expose privacy (`private` / `unlisted`
> / `public`), publish-at scheduling, category, `madeForKids`, per Template or per Job?
> _Consequence of keeping hard-coded `private`:_ safe default, matches legacy, less UI.
> _Consequence of configurable:_ real publishing workflow, but more validation + more
> ways to get it wrong. Recommended: **default `private`, allow `unlisted`/`public` as a
> Template-level setting**, defer scheduling.

### Tags

- Same substitution model as legacy: `Template.tags` with `{{layer}}` tokens replaced by
  the Job's `DATA` asset values, computed **at snapshot time**.
- Tags with unresolved placeholders are dropped (legacy behavior kept — a misconfigured
  template produces fewer tags, not an error).
- The redundant legacy `excludeTags` set is not reproduced (it was dead logic).

### Quota / cap

- See the **upload cap OPEN DECISION** in [../domain/jobs.md](../domain/jobs.md). The
  YouTube Data API quota is realistically **per API project** (often aligned per
  channel), so a **per-target** cap is the likely correct model rather than legacy's
  single global counter.
- The cap is checked **before** creating a Job/retry (never after a destructive step —
  legacy retry bug).

## 3. External boundary

- YouTube is an **external service**; Studio owns only the `YouTubeTarget` record and the
  `DeliveryOutcome`. The uploaded video and its analytics live on YouTube.
- All calls go through `server/adapters/youtube` with explicit timeouts and error
  mapping; the adapter is the only place `googleapis`/OAuth logic lives.

## 4. Out of scope for Studio

- YouTube analytics, copyright, competitor tracking, channel management dashboards — all
  legacy-wide features unrelated to the render pipeline. Studio does **not** absorb them.
