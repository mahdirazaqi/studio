# Compatibility Matrix

Behavior-by-behavior: what Studio keeps compatible, what it deliberately breaks, and why.

**Columns:**
- **Legacy behavior** — what the legacy render module does.
- **Studio behavior** — what Studio does.
- **Compat requirement** — must an external party (Render Worker, Telegram users,
  operators) still get the outcome they depend on?
- **Break?** — is this an intentional breaking change?
- **Reason**

---

## Worker REST API

| Legacy behavior | Studio behavior | Compat requirement | Break? | Reason |
|---|---|---|---|---|
| Endpoints unauthenticated | Service credential required on every endpoint | Worker must add a credential header | **YES (intentional)** | K1 — security. The one unavoidable Worker change. |
| Base path `/jobs/...`, `/files`, no version | `/api/worker/v1/jobs/...`, `/api/worker/v1/files` | Worker base-URL config update | **YES (intentional)** | Versioned external contract (ADR-0004). |
| `GET /jobs/fetch`, 404 when empty | `POST /jobs/next`, `204` when empty (a `GET` alias + `404` for empty is an OPEN DECISION for smoother compat) | Worker "get next job" call | Partial — **prefer** keeping a compatible response for the empty case | Side-effecting GET is wrong (K21); but minimize Worker churn. |
| `fetch` response fields: `id, output, title, composition, template, assets[]` with asset `{composition,layer,type,src,text}` | **Same field names**, values sourced from the Job snapshot; new fields may be added | Worker parses these fields | **NO** | Deliberate compatibility — keep the Worker's parser unchanged. |
| `fetch` non-atomic (double-claim possible) | Atomic claim | Worker expects one job per call | **NO** (improvement, invisible to Worker) | K3. |
| `PATCH /jobs/:id/state` accepts any integer 0–9 | Accepts legacy integers **and** Studio state names; maps + validates against the state machine; invalid transition → `409` | Worker sends numeric states (2/3/4 etc.) | **NO** for valid sequences; a Worker sending nonsense now gets `409` instead of silent success | K14 — correctness. |
| `PATCH /jobs/:id/progress` `{progress}` unvalidated | Same path, `{progress: 0..100}` validated | Worker reports progress | **NO** for valid values | Range check. |
| `PATCH /jobs/:id/duration` `{duration}` unvalidated | Same path, `{durationSeconds}` validated ≥ 0 (field rename is an OPEN DECISION — keep `duration` for compat?) | Worker reports duration | Minor — keep `duration` key if the Worker sends it | Avoid needless break. |
| `POST /jobs/:id/upload` multipart `.mp4`, returns `200`, then fire-and-forget delivery | `POST /jobs/:id/result` multipart, validated by content type + size, returns `202`, durable delivery | Worker uploads the file and expects success | Partial — success is still signalled; status code differs (`200`→`202`); path differs | ADR-0016, K10. Confirm the Worker doesn't hard-check `200`. |
| `POST /files` authenticated as a **user** (`FILE_ADD`) | `POST /api/worker/v1/files` authenticated as the **Worker** | Worker uploads input files | **YES (intentional)** | Worker is a machine principal, not a user (ADR-0004). |
| No idempotency on any endpoint | Progress/state/duration idempotent; result upload safe to retry | Worker retries on network failure | **NO** (improvement) | Robustness. |

## Job states & lifecycle

| Legacy behavior | Studio behavior | Compat requirement | Break? | Reason |
|---|---|---|---|---|
| 10 numeric states (2/3/6 rarely/never set by backend) | 8 named canonical states; legacy ints mapped at the API boundary | Worker + operators understand job progress | **NO** (mapping preserves meaning) | ADR-0013. |
| `Downloading`/`Started`/`InProgress` as distinct worker substates | Collapsed to `RENDERING` internally; API still accepts 2/3/4 | Worker sends these | **NO** at the API; internal UI shows less granularity | Simpler state map; OPEN DECISION to keep substates. |
| Terminal states: `Uploaded`, `Cancel`; `Rendered`+ blocks retry/cancel | `UPLOADED`, `CANCELED` terminal; cancel allowed only from `QUEUED/CLAIMED/RENDERING` | Operators expect the same "can't cancel a finished job" | **NO** | Same intent, now enforced. |
| Job deleted on retry | Job **never** deleted | Operators/reports rely on job history | **NO break for consumers** — pure improvement | ADR-0005, K4/K5. |

## Retry

| Legacy behavior | Studio behavior | Compat requirement | Break? | Reason |
|---|---|---|---|---|
| Retry deletes original, creates replacement | Retry creates a **new** Job, original kept, linked via `retryOfJobId` | Operator can retry a failed job | **NO break in the user-facing action**; the data model differs | ADR-0005. |
| Quota checked **after** delete | Cap checked **before** any write | Operator gets a clear "cap reached" and keeps their job | **NO break** — strictly better | K4. |
| Eligibility: non-terminal + < 3 days | Eligibility: `ERROR` (`CANCELED`? OPEN DECISION) + configurable window | Operator retries recent failures | Possible minor behavior change (window value) | [jobs.md](../domain/jobs.md) OPEN DECISION. |
| `retriedCount` increments | `attemptNumber` increments; full lineage chain | Operator sees "this was retried" | **NO** (richer) | K19. |
| No audit entry | Audited | — | **NO break** | K19. |

## Cancel

| Legacy behavior | Studio behavior | Compat requirement | Break? | Reason |
|---|---|---|---|---|
| Bulk cancel; terminal jobs silently skipped; returns the cancelled ones | Same; state machine enforces eligibility; skipped ids reported | Operator bulk-cancels | **NO** | Same behavior. |
| Cancel resets `progress`/`duration` to 0 | Records `canceledAt`/`canceledBy`; keeps progress history (OPEN DECISION — zero it for display?) | Operator sees a cancelled job | Minor display change | Historical integrity favors keeping data. |
| Telegram "Cancel All" cancels **every** job system-wide | Scoped to the user's Department + cancelable jobs | Telegram users cancel *their* pending jobs | **YES (intentional)** | K8 — this was a serious authorization bug, not a feature. |

## Templates

| Legacy behavior | Studio behavior | Compat requirement | Break? | Reason |
|---|---|---|---|---|
| No delete | Soft delete; row kept | Historical jobs resolve their template | **NO break** (new capability) | ADR-0006. |
| `disabled` honored only by the Telegram picker | `DISABLED`/`DELETED` enforced on **every** creation path | Operators can't create jobs from a disabled template | **YES (intentional)** — closes K20 | Consistency + correctness. |
| `name` globally unique | Unique per Department among non-deleted (OPEN DECISION) | Template lookup by name | Possible break if code assumed global uniqueness | ADR-0011. |
| Full-replace edit | Patch edit | Operators edit templates | **NO break** (easier) | UX. |
| Editing changes behavior of future jobs implicitly | Editing never touches existing jobs | Operators expect old jobs unchanged | **NO break** — improvement | ADR-0010. |
| `TemplateAsset.type` free text | Validated enum | Template authoring | Possible break for exotic legacy `type` values | Data quality. Map known values on import. |
| `imageRatio` exact-float check, Telegram only | Tolerance check, everywhere | Image uploads that were being wrongly rejected now pass | **NO break** (bug fix) | K6. |

## Files

| Legacy behavior | Studio behavior | Compat requirement | Break? | Reason |
|---|---|---|---|---|
| Global file visibility | Department-scoped | Operators browse the gallery | **YES (intentional)** | K7. |
| No cleanup, files kept forever | Job Artifacts auto-purged; Gallery Assets deletable when safe | Operators reuse gallery assets | **NO break** for gallery assets; job artifacts become transient | K12, ADR-0008. |
| Job asset = copied file path string | Snapshot metadata + FK | Rendered jobs point at the right file | **NO break** for the Worker (snapshot still yields a usable ref) | ADR-0010. |
| ffmpeg/convert transcode on upload | Normalization optional (OPEN DECISION); if done, safe `execFile` | Uploaded files usable by the Worker | Possibly **NO transcode** if deemed unnecessary | Legacy intent unclear; K2 security. |

## Telegram

| Legacy behavior | Studio behavior | Compat requirement | Break? | Reason |
|---|---|---|---|---|
| Phone-link identity, no OTP | Same | Telegram users authenticate by phone | **NO** | Preserved. |
| In-memory wizard state | Durable `TelegramWizardState` | Users complete multi-step flows | **NO break** — more reliable | ADR-0014, K11. |
| Single Track flow | Preserved | Users create one job | **NO** | Preserved. |
| Album flow (1 conversation → N jobs) | Preserved (grouping entity = OPEN DECISION) | Users create album jobs | **NO** | Preserved. |
| No permission checks | Full authorization | Users do only what their role allows | **YES (intentional)** | K8. |
| Notifications on Rendered/Uploaded/Error (inconsistent channels) | Consistent: in-app + Telegram DM on all three, with reason on Error | Users get notified | **NO break** — more consistent | K13. |

## YouTube

| Legacy behavior | Studio behavior | Compat requirement | Break? | Reason |
|---|---|---|---|---|
| Upload iff `job.upload && template._channel` | Upload iff `job.deliverToYouTube && template.youtubeTargetId` | Operators publish renders | **NO break** (renamed, same logic) | [youtube.md](../integrations/youtube.md). |
| Privacy hard-coded `private` | Default `private` (config = OPEN DECISION) | Published videos are private by default | **NO break** with the default | Safe default kept. |
| Global daily cap = 3 | Per-target cap, configurable (OPEN DECISION) | Operators hit a quota limit gracefully | Possible behavior change (scope/value) | [jobs.md](../domain/jobs.md). |
| Fire-and-forget upload after 200 | Durable, recorded outcome, surfaced errors | Operators know if publishing failed | **NO break** — improvement | ADR-0016, K13. |
| Thumbnail from ffmpeg screenshot at t=4s | Screenshot timestamp chosen safely (e.g. min(4s, duration/2)) | Videos get a thumbnail | **NO break** — fixes K27 | Correctness. |

## Notifications & audit

| Legacy behavior | Studio behavior | Compat requirement | Break? | Reason |
|---|---|---|---|---|
| `SEND_SYSTEM_MESSAGE` only on `Rendered` | In-app notification on `RENDERED`, `UPLOADED`, `ERROR` | Operators get in-app updates | **NO break** — more coverage | Consistency. |
| Activity log on add/edit/cancel, not retry | Audit on all privileged actions | — | **NO break** | K19. |
