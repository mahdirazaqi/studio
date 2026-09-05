# Telegram Bot Integration

The Telegram bot is an **alternative front-end** for creating and monitoring Jobs. It is
**not** a privileged bypass — Telegram users are real `User`s and get the **same
authorization and department scoping** as the web UI.

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
    list into `Audio N` / `Song N` pairs → **creates one Job per track** (sequential
    `addJob` calls).
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

## 2. Studio design

### Transport

> **`OPEN DECISION` — webhook vs long-polling.**
>
> - **Webhook:** Telegram → `POST /api/worker/... ` style Route Handler under
>   `app/api/telegram/webhook`. Stateless, scales with the app, no extra process. Needs a
>   public HTTPS URL + a Telegram secret token on the webhook.
> - **Long-polling:** a separate Node process/worker calls `getUpdates`. Simpler locally,
>   but it is a second deployable and needs single-consumer coordination.
>   _Consequence:_ webhook fits the "single Next.js deployable" model better. Recommended:
>   **webhook**, with the Telegram-provided secret token verified on every request.

### Layering

```
Telegram → (webhook Route Handler | polling worker)
         → Telegram Adapter  (features/telegram)
             • verify Telegram secret / update authenticity
             • resolve identity: telegramUserId → User (+ department + role)
             • load / update the durable WIZARD STATE row
             • translate the update into ONE use-case call
         → Use Cases  (createJob, retryJob, cancelJobs, listJobs, ...)
```

- **The adapter contains no business logic.** It maps Telegram updates to use-case calls
  and renders use-case results as Telegram messages.
- **The adapter holds no in-memory conversation state** (ADR-0014).

### Durable wizard state (ADR-0014)

`TelegramWizardState` table (see [../data/database.md](../data/database.md)):

| Field                    | Notes                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `telegramUserId`         | Unique key.                                                                                                |
| `userId`                 | The linked Studio User.                                                                                    |
| `flow`                   | `SINGLE_TRACK` \| `ALBUM`.                                                                                 |
| `step`                   | Explicit step marker (e.g. `PICK_TEMPLATE`, `ASK_DELIVERY`, `FILL_SLOT`).                                  |
| `payload`                | JSONB: chosen template id, delivery choice, per-slot collected values, album track count + expanded slots. |
| `createdAt`, `updatedAt` | `updatedAt` drives TTL cleanup.                                                                            |

- Every inbound message loads the row, advances it, saves it. Nothing is remembered
  between requests except through this row.
- A scheduled sweep deletes rows older than the TTL (length = OPEN DECISION).
- Restart / scale-out / load-balancing no longer lose progress.

### Authorization

- The Telegram user resolves to a `User`; **all** [authorization.md](../domain/authorization.md)
  rules apply:
  - role `USER` cannot do MANAGER things;
  - department scoping applies — a Telegram user sees/acts only in their own Department
    (ADMIN: all);
  - **"Cancel All"** cancels only jobs the user is authorized to cancel **within their
    department** (never system-wide — legacy bug).
- If the Telegram user is not linked, or their `User` is `DISABLED`, the bot refuses and
  explains.

### Identity linking

- `/start` → prompt to share contact → match phone against `User.phone` → set
  `telegramUserId` (unique).
- Ambiguous/no match handling = OPEN DECISION (see [../domain/users.md](../domain/users.md)).

### Flows (preserved conceptually)

| Flow             | Studio behavior                                                                                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single Track** | Pick `ACTIVE` template in the user's department → if template has a YouTube target, ask deliver? → collect each slot (with **tolerance-based** aspect-ratio validation) → `createJob` (one job).                                         |
| **Album**        | Pick template → ask track count → expand slots → build N job inputs → call `createJob` N times (or a dedicated `createAlbumJobs` use case) → all jobs linked by an `albumGroupId` (OPEN DECISION — is an album grouping entity wanted?). |
| **List Jobs**    | `listJobs` scoped to the user's department; tap for detail; Retry / Cancel buttons call the same authorized use cases.                                                                                                                   |
| **Cancel All**   | Bulk cancel **within the user's department** and only cancelable-state jobs.                                                                                                                                                             |

### File inputs from Telegram

- The adapter downloads the Telegram file via the Bot API, then hands **structured**
  data (bytes/stream + real content type + size) to the File upload use case — which
  validates content type properly and stores under a generated name.
- Such files default to `JOB_ARTIFACT` (see [../domain/files.md](../domain/files.md));
  "save to gallery" is an explicit action.
- No mimetype-guessing-from-URL; no `execFile` on user-derived strings.

### Outbound notifications

- A single Telegram adapter is used for both inbound and outbound.
- Job `RENDERED` / `UPLOADED` / `ERROR` → DM the creator (if linked), **including the
  error reason** on failure.
- Delivery failures are **logged and surfaced** (not silently swallowed); a failed DM
  never blocks or reverts a Job transition.

### Callback routing

- Do **not** couple `callback_data` to user-facing button text or emoji. Use short
  stable action codes (e.g. `j:retry:<id>`, `j:cancel:<id>`, `t:pick:<id>`). Renaming a
  button must not break routing (legacy flaw).

## 3. Improvements over legacy (summary)

| Legacy                        | Studio                                            |
| ----------------------------- | ------------------------------------------------- |
| No permission enforcement     | Full role + department authorization              |
| "Cancel All" = system-wide    | Scoped to the user's department + cancelable jobs |
| In-memory wizard state        | Durable `TelegramWizardState` table + TTL         |
| Not horizontally scalable     | Stateless adapter, webhook-friendly               |
| Emoji-coupled dispatch        | Stable action codes                               |
| Corrupt file records possible | Proper content-type validation on ingest          |
| Swallowed notification errors | Logged + surfaced                                 |
