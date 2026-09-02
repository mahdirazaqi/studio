# Tech Stack

## Decided

| Concern | Choice | Rationale / ADR |
|---|---|---|
| Framework | **Next.js (App Router)** | Single deployable, Server Components + Server Actions remove hand-rolled API/DTO layers. ADR-0001. |
| Language | **TypeScript** (strict) | Type safety across the whole stack. |
| UI runtime | **React** (Server + Client Components) | |
| Styling | **Tailwind CSS** | Utility-first, consistent, fast. |
| Component library | **shadcn/ui** | Owned components (copied in), accessible, themeable (light/dark/system). |
| Database | **PostgreSQL** | Relational integrity, transactions, row-level locking for atomic job claim, JSON columns for snapshots. ADR-0002. |
| ORM | **Prisma** | Typed data access, migrations. ADR-0002. |
| Internal mutations | **Server Actions** | ADR-0003. |
| External Worker comms | **REST Route Handlers** (versioned, authenticated) | ADR-0004. |
| Input validation | **Zod** (or equivalent) at every boundary | Server Actions + Route Handlers both validate. |
| Auth (humans) | Session-based | Mechanism detail is an OPEN DECISION (library choice). |

## Media tooling

- **ffmpeg** and **ImageMagick** are used for screenshot extraction and thumbnail
  resizing after a render is uploaded, and possibly for input normalization on gallery
  upload.
- **They must be invoked with `execFile`/`spawn` and an argument array**, never
  `child_process.exec` with an interpolated string. See
  [../security/security.md](../security/security.md). Legacy had a command-injection hole
  here.
- Whether media processing runs in-process, in a queue worker, or is delegated to the
  Render Worker is an **OPEN DECISION** (see [open-decisions.md](../development/open-decisions.md)).

## External services (not owned by Studio)

| Service | Purpose | Adapter |
|---|---|---|
| Render Worker | Renders the video | `server/adapters/*` — Studio is the server side of the contract; the Worker is the client. |
| YouTube Data API v3 | Publishes finished videos, sets thumbnail | `server/adapters/youtube` |
| Telegram Bot API | Conversational UI + push notifications | `server/adapters/telegram` |

## Storage

- Media bytes live in **file/object storage**. The concrete implementation (local disk
  behind a volume, S3-compatible object storage, etc.) is an **OPEN DECISION** for a
  later phase. Access it only through `server/adapters/storage` so it can be swapped.
- Do **not** introduce a storage abstraction layer more elaborate than a single adapter
  interface until a real multi-backend requirement exists.

## Explicitly not used

- **MongoDB / Mongoose** — replaced by PostgreSQL + Prisma. Do not reintroduce.
- **GraphQL** — internal operations use Server Actions.
- **Redis / Bull** — the legacy render module registered a Bull queue only as a DI
  artifact and never used it. Studio adds a queue only if a concrete durable-work
  requirement calls for one (OPEN DECISION), not by default.
- **Elasticsearch** — legacy-wide concern, not part of Studio's scope.

## Deferred / to be decided in later phases

See [open-decisions.md](../development/open-decisions.md). Includes: session library,
object storage backend, background-job/queue mechanism, Telegram webhook vs polling,
Worker credential scheme, rate-limiting layer.
