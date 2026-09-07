# Telegram Bot Integration

**Implemented, Phase 8.** The Telegram bot is an **alternative front-end** for creating and
monitoring Jobs. It is **not** a privileged bypass — Telegram users are real `User`s and
get the **same authorization and department scoping** as the web UI. See ADR-0035/0036/
0037/0038 for the decisions behind this page.

## 1. Legacy behavior (reference only) `LEGACY`

From `qtical-backend-node/src/render/telegrambot` (see
[../legacy/render-module-analysis.md](../legacy/render-module-analysis.md) §2, §7, §19).

- Built with `nestjs-telegraf`. Active only when `ENABLE_TELEGRAM=true`.
- **Auth:** a global guard resolved the Telegram numeric user id → `User` by matching a
  `telegramId` field, which was set via a `/start` → "share contact" (phone) flow. If no
  match, handlers replied "authenticate with phone".
- **No permission checks at all** on the bot surface — any linked user could create,
  retry, and **cancel every non-terminal job in the entire system** (`cancelAllJobs` had
  no owner filter).
- **Wizard state in process memory:** `TelegrambotDataset` / `TelegrambotJobDataset` were
  plain `{}` singletons. Consequences: lost on every restart/deploy; not shared across
  instances (horizontal scaling broke it); grew unbounded (no TTL).
- **Flows:**
  - **Single Track** (`🆕`): pick an enabled template → (if template has a `_channel`,
    ask "upload to YouTube? Yes/No") → the bot asks for each asset slot, one message at a
    time (text / photo / audio / video) → validates image aspect ratio (buggy exact-float
    check) → when all slots filled, creates one Job.
  - **Album** (`💿`): pick template → asks "Track Count" → dynamically expands the asset
    list into `Audio N` / `Song N` pairs (a schema-less hack, since legacy's Job assets
    were an untyped map) → **creates one Job per track** (sequential `addJob` calls, no
    error handling between them — the first exception aborted every remaining call).
  - **List of Jobs** (`📁`): last 10 jobs; tap one → details + Retry / Cancel buttons.
  - **Cancel All Jobs** (`🔴`): cancels every non-terminal job system-wide.
- Callback routing keyed on **emoji prefixes** in `callback_data` (`🔹` details, `🔁`
  retry, `🚫` cancel, `📜` single-template, `📃` album-template) — tight coupling between
  UI copy and dispatch.
- File inputs: the bot downloaded the Telegram file URL to disk (uuid name), guessed
  mimetype from the URL extension, then passed it to `FileService.uploadFile` — could
  produce corrupt `File` records.
- Outbound notifications: `JobService` built its **own** `Telegraf` client to DM job
  creators on `Rendered` / `Uploaded` / `Error`; all failures swallowed (logged only).

## 2. Studio design (implemented)

### Transport — webhook (ADR-0035, resolves OD-34)

```
Telegram → POST /api/telegram/webhook → authenticate (secret token)
         → telegramComposer.handleUpdate → use cases → outbound reply
```

- `src/app/api/telegram/webhook/route.ts` — a thin `defineRouteHandler`, the same shape
  every other external entry point uses. Authentication is Telegram's own webhook secret
  mechanism (`@/server/telegram-webhook-auth`, see "Webhook security" below).
- No polling worker process — webhook fits Studio's single-Next.js-deployable model with
  no extra process to run or coordinate.
- **Optional feature.** `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET` are both optional
  environment variables (unlike Worker authentication, which is always mandatory — a
  `WorkerApiKey` must exist and be `ACTIVE`, ADR-0040). Unset → the webhook route
  responds `dependency` (503) and every outbound send is a logged no-op — Studio runs
  fully without Telegram configured.
- **Library:** `telegraf` (matches legacy's choice, via `nestjs-telegraf`). A single
  instance per process (`@/server/adapters/telegram/client.ts`'s `getTelegramBot()`),
  cached on `globalThis` to survive Next.js dev-mode reloads without constructing (or
  re-registering handlers on) a second client — `features/telegram/bot/register.ts`'s
  `getRegisteredTelegramBot()` attaches the composer exactly once.

### Layering

```
Telegram → webhook Route Handler (authenticate the secret token)
         → Telegram Adapter (features/telegram/bot/composer.ts)
             • identify: ctx.from.id (never username/first_name/callback data)
             • resolve identity: telegramUserId → Actor (+ department + role)
             • load / advance the durable WIZARD STATE row
             • translate the update into ONE use-case call
             • format the reply
         → Use Cases (createJob, retryJob, cancelJob, listDepartmentJobs, ...)
```

- **The adapter contains no business logic.** `composer.ts` maps Telegram updates to
  use-case calls and renders results as Telegram messages/keyboards — nothing in it
  decides authorization, Template/Job state, or validation; every one of those checks
  happens inside the use case it calls, identically to a dashboard Server Action calling
  the same use case (Phase 8 brief §66 — one Job/Template/File domain, multiple entry
  points).
- **The adapter holds no in-memory conversation state** (ADR-0014, ADR-0037).
- **Cross-feature use-case imports are expected here, not an exception**: the Telegram
  composer/use-cases import directly from `features/jobs/use-cases`,
  `features/templates/use-cases`, and `features/files/use-cases` — this is the whole
  point of the design (a second entry point onto the same application services), not the
  general "features may import each other" pattern documented for narrow read-only
  lookups elsewhere (`docs/architecture/project-structure.md` §3).

### Durable wizard state (ADR-0014, ADR-0037)

`TelegramWizardState` table:

| Field                    | Notes                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `telegramUserId`         | `@unique`. The stable Telegram numeric user id.                                                                                                                                                   |
| `userId`                 | `@unique`. The linked Studio User — at most one active conversation per User.                                                                                                                     |
| `flow`                   | `SINGLE_TRACK` \| `ALBUM`.                                                                                                                                                                        |
| `step`                   | `PICK_TEMPLATE` \| `ASK_DELIVERY` \| `ASK_TRACK_COUNT` \| `COLLECT_ASSETS` \| `CONFIRM` \| `CREATING` \| `COMPLETED`.                                                                             |
| `payload`                | JSONB, validated on every read/write (`wizardPayloadSchema`): chosen template id + name, a snapshot of its slots, delivery choice, track count, and the asset values collected so far, per track. |
| `lastUpdateId`           | The most recently processed Telegram `update_id` — defense-in-depth against a duplicate webhook delivery.                                                                                         |
| `createdAt`, `updatedAt` | `updatedAt` drives lazy TTL expiration.                                                                                                                                                           |

- Every inbound message/callback loads the row (or starts a fresh one), advances it, saves
  it. Nothing is remembered between requests except through this row.
- **Expiration is lazy, not swept** (resolves OD-35): a row untouched for longer than
  `TELEGRAM_WIZARD_TTL_MINUTES` (default 60) is deleted the next time it's read and
  treated as "no active conversation" — no scheduled sweep process exists (OD-40 is still
  open). A corrupted payload (fails schema validation) is handled identically: logged and
  cleared, never a crash.
- **Every step change is one atomic conditional `UPDATE ... WHERE step IN (fromSteps)`**
  (`advanceWizardState`) — the same primitive `job-repository.ts` uses for `Job.state`
  (ADR-0029). This is what makes a duplicate/racing Telegram update safe: the loser's
  update matches zero rows and is treated as "already handled," never silently reapplied.
  The `CONFIRM → CREATING` transition specifically is the duplicate-Job-creation guard —
  see "Job creation confirmation" below.
- Restart / scale-out / load-balancing no longer lose progress (ADR-0014's original goal,
  now real).

### Authorization

- The Telegram user resolves to a `User` via `resolveTelegramIdentity`; **all**
  [authorization.md](../domain/authorization.md) rules apply identically to the web UI:
  - role `USER` cannot do MANAGER things (there is nothing MANAGER-only reachable from
    Telegram in this phase — Template authoring isn't exposed here either);
  - department scoping applies — a Telegram user sees/acts only in their own Department
    (ADMIN: all, though ADMIN's Telegram uploads still always land in ADMIN's _own_ home
    department — there is no Telegram surface for authoring into another department);
  - **"Cancel All"** cancels only Jobs the user is authorized to cancel **within their
    department** (never system-wide — the direct fix for legacy's real security bug, see
    §11 of the Phase 8 brief and `features/telegram/use-cases/cancel-all-jobs-for-telegram.ts`).
- An unlinked Telegram user, or one linked to a since-`DISABLED` User, is refused and
  shown the linking prompt — `resolveTelegramIdentity` only ever returns an `Actor` for an
  `ACTIVE` User (mirrors `@/server/auth/session`'s identical filter).
- **No `telegramCanCreateJob()`-style adapter-level permission function exists.** Every
  handler calls the exact same `authorize()`-gated use case a dashboard Server Action
  would call — there is no separate Telegram permission surface to audit or drift from the
  real one.

### Identity linking (ADR-0036)

- `/start` → prompt to share contact (Telegram's native "share phone number" button,
  `request_contact: true`) → `normalizePhone` (digits-only) the shared number → match
  against `User.phone` (unique — see below) → on match, set `User.telegramUserId`.
- **A self-shared contact only.** Telegram sets `contact.user_id` to the sender's own
  numeric id when _they_ tapped the share-contact button; a forwarded contact card either
  omits it or carries someone else's id. The composer checks this before attempting a
  match, so forwarding a colleague's contact card can never link _their_ phone to _your_
  Telegram account.
- **OD-06 resolved:** `User.phone` is `@unique`, so an ambiguous match cannot occur by
  construction. The only real outcome besides a match is "no match" — one generic, safe
  message, never distinguishing "no such phone" from "that phone belongs to a disabled
  account" (an existence-leak precaution, the same reasoning
  [authorization.md](../domain/authorization.md) applies to resource lookups).
- **Setting `User.phone` in the first place is Users-feature scope, not Telegram-feature
  scope** (see ADR-0036) — there is no self-service or admin UI for it yet, matching
  Phase 3's "no user-management UI" status. Locally, `prisma db seed`'s optional
  `SEED_ADMIN_PHONE` sets it on the seeded ADMIN for testing.

### Flows (implemented)

| Flow             | Studio behavior                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single Track** | Pick an `ACTIVE`, non-deleted template in the user's department (`getTemplateForJobForm`, the _same_ use case the dashboard's Job form calls) → ask "deliver to YouTube?" → collect a value for every Template slot, one message at a time → confirm → `createJob` (one job).                                                                                                                                                                   |
| **Album**        | Pick template → ask track count (1–20) → repeat Single Track's **exact same per-slot collection loop**, once per track (`advanceTrackCursor`) → confirm (shows the total job count) → `createJob` once per track, sequentially. No `albumGroupId` grouping entity (resolves OD-12: independent Jobs, matching legacy's actual N-`addJob` outcome). Never asks the delivery question (legacy behavior, kept — always `deliverToYouTube: false`). |
| **List Jobs**    | `listDepartmentJobs` (unmodified, the same use case the dashboard list page calls), last 10, department-scoped; tap for detail; Retry / Cancel buttons call the same authorized use cases (`getJob`/`retryJob`/`cancelJob`).                                                                                                                                                                                                                    |
| **Cancel All**   | `cancelAllJobsForTelegram` loops the unmodified single-Job `cancelJob` use case over every `QUEUED`/`CLAIMED`/`RENDERING` Job in the actor's own department (up to 100 per state per run) — **not** a new Jobs-feature bulk-cancel capability, just Telegram composing the existing one N times.                                                                                                                                                |

**Not implemented, deliberately:** Template authoring/editing via Telegram (legacy never
had this either — Templates were always managed elsewhere), aspect-ratio validation (see
"File inputs" below), `deliverToTelegram` (still no such Job field — see
[../domain/jobs.md](../domain/jobs.md) "Not present, deliberately").

### File inputs from Telegram (ADR-0038)

- The adapter downloads the Telegram file via the Bot API's own file link
  (`ctx.telegram.getFileLink` + a plain `fetch`), then hands the raw bytes to the
  **unmodified** `features/files/use-cases/upload-file.ts` — the exact same use case the
  Gallery's own upload form calls. Content type is sniffed from the bytes; a
  Telegram-declared media type or a URL-extension guess is never trusted (legacy's actual
  defect — mimetype-guessed-from-URL, "could produce corrupt File records" — is not
  reproduced).
- **A Telegram-collected file becomes an ordinary `GALLERY_ASSET`**, not a distinct
  temporary category — there is no "save to gallery" promotion step because there is no
  separate temporary state to promote from (resolves OD-19's Telegram-input half; see
  ADR-0038). No abandoned-upload cleanup is needed for the same reason: an unused
  Telegram-collected File is exactly as reusable/deletable as any other Gallery asset a
  web user never used in a Job.
- Supported media types match the Template's own declared slot kinds exactly — `IMAGE`
  (photo or a document whose sniffed bytes are an image), `AUDIO`, `VIDEO`. A `DATA` slot
  only accepts a plain text message.
- **Aspect-ratio validation is not implemented**, matching the dashboard exactly — OD-14
  (the tolerance value) is still open, and no feature validates a Template slot's
  `imageRatio` against an uploaded image's actual dimensions yet
  ([../domain/jobs.md](../domain/jobs.md) "Aspect-ratio validation is not implemented").
  Building a Telegram-only check here would give Job creation two different validation
  behaviors depending on entry point (forbidden by Phase 8 brief §66); legacy's own check
  used exact float equality, a known bug, not reproduced regardless.

### Job creation confirmation & idempotency (ADR-0037)

- Once every slot of every track is filled, the bot shows a summary (template name, job
  count, delivery choice) with Confirm/Cancel buttons — a step legacy didn't have (it
  auto-created the Job the instant the last asset arrived); added because the brief
  explicitly asks for one before a batch of Jobs is created (§50).
- **Duplicate-confirmation protection**: confirming atomically advances the wizard row
  `CONFIRM → CREATING` via the same conditional-update primitive `Job.state` uses. Only
  the caller that wins this specific race actually calls `createJob`; a second,
  near-simultaneous tap (a genuine double-click, or a duplicate webhook delivery) finds
  the row already past `CONFIRM` and gets "this is already being processed," never a
  second batch of Jobs.
- **Partial-failure reporting**: Jobs are created sequentially; the loop stops at the
  first failure (matching legacy's actual behavior) and the reply states exactly how many
  succeeded before the error, never claiming full success when it wasn't — no distributed
  transaction was built (Phase 8 brief §26).
- The wizard row is deleted once this resolves (success or partial failure) — there is no
  partial-resume design; a failure past this point means starting over from the menu.

### Outbound Job-lifecycle notifications — not implemented, deliberately

Legacy DM'd the Job's creator on `Rendered`/`Uploaded`/`Error`, with all delivery failures
silently swallowed (logged only) — a real defect Phase 8 brief §31/§32 explicitly warns
against reproducing. Studio does **not** implement this yet, for a structural reason
rather than an oversight: nothing currently drives a Job into `RENDERED`/`DELIVERING`/
`UPLOADED` in the first place (no real Worker/render pipeline is running against this
codebase yet — see [../domain/jobs.md](../domain/jobs.md) "Completion & delivery — still
not implemented"), and there is no durable delivery mechanism (OD-40 is still open) to
hand a notification attempt to even if there were a trigger. Building notification
delivery now would be unreachable code with no real caller. When a durable-work mechanism
lands (OD-40) and a real completion/delivery pipeline exists, a notification adapter
should be a consumer of that same mechanism — never a fire-and-forget call from inside
`transitionJob` itself (ADR-0016's existing "delivery is durable, not fire-and-forget"
decision already covers this).

### Callback routing (Phase 8 brief §19)

- Short, stable action codes (`features/telegram/domain/callback-data.ts`) —
  `tpl:s:<id>` / `tpl:a:<id>` (pick template), `dlv:y` / `dlv:n` (delivery choice),
  `cfm:y` / `cfm:n` (confirm), `job:d:<id>` / `job:r:<id>` / `job:c:<id>` (job detail/
  retry/cancel) — never coupled to button text or emoji (legacy's actual flaw: renaming a
  button broke `@Action` regex dispatch).
- **Every decoded id is re-validated server-side, every time** — a callback naming a
  Template or Job id is only ever acted on after the use case it reaches re-resolves that
  id through the actor's own department scope (`getTemplateForJobForm`, `getJob`,
  `retryJob`, `cancelJob` all already do this for every caller, not specially for
  Telegram). A stale button (the Template was disabled/deleted after the button was sent)
  or a hand-crafted id naming another department's resource is rejected with a normal
  error reply — verified end-to-end: a tampered `tpl:s:<other-department-template-id>`
  callback is refused and starts no wizard row.

## 3. Webhook security

- Telegram's own supported mechanism: a `secret_token` configured on `setWebhook`, echoed
  back on every request as the `X-Telegram-Bot-Api-Secret-Token` header
  (`TELEGRAM_WEBHOOK_SECRET`). `@/server/telegram-webhook-auth`'s
  `authenticateTelegramWebhook` is the **sole** place this is read or compared — a
  timing-safe SHA-256-digest comparison, the same fixed-length-digest-comparison
  technique `@/server/worker-auth` uses for its own credential (now a hashed
  `WorkerApiKey` lookup, ADR-0040).
- Not relying on the webhook URL's obscurity — the secret header is the actual control.
- Missing/wrong secret → `401 unauthenticated`. Telegram not configured at all
  (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET` unset) → `503 dependency`, a distinct
  failure mode so "Telegram is disabled here" is never confused with "someone sent a bad
  secret" in logs.
- **Local development / setup**: `TELEGRAM_BOT_TOKEN` from @BotFather;
  `TELEGRAM_WEBHOOK_SECRET` any long random value (`openssl rand -hex 32`); call
  Telegram's `setWebhook` with `url: https://<your-domain>/api/telegram/webhook` and
  `secret_token: <the same value>`. There is no local-polling fallback for development —
  a real HTTPS-reachable URL (e.g. a tunnel) is needed to receive webhook calls locally.

## 4. Improvements over legacy (summary)

| Legacy                                                        | Studio                                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| No permission enforcement on the bot surface                  | Full role + department authorization, identical to the dashboard, on every use case                                                     |
| "Cancel All" = system-wide                                    | Scoped to the actor's own department + cancelable-state jobs only                                                                       |
| In-memory wizard state (`{}` singletons)                      | Durable `TelegramWizardState` table, lazily TTL'd, atomic-conditional-update safe                                                       |
| Not horizontally scalable                                     | Stateless adapter, webhook-friendly, safe across multiple instances                                                                     |
| Emoji-coupled callback dispatch                               | Stable, short action codes, re-validated server-side on every use                                                                       |
| Album: schema-less asset-map splicing                         | The same typed, validated per-slot collection loop as Single Track, repeated per track                                                  |
| File inputs: URL-extension MIME guess, could corrupt records  | Real content-type sniffing via the unmodified File upload use case                                                                      |
| No confirmation step; a duplicate message could double-submit | Explicit Confirm step; atomic conditional update prevents a duplicate confirm from double-creating                                      |
| Swallowed notification errors (when notifications existed)    | Notifications not implemented yet (no trigger point exists); when built, must use a durable mechanism (ADR-0016), never fire-and-forget |

## 5. What's next (explicitly out of scope this phase)

- Outbound Job-lifecycle notifications (see above) — needs OD-40 (durable-work mechanism)
  and a real render/delivery pipeline first.
- `deliverToTelegram` as a Job option (needs the notification mechanism above to mean
  anything).
- Self-service phone linking/editing UI (Users-feature scope, not built yet).
- Any Template authoring/management surface via Telegram.
