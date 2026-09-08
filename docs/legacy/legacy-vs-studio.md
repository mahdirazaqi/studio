# Legacy → Studio Mapping

How legacy concepts translate to Studio. "Reason / notes" links to the governing decision.

## Platform & architecture

| Legacy                                                           | Studio                                                                   | Reason / notes                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| NestJS monolith module (`src/render`)                            | Standalone Next.js App Router app                                        | ADR-0001                                                      |
| MongoDB                                                          | PostgreSQL                                                               | ADR-0002                                                      |
| Mongoose ODM                                                     | Prisma ORM                                                               | ADR-0002                                                      |
| GraphQL (internal panel operations)                              | Server Actions + Server Components                                       | ADR-0003                                                      |
| REST controllers (worker + file upload)                          | REST Route Handlers under `app/api/worker/**`, authenticated + versioned | ADR-0004                                                      |
| `nestjs-telegraf` `@Update()` handlers                           | Telegram Adapter behind a webhook Route Handler (or polling worker)      | ADR-0014, [telegram.md](../integrations/telegram.md)          |
| Redis / Bull (registered, effectively unused in render)          | No queue by default; a durable-work mechanism added only if required     | [tech-stack.md](../architecture/tech-stack.md), OPEN DECISION |
| EventEmitter2 (`ADD_ACTIVITY_LOG`, `SEND_SYSTEM_MESSAGE`)        | Explicit audit-entry writes + notification use cases                     | [security.md](../security/security.md) §14                    |
| Elasticsearch, Google Drive, Spotify, analytics, copyright, etc. | **Out of scope** — not part of Studio                                    | —                                                             |

## Tenancy & identity

| Legacy                                                                           | Studio                                                       | Reason / notes                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| `Workspace` (multi-tenant unit)                                                  | `Department`                                                 | ADR-0011                                           |
| Workspace scoping **not enforced** in render module                              | Department scoping **enforced** in use cases + repositories  | K7, [authorization.md](../domain/authorization.md) |
| `Role` doc with `admin` bool + `actions[]` permission list                       | Fixed roles `USER` / `MANAGER` / `ADMIN`                     | [authorization.md](../domain/authorization.md)     |
| `User.superAdmin` global bypass                                                  | `ADMIN` role                                                 | [authorization.md](../domain/authorization.md)     |
| `User.disabled` bool                                                             | `User.status` = `ACTIVE` / `DISABLED`; never deleted         | ADR-0007                                           |
| `User.telegramId` (phone-linked)                                                 | `User.telegramUserId` (phone-linked), unique                 | [users.md](../domain/users.md)                     |
| `QTICAL_WORKSPACE_ID` (all Telegram jobs attributed to one hard-coded workspace) | Telegram job attributed to the linked user's real Department | [telegram.md](../integrations/telegram.md)         |
| Telegram surface bypasses permissions                                            | Telegram uses identical role + department checks             | K8                                                 |

## Templates

| Legacy                                            | Studio                                                                            | Reason / notes                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------- |
| `Template` (Mongo doc)                            | `Template` (Postgres row)                                                         | ADR-0002                               |
| `name` globally unique                            | Unique **per Department among non-deleted** _(OPEN DECISION)_                     | [templates.md](../domain/templates.md) |
| No delete (dead `TEMPLATE_REMOVE` permission)     | **Soft delete** (`status` / `deletedAt`), row kept forever                        | ADR-0006                               |
| `disabled` bool (only bot honored it)             | `status` = `ACTIVE` / `DISABLED` / `DELETED`, enforced on **every** creation path | ADR-0006, K20                          |
| `editTemplate` full-replace                       | Patch semantics                                                                   | [templates.md](../domain/templates.md) |
| Editing a template affects future jobs implicitly | Editing never touches existing Jobs (snapshots)                                   | ADR-0010                               |
| `_channel` → YouTube `Channel` doc                | Removed — Studio does not upload to YouTube (ADR-0041)                            | ADR-0041                               |
| `TemplateAsset.type` free-text string             | `TemplateAsset.kind` validated enum (`DATA`/`IMAGE`/`AUDIO`/`VIDEO`)              | [templates.md](../domain/templates.md) |
| `imageRatio` enforced only in Telegram            | Enforced on all image paths, tolerance-based                                      | K6                                     |
| `script` auto-injected as `assets[0]`             | Same (script asset injected at creation)                                          | [jobs.md](../domain/jobs.md)           |
| No department field                               | `departmentId` required                                                           | ADR-0011                               |

## Jobs

| Legacy                                                                                   | Studio                                                                                                                                                         | Reason / notes                                     |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `Job` (Mongo doc)                                                                        | `Job` (Postgres row)                                                                                                                                           | ADR-0002                                           |
| `state`: integer 0–9, unvalidated                                                        | Named states + validated transition map                                                                                                                        | ADR-0013                                           |
| `Queued/Fetched/Downloading/Started/InProgress/Rendered/Uploading/Uploaded/Error/Cancel` | `QUEUED/CLAIMED/RENDERING/RENDERED/ERROR/CANCELED` — `RENDERED` is now terminal, no `Uploading`/`Uploaded` equivalent (ADR-0041); legacy ints `6`/`7` rejected | [compatibility-matrix.md](compatibility-matrix.md) |
| `title` = join of `data` assets with `"                                                  | "`                                                                                                                                                             | Same, computed once at creation, stored            | [jobs.md](../domain/jobs.md) |
| `workDir` copied from `Template.output`                                                  | Captured in the Job **snapshot**                                                                                                                               | ADR-0010                                           |
| Embedded `assets[]` referencing files by copied path string                              | Resolved assets captured in the snapshot (path + identifying metadata) + live FK for active-dependency checks                                                  | ADR-0010, [files.md](../domain/files.md)           |
| `retryJob` = `findOneAndDelete` + recreate                                               | New Job linked via `retryOfJobId`; original never deleted                                                                                                      | ADR-0005, K4/K5                                    |
| `retriedCount` / `_retriedBy`                                                            | `attemptNumber` / `retriedByUserId` / `retryReason`                                                                                                            | [jobs.md](../domain/jobs.md)                       |
| Retry window: 3 days from creation                                                       | Configurable window (default 3–7 days) _(OPEN DECISION)_                                                                                                       | [jobs.md](../domain/jobs.md)                       |
| `cancelJob(ids[])` bulk, skips terminal silently                                         | Same behavior, enforced by state machine, department-scoped                                                                                                    | [jobs.md](../domain/jobs.md)                       |
| No delete                                                                                | **Never deleted** (hard or soft)                                                                                                                               | ADR-0005                                           |
| `GET /jobs/fetch` non-atomic                                                             | `POST /jobs/next` atomic claim                                                                                                                                 | ADR-0013, K3                                       |
| Fire-and-forget YouTube/Telegram delivery                                                | No YouTube delivery at all (ADR-0041); Telegram remains a best-effort, never-blocking notification                                                             | ADR-0041, K10                                      |
| Global daily upload cap = 3                                                              | Removed — no YouTube upload to cap (ADR-0041)                                                                                                                  | ADR-0041                                           |
| No department field                                                                      | `departmentId` required                                                                                                                                        | ADR-0011                                           |
| No audit entry for retry                                                                 | All privileged actions audited                                                                                                                                 | K19                                                |

## Files

| Legacy                                                           | Studio                                                          | Reason / notes                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `File` (Mongo doc), **global/unscoped**                          | `File` (Postgres row), `departmentId` required                  | ADR-0011, K7                                   |
| One flat collection                                              | `category` = `GALLERY_ASSET` / `JOB_ARTIFACT`                   | ADR-0008                                       |
| No delete, no cleanup                                            | Hard delete when safe; automatic Job-artifact cleanup           | ADR-0008, K12                                  |
| `_createdBy` declared, never set                                 | `uploadedByUserId` actually populated                           | K15                                            |
| Filename = `Date.now()-<sanitized-original>` (metachars survive) | System-generated `storedName` (UUID); original name is metadata | ADR-0015, K2                                   |
| Job asset → file by copied path string, no FK                    | Snapshot metadata + live FK for active checks                   | ADR-0010                                       |
| ffmpeg/convert via `exec` string                                 | `execFile` with arg array (if normalization needed at all)      | ADR-0015                                       |
| Telegram download guesses mimetype from URL                      | Proper content-type validation on ingest                        | K2, [telegram.md](../integrations/telegram.md) |

## Worker integration

| Legacy                                                  | Studio                                                               | Reason / notes                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| `POST /files` (user-authenticated)                      | `POST /api/v1/worker/files` (worker-credential)                      | ADR-0004                                       |
| `GET /jobs/fetch` (unauth, non-atomic)                  | `POST /api/v1/worker/jobs/next` (worker-credential, atomic)          | ADR-0004, K1, K3                               |
| `GET /jobs/:id` (unauth)                                | `GET /api/v1/worker/jobs/:id` (worker-credential)                    | ADR-0004                                       |
| `PATCH /jobs/:id/progress                               | duration                                                             | state` (unauth, unvalidated)                   | Same paths under `/api/v1/worker`, authenticated + validated | ADR-0004, K14 |
| `POST /jobs/:id/upload` (unauth) → 200, fire-and-forget | `POST /api/v1/worker/jobs/:id/result` (auth) → 202, durable delivery | ADR-0004, ADR-0016                             |
| No version, no `/api` prefix                            | Versioned under `/api/v1/worker`                                     | [worker-api.md](../integrations/worker-api.md) |
| No auth of any kind                                     | Service credential on every endpoint                                 | ADR-0004                                       |

## Telegram

| Legacy                                                              | Studio                                                         | Reason / notes                             |
| ------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| In-memory `TelegrambotDataset` / `TelegrambotJobDataset`            | `TelegramWizardState` table + TTL                              | ADR-0014, K11                              |
| Emoji-coupled `callback_data` routing                               | Stable action codes                                            | [telegram.md](../integrations/telegram.md) |
| No permission checks                                                | Full role + department authorization                           | K8                                         |
| "Cancel All Jobs" = system-wide                                     | Scoped to the user's department + cancelable jobs              | K8                                         |
| Bot logic mixed into a 650-LOC service                              | Thin adapter → shared use cases (no business logic in adapter) | [overview.md](../architecture/overview.md) |
| Separate ad-hoc `Telegraf` client in `JobService` for notifications | One Telegram adapter for inbound + outbound                    | [telegram.md](../integrations/telegram.md) |
| Notification errors swallowed                                       | Logged + surfaced; never blocks a Job transition               | K13                                        |

## YouTube

**Removed, Phase 12 (ADR-0041).** Studio uploaded to YouTube in Phases 9–11
(`YouTubeTarget`, `Job.deliverToYouTube`, `Template.youtubeTargetId`/`description`/
`tags`) — all removed. Studio's current product decision is that it does not upload
rendered Jobs to YouTube (or anywhere else) at all; a Job's lifecycle ends at
`RENDERED`. See ADR-0041.
