# OPEN DECISION Register

Every design question intentionally left unresolved in Phase 0. **Do not invent an
answer.** When one blocks implementation, raise it with the product owner. Each entry
lists the options and the consequence of each so whoever decides has what they need.

Status: all **OPEN** unless noted. ID format `OD-nn`.

---

## Domain / business rules

### OD-01 — Upload cap model
*Where:* [../domain/jobs.md](../domain/jobs.md), [../integrations/youtube.md](../integrations/youtube.md).
Legacy: hard-coded **global** cap of **3 per UTC day**, all users.
Decide: (a) value, (b) scope — global / per-Department / per-YouTube-target, (c) window,
(d) configurable?, (e) behavior when exceeded — reject at creation (legacy) vs queue-and-defer.
- *Global:* simplest, protects one shared API quota; one department can starve others.
- *Per-target:* matches how the YouTube Data API quota is actually structured; fairer;
  more configuration.
**Recommendation:** per-YouTube-target daily cap, configurable, reject at creation with a
clear message — pending confirmation of the real YouTube quota structure.

### OD-02 — Retry eligibility window
*Where:* [../domain/jobs.md](../domain/jobs.md).
Legacy: 3 days from creation; only non-terminal jobs.
Decide the window length, whether it's configurable, and whether `CANCELED` jobs are
retryable (in addition to `ERROR`).
- *Keep a short window:* bounds queue churn; avoids retrying jobs whose input files were
  already purged.
- *No window:* operators can always retry old failures; risk of failed renders on purged
  inputs.
**Recommendation:** keep a window, default 3–7 days, configurable; retry from `ERROR`
(and `CANCELED`? — confirm).

### OD-03 — "Own resource" vs "department resource" scope for USER
*Where:* [../domain/authorization.md](../domain/authorization.md).
For cancel / retry / delete-own-file, is a plain USER limited to resources they created
or any in their department?
- *Own only:* least privilege; awkward when a colleague is away.
- *Whole department:* collaborative; matches MANAGER; simpler.
**Recommendation:** whole department for view; confirm for cancel/retry; MANAGER+ for
destructive file ops.

### OD-04 — Can a USER author/edit Templates?
*Where:* [../domain/authorization.md](../domain/authorization.md), [../domain/templates.md](../domain/templates.md).
- *USER can author:* faster for small teams; a bad template affects the whole department.
- *MANAGER+ only:* safer, clearer ownership; matches the brief's "MANAGER manages
  templates".
**Recommendation (leaning):** USER consumes, MANAGER authors — confirm.

### OD-05 — Can a MANAGER create/promote another MANAGER?
*Where:* [../domain/users.md](../domain/users.md).
- *Yes:* full delegation; privilege sprawl risk.
- *No:* only ADMIN mints managers; tighter, more admin load.

### OD-06 — Ambiguous / no phone match on Telegram link
*Where:* [../domain/users.md](../domain/users.md), [../integrations/telegram.md](../integrations/telegram.md).
Options: reject with a generic message (legacy); admin links manually; invite/claim token
flow.

### OD-07 — Department deletion policy
*Where:* [../domain/departments.md](../domain/departments.md).
Jobs are never deleted, so a Department with history can't be cleanly removed.
- *Soft-deactivate (`ARCHIVED`) only:* safe, no data loss, history stays queryable by
  ADMIN. **Recommended.**
- *Hard delete with reassignment:* needs cross-department move; high complexity.
- *Hard delete with cascade:* violates ADR-0005/0007 — not acceptable.

### OD-08 — Cross-department resource move / reassignment
*Where:* [../domain/departments.md](../domain/departments.md).
- *Not supported:* simplest, no historical ambiguity.
- *ADMIN can reassign:* useful for reorgs; complicates historical reporting; would need
  auditing and arguably snapshotting the department on the Job.

### OD-09 — Template `name` uniqueness scope
*Where:* [../domain/templates.md](../domain/templates.md).
Global / per-Department / per-Department among non-deleted.
**Recommendation:** unique per Department among non-deleted rows.

### OD-10 — Zero-asset templates allowed?
*Where:* [../domain/templates.md](../domain/templates.md).
- *Allow:* supports fully static renders.
- *Forbid:* simpler Job creation.

### OD-11 — Template-level asset defaults
*Where:* [../domain/files.md](../domain/files.md), [../domain/templates.md](../domain/templates.md).
Does a Template store default File references / default text per slot? Convenience vs
extra complexity in creation + historical integrity.

### OD-12 — Album grouping entity
*Where:* [../integrations/telegram.md](../integrations/telegram.md), [../architecture/data-flow.md](../architecture/data-flow.md).
The Telegram "Album" flow creates N Jobs. Do they share an `albumGroupId` / a parent
`AlbumJob` entity, or are they just independent Jobs?
- *Grouping entity:* nicer UI (see an album as a unit), progress rollup.
- *Independent:* less schema; matches legacy (which just made N jobs).

### OD-13 — Delivery-only retry
*Where:* [../integrations/youtube.md](../integrations/youtube.md).
If YouTube/Telegram delivery fails but the render output exists, is there a "retry
delivery only" action, or is the only path retry = new Job (re-render)?
- *Delivery-only retry:* avoids a wasteful re-render.
- *Only re-render retry:* one code path; but re-renders unnecessarily.

### OD-14 — Aspect-ratio tolerance value
*Where:* [../domain/templates.md](../domain/templates.md).
Exact epsilon for "close enough" (e.g. ±1%, ±2%).

### OD-15 — `deliverToTelegram` default
*Where:* [../domain/jobs.md](../domain/jobs.md).
Default on (DM the creator the file if they're linked) or opt-in?

---

## Data / lifecycle

### OD-16 — Job snapshot storage form
*Where:* [../data/historical-integrity.md](../data/historical-integrity.md), [../data/database.md](../data/database.md).
JSONB column vs dedicated 1:1 table vs denormalized columns + JSON.
**Recommendation:** JSONB `snapshot` + a few denormalized indexable columns.

### OD-17 — Copy media bytes into the snapshot for critical inputs?
*Where:* [../data/historical-integrity.md](../data/historical-integrity.md).
- *Copy bytes:* true immutability, re-render always possible; storage multiplies,
  undermines File hard-deletion savings.
- *Metadata only:* cheap; old Jobs show "media no longer stored", can't re-render.
**Recommendation:** metadata only by default; optional per-Job "archive/pin bytes".

### OD-18 — Job Artifact retention specifics
*Where:* [../data/lifecycle-rules.md](../data/lifecycle-rules.md), [../domain/files.md](../domain/files.md).
When exactly is the rendered video purged (immediately on `UPLOADED` / after N days /
after successful delivery + grace)? Keep screenshot+thumbnail longer? Grace period for
`ERROR`/`CANCELED` jobs' artifacts?
**Recommendation:** purge video after successful required delivery + 7-day grace; keep
screenshot + thumbnail 90 days; all configurable.

### OD-19 — One-off Telegram/upload inputs: artifact or promotable?
*Where:* [../data/lifecycle-rules.md](../data/lifecycle-rules.md).
**Recommendation:** default `JOB_ARTIFACT`, explicit "save to gallery" action.

### OD-20 — File dedup mechanism & scope
*Where:* [../domain/files.md](../domain/files.md).
Content-hash hard dedup (return existing) vs advisory ("similar file exists") vs none.
**Recommendation:** content-hash advisory + opt-in reuse; hard dedup later.

### OD-21 — Allowed file types & size limits
*Where:* [../domain/files.md](../domain/files.md), [../security/security.md](../security/security.md).
Legacy allowed `jpg/jpeg/png/webp/mp4/mp3` general, `.mp4` only for results. Confirm the
Studio allow-list and per-kind max sizes.

### OD-22 — Assets & outcomes: child rows vs JSONB
*Where:* [../data/database.md](../data/database.md).
Template asset slots / resolved Job assets / delivery outcomes — tables or JSON?
**Recommendation:** Template assets = child rows; Job snapshot = JSONB; delivery outcomes
= child rows or JSONB.

### OD-23 — Audit entry retention
*Where:* [../security/security.md](../security/security.md).
Kept forever, or a retention window (e.g. 2 years)?

### OD-24 — Legacy Mongo data import
*Where:* [../data/database.md](../data/database.md).
Import historical templates/jobs/files, or start clean and keep legacy read-only?
**Recommendation:** out of scope unless a requirement says otherwise.

### OD-25 — Job storage growth at scale (archival/partitioning)
*Where:* [../data/lifecycle-rules.md](../data/lifecycle-rules.md).
Jobs are never deleted. Time-based partitioning / cold storage strategy — later concern,
must preserve full readability, never a deletion.

### OD-26 — Cancelled job: zero out progress/duration for display?
*Where:* [../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).
Legacy reset them to 0. Historical integrity favors keeping the values.

---

## Integrations / infrastructure

### OD-27 — Worker authentication mechanism
*Where:* [../integrations/worker-api.md](../integrations/worker-api.md), ADR-0004.
Static API key (Bearer) / HMAC-signed requests / mTLS / short-lived token.
**Recommendation:** hashed static API key as a Bearer token + documented rotation;
revisit HMAC/mTLS if the Worker runs outside a trusted network.

### OD-28 — Worker API versioning scheme
*Where:* [../architecture/boundaries.md](../architecture/boundaries.md), [../integrations/worker-api.md](../integrations/worker-api.md).
Path prefix (`/api/worker/v1`) vs version header.

### OD-29 — Worker claim endpoint: keep `GET`/`404` compatibility?
*Where:* [../integrations/worker-api.md](../integrations/worker-api.md), [../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).
Studio prefers `POST /jobs/next` + `204` when empty. Does the current Worker hard-depend
on `GET /jobs/fetch` + `404`? If unknown, support both until the Worker is updated.

### OD-30 — Worker may read only its claimed jobs?
*Where:* [../integrations/worker-api.md](../integrations/worker-api.md).
Restrict `GET /jobs/:id` to jobs the Worker principal has claimed, or allow any.

### OD-31 — Worker timeout / stuck-job recovery
*Where:* [../domain/jobs.md](../domain/jobs.md), [../data/lifecycle-rules.md](../data/lifecycle-rules.md).
A job stuck in `CLAIMED`/`RENDERING` past a timeout → requeue to `QUEUED` or fail to
`ERROR`? Timeout length?

### OD-32 — Internal state substates from the Worker
*Where:* [../domain/jobs.md](../domain/jobs.md).
Keep `RENDERING` as one internal state, or track downloading/started/in-progress
substates for UI detail. (The Worker API accepts legacy ints regardless.)

### OD-33 — Duration field name on the Worker API
*Where:* [../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).
Keep legacy `{ duration }` key or rename to `{ durationSeconds }`.

### OD-34 — Telegram: webhook vs long-polling
*Where:* [../integrations/telegram.md](../integrations/telegram.md).
**Recommendation:** webhook (fits the single-deployable model), with Telegram's secret
token verified per request.

### OD-35 — Telegram wizard TTL length
*Where:* [../data/lifecycle-rules.md](../data/lifecycle-rules.md), [../integrations/telegram.md](../integrations/telegram.md).
e.g. 1 hour vs 24 hours.

### OD-36 — YouTubeTarget scoping
*Where:* [../integrations/youtube.md](../integrations/youtube.md).
Department-scoped vs global (ADMIN-managed).
**Recommendation:** department-scoped, ADMIN may also manage all.

### OD-37 — YouTube video privacy / metadata configurability
*Where:* [../integrations/youtube.md](../integrations/youtube.md).
Keep hard-coded `private`, or expose privacy/scheduling/category per Template or Job.
**Recommendation:** default `private`, allow `unlisted`/`public` at Template level; defer
scheduling.

### OD-38 — Media processing location
*Where:* [../architecture/tech-stack.md](../architecture/tech-stack.md).
Screenshot/thumbnail generation (and any input normalization) in-process, in a queue
worker, or delegated to the Render Worker.

### OD-39 — Is input normalization (legacy ffmpeg/convert) needed at all?
*Where:* [../domain/files.md](../domain/files.md).
Legacy transcoded on upload; the `convert` step looked like a no-op and its intent is
unknown. Confirm whether Studio needs any on-upload processing.

### OD-40 — Background-work / durable-job mechanism
*Where:* ADR-0016, [../architecture/data-flow.md](../architecture/data-flow.md), [../data/lifecycle-rules.md](../data/lifecycle-rules.md).
Transactional outbox + poller / a real queue (BullMQ, pg-boss, …) / scheduled tasks.
Needed for: durable delivery, artifact cleanup, wizard TTL sweep, stuck-job recovery.

### OD-41 — Rate-limiting layer
*Where:* [../security/security.md](../security/security.md).
Edge middleware / a limiter library / infra (reverse proxy, API gateway).

### OD-42 — Object storage backend
*Where:* [../architecture/tech-stack.md](../architecture/tech-stack.md).
Local disk behind a volume / S3-compatible object storage / other. Access only via
`server/adapters/storage`.

### OD-43 — Session / auth library
*Where:* [../architecture/tech-stack.md](../architecture/tech-stack.md), [../domain/users.md](../domain/users.md).
Concrete session mechanism for human login.

---

## Process / tooling

### OD-44 — Package manager
Pin one (npm / pnpm / yarn / bun) and commit the lockfile.

### OD-45 — Prisma table/column naming
Keep Prisma defaults or `@@map` to snake_case.

### OD-46 — Personal-data erasure (GDPR-style)
*Where:* ADR-0007, [../security/security.md](../security/security.md).
Users are never deleted. If legal erasure is ever required, design deliberate
anonymization (not row deletion).
