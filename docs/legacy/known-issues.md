# Legacy Known Issues — Must Not Reproduce

Every item is confirmed by direct reading of `qtical-backend-node/src/render` (and traced
dependencies). Full technical context: [render-module-analysis.md](render-module-analysis.md)
§20, §22. **Studio must not carry any of these forward for compatibility** (ADR-0012).

## Critical

### K1 — Worker REST endpoints are completely unauthenticated

`JobController` (`GET /jobs/fetch`, `GET /jobs/:id`, `PATCH /jobs/:id/progress|duration|state`,
`POST /jobs/:id/upload`) has **no** `@RestAuth()`, no guard, nothing. Anyone who can reach
the API can: read pending jobs (leaking `Template.script` / `src` / `composition` / asset
text), forge render completion, upload arbitrary `.mp4` files that get forwarded to
YouTube/Telegram under a real user's identity, or corrupt any job's state.

- **Studio:** every Worker endpoint requires a service credential (ADR-0004,
  [../integrations/worker-api.md](../integrations/worker-api.md), [../security/security.md](../security/security.md) §1).

### K2 — Command injection via unsanitized shell interpolation

`FileService.convertVideo/convertImage` and `JobService.convertScreenshot` build shell
strings by interpolating a file path into ``child_process.exec(`convert ${filepath} ...`)``.
The filename sanitizer (`FileUtil.removeNonAscii`) only strips non-ASCII; shell
metacharacters (`; | & $ ( ) \` "`) pass through. An authenticated user with just
`FILE_ADD`can upload`a"; rm -rf / #.jpg` and run arbitrary commands as the Node process.

- **Studio:** `execFile`/`spawn` with an argument array only; system-generated storage
  names; validated paths; no user string in any command (ADR-0015,
  [../security/security.md](../security/security.md) §7).

## High

### K3 — Race condition in job claiming

`JobService.fetch()` does `findOne({state:Queued})` then later `job.save({state:Fetched})`
— not atomic. Two concurrent worker polls get the **same** job and both render it.

- **Studio:** atomic claim (`SELECT ... FOR UPDATE SKIP LOCKED`) (ADR-0013,
  [../data/database.md](../data/database.md) §4).

### K4 — Destructive retry, with the quota check _after_ the delete

`JobService.retryJob` does `findOneAndDelete` on the original job **first**, then checks
the daily upload quota. If the quota is exhausted, the original job is **permanently
gone** and the retry fails — the user is left with nothing.

- **Studio:** Jobs are never deleted (ADR-0005). Retry creates a **new linked** Job;
  the cap is checked **before** any write; the original is untouched
  ([../domain/jobs.md](../domain/jobs.md) → Retry).

### K5 — Retry loses all historical data of the original job

Even when retry "works", the original job document is deleted; only
assets/workDir/title/retriedCount carry forward. Timestamps, progress history,
render/upload timing lineage are lost.

- **Studio:** original Job kept forever; retry chain fully traceable via `retryOfJobId` +
  `attemptNumber` ([../data/historical-integrity.md](../data/historical-integrity.md)).

### K6 — Aspect-ratio check uses exact floating-point equality

`TelegrambotService.checkAspectRatio` uses `Math.abs(ratio - 16/9) === 0`. Any image whose
dimensions don't divide to the exact IEEE-754 value (very common) is misclassified as
`None` and then fails validation against a template asset that requires a specific ratio.

- **Studio:** tolerance-based comparison (e.g. within ~1%); applied on **every** image
  path, not just Telegram ([../domain/templates.md](../domain/templates.md) → Aspect
  ratio).

### K7 — No department / workspace / ownership isolation in the render module

`TemplateFilter` / `JobFilter` / `FileFilter` accept an `accessFilters` param that the
services **never** pass. Any user with a `*_VIEW` permission sees **every** Template, Job,
and File system-wide.

- **Studio:** every scoped resource has a `departmentId`; every query is department-scoped
  in the use case and defensively in repositories (ADR-0011,
  [../domain/authorization.md](../domain/authorization.md)).

### K8 — Telegram bot enforces no permissions

The bot only checks _identity_ (phone-linked). It performs **no** `ActionEnum` checks. Any
linked user can create/retry/cancel jobs and — via "Cancel All Jobs" — **cancel every
non-terminal job in the entire system**, regardless of their real role.

- **Studio:** Telegram users get the identical role + department authorization as web
  users; "cancel all" is scoped to the user's department + cancelable jobs (ADR-0014,
  [../integrations/telegram.md](../integrations/telegram.md)).

### K9 — Template name uniqueness violations are unhandled

`TemplateService.addTemplate` has no try/catch; a duplicate `name` surfaces as a raw
MongoDB `E11000` 500.

- **Studio:** pre-checked + a clean validation error; uniqueness scope decided
  ([../domain/templates.md](../domain/templates.md)).

## Medium

### K10 — Fire-and-forget delivery with no durability

`uploadJobFile` calls `uploadJobToYoutube` / `uploadJobToTelegram` **without `await`**,
after already returning 200. A restart in that window silently drops the delivery — the
job can be stuck at `Rendered` forever with no retry and no record.

- **Studio:** durable delivery, recorded per-target outcome, no silent stalls (ADR-0016).

### K11 — In-memory, non-persistent, unbounded Telegram wizard state

`TelegrambotDataset` / `TelegrambotJobDataset` are plain `{}` singletons: lost on every
restart, not shared across instances (breaks horizontal scaling), no TTL (unbounded
growth).

- **Studio:** `TelegramWizardState` table + TTL sweep; stateless adapter (ADR-0014).

### K12 — No file cleanup anywhere

Original uploads, converted copies, per-job screenshots/thumbnails, Telegram-downloaded
media accumulate on disk forever. No cron, no TTL, no delete endpoint.

- **Studio:** Job Artifacts auto-purged per a retention policy; Gallery Assets deletable
  when safe; scheduled cleanup jobs ([../data/lifecycle-rules.md](../data/lifecycle-rules.md)).

### K13 — Failure reasons never surfaced

YouTube upload errors flip the job to `Error` but the _reason_ is only in server logs;
the worker got 200, the operator sees only "Error". Telegram send errors are fully
swallowed.

- **Studio:** `errorReason` stored on the Job and shown to the operator (in-app +
  Telegram) ([../architecture/data-flow.md](../architecture/data-flow.md) §5).

### K14 — `changeStateJob` accepts any integer

REST `@Body('state') state: number` with no bounds/enum check; out-of-range values are
saved as-is; the `switch` silently no-ops.

- **Studio:** validated against the state machine; invalid → `409` (ADR-0013).

### K15 — `File._createdBy` declared but never populated

Every File row has `_createdBy: undefined` despite the schema modeling it as required.

- **Studio:** `uploadedByUserId` actually set (null only for system-generated artifacts).

### K16 — Unhandled `CastError` on malformed ids

Malformed ObjectId strings passed to `findById` produce unhandled 500s instead of clean
400/404s.

- **Studio:** IDs validated for format at the boundary; typed `NotFoundError` otherwise.

### K17 — Duplicated `YoutubeapiService` provider wiring

`RenderModule` re-declares `YoutubeapiService` + its transitive deps instead of importing
the canonical module — ~20 other modules do the same, producing many independent
instances. A NestJS-specific anti-pattern.

- **Studio:** moot — Studio doesn't upload to YouTube at all (ADR-0041), so there is no
  such adapter to duplicate; DI duplication isn't a pattern that applies regardless
  (different framework).

### K18 — Sequential `find` + `countDocuments` on every list

List endpoints run the filter query twice back-to-back instead of in parallel — doubled
latency.

- **Studio:** parallelize count + page, or use keyset pagination; add proper indexes
  ([../data/database.md](../data/database.md) §3).

### K19 — Missing audit entry for retry

`addJob` / `editTemplate` / `cancelJob` emit `ADD_ACTIVITY_LOG`; `retryJob` does not.

- **Studio:** every privileged action audited, retry included
  ([../security/security.md](../security/security.md) §14).

## Low / cleanup

- **K20** — `disabled` templates still usable via the GraphQL `addJob` path (only the bot
  filtered them). **Studio:** enforced on every creation path.
- **K21** — Side-effecting `GET /jobs/fetch` (a GET that mutates state). **Studio:**
  claim is `POST`.
- **K22** — `File.size` decorated `@IsDate()` instead of `@IsNumber()`.
- **K23** — Dead duplicate file `telegrambot/event/add-activity-log.event.ts`.
- **K24** — Dead `excludeTags` logic in `processTags`.
- **K25** — `TemplateResolver` missing the class-level `@Auth()` that `JobResolver` /
  `FileResolver` have (functionally covered by `PermissionsGuard`, but inconsistent).
- **K26** — `getJobs` resolver param not decorated with `@ActiveUser()` → always
  `undefined`.
- **K27** — Screenshot hard-coded at `00:00:04.000` — black/failed frame for videos < 4s.
- **K28** — Zero automated tests across the entire module.
  **Studio:** use cases and the state machine are unit-tested; the Worker API and the
  claim race have integration tests ([../development/workflow.md](../development/workflow.md)).
