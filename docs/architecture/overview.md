# Architecture Overview

> **Implementation status (end of Phase 1).** The layered structure below is
> established in code: `src/app` (presentation), `src/features/*` (modules, currently
> README-only), `src/server/*` (infrastructure — env, logging, errors, validation,
> `defineAction`, `defineRouteHandler`, auth & authz boundaries). The Application/Domain
> and Infrastructure/Repository layers have their conventions and boundaries in place but
> **no domain logic yet** — that starts in Phase 2. The DB layer (Prisma) is not wired.
> See [project-structure.md](project-structure.md) for the actual tree.

## 1. What Studio is

Studio is the **control plane** for a video-rendering pipeline. It does **not** render
video. It:

1. Lets operators author **Templates** (render recipes + asset-slot definitions).
2. Lets operators create **Jobs** (a Template + concrete asset values) via the web UI or
   the Telegram bot.
3. Exposes an authenticated **Worker REST API** that an external **Render Worker** polls
   to claim jobs, report progress/state, and upload results.
4. On completion, optionally delivers the video to **YouTube** and/or **Telegram**, and
   notifies the operator in-app.
5. Manages a **File Gallery** of reusable media assets.

The actual rendering engine and the queue between "queued" and "claimed" are **external**
and integrate only through the Worker REST API.

## 2. Single deployable, layered internally

Studio is one Next.js application (App Router). Internally it is strictly layered:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Presentation                                                         │
│  • Server Components (reads)     • Client Components (interactivity)   │
│  • Server Actions (internal commands/mutations)                       │
│  • Route Handlers  app/api/worker/**   (external: Render Worker)      │
│  • Route Handlers  app/api/telegram/** (external: Telegram, if webhook)│
└───────────────┬──────────────────────────────────────────────────────┘
                │  (all entry points call the same layer below)
┌───────────────▼──────────────────────────────────────────────────────┐
│  Application / Domain  (features/*/server or server/*)                │
│  • Use cases / application services — ALL business rules              │
│  • Authorization checks (every use case re-checks)                    │
│  • Domain types, state machine, invariants                           │
│  • Input validation schemas (Zod) for each use case                  │
└───────────────┬──────────────────────────────────────────────────────┘
┌───────────────▼──────────────────────────────────────────────────────┐
│  Infrastructure                                                       │
│  • Repositories (Prisma) — only place raw queries live               │
│  • Adapters: YouTube API, Telegram Bot API, object/file storage,     │
│    media tooling (ffmpeg/ImageMagick via execFile), clock, ids       │
└───────────────┬──────────────────────────────────────────────────────┘
┌───────────────▼──────────────────────────────────────────────────────┐
│  PostgreSQL (Prisma)   +   File/object storage   +   External APIs   │
└──────────────────────────────────────────────────────────────────────┘
```

### Layer rules

- **Presentation never contains business logic** and never touches Prisma directly.
- **A use case is the unit of business behavior.** It is transport-agnostic: the same
  `createJob` use case is called by a Server Action, by the Telegram adapter, and (if
  ever needed) by a Route Handler.
- **Authorization is enforced in the application layer** (and, defensively, in
  repositories for department scoping). Never rely on the UI.
- **Repositories are the only Prisma consumers.** They return domain-shaped data.
- **Adapters wrap every external dependency** behind an interface so use cases stay
  testable and the external system can be swapped.

## 3. Canonical flows

| Trigger                              | Path                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| Operator does something in the panel | `UI → Server Action → Use Case → Repository → Prisma`                          |
| Server-side read for a page          | `Server Component → Use Case (or read model) → Repository → Prisma`            |
| Render Worker calls Studio           | `Worker → Route Handler (app/api/worker) → Use Case → Repository → Prisma`     |
| Telegram user interacts              | `Telegram → Telegram Adapter → Use Case → Repository → Prisma`                 |
| Job finished, deliver video          | `Use Case → YouTube Adapter / Telegram Adapter` (durably, not fire-and-forget) |

Detailed sequences: [data-flow.md](data-flow.md).

## 4. Modules

Studio's domain is intentionally small. The modules:

| Module                        | Responsibility                                                                                                                                     | Boundary                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Authentication**            | Establish who the caller is (session for humans, service credential for the Worker, phone-linked identity for Telegram). Issue/verify sessions.    | Does **not** decide what a caller may do — that is Authorization. |
| **Users**                     | User records, department membership, role, `active`/`disabled` lifecycle, Telegram linkage.                                                        | Never deletes users.                                              |
| **Departments**               | The tenancy boundary. Department records; scoping enforcement helpers.                                                                             | Deletion policy is an **OPEN DECISION**.                          |
| **Files / File Gallery**      | Upload, catalog, browse, preview, reuse, and safe deletion of media assets. Distinguishes Persistent Gallery Assets from Job Artifacts.            | Owns storage adapter usage.                                       |
| **Templates**                 | Template + template-asset authoring, editing, disabling, soft-deletion, validation.                                                                | Soft-delete only; preserves historical Job references.            |
| **Jobs**                      | Job creation, the state machine, assets, progress/duration, cancellation, retry lineage, completion, delivery orchestration, historical integrity. | Never deletes jobs.                                               |
| **Render Worker integration** | The authenticated Worker REST API: atomic claim, progress/state/duration updates, result upload, input-file upload.                                | Compatibility contract with an external system.                   |
| **Telegram Bot**              | Conversational job creation/monitoring. Durable wizard state. Same authz as the web UI.                                                            | No business logic in the adapter; no in-memory state.             |

Do **not** add modules or entities beyond these without a requirement and an ADR.

## 5. External systems

See [tech-stack.md](tech-stack.md) and [integrations/](../integrations/). Summary:

| System                | Role                                                   | Owned by                     |
| --------------------- | ------------------------------------------------------ | ---------------------------- |
| PostgreSQL            | All Studio persistence                                 | Studio                       |
| File / object storage | Media bytes (gallery assets, job artifacts)            | Studio (storage impl TBD)    |
| Render Worker         | Performs rendering                                     | External                     |
| YouTube Data API      | Publishes finished videos                              | External                     |
| Telegram Bot API      | Conversational UI + notifications                      | External                     |
| ffmpeg / ImageMagick  | Screenshot & thumbnail generation, media normalization | Studio host (invoked safely) |

## 6. Key differences from legacy (at a glance)

| Legacy                                         | Studio                                                         |
| ---------------------------------------------- | -------------------------------------------------------------- |
| MongoDB + Mongoose                             | PostgreSQL + Prisma                                            |
| GraphQL for internal ops                       | Server Actions / Server Components                             |
| Unauthenticated Worker REST                    | Authenticated Worker REST                                      |
| No department scoping in render module         | Department scoping enforced everywhere                         |
| Telegram wizard state in process memory        | Durable wizard state in PostgreSQL                             |
| Retry deletes the original Job                 | Retry creates a linked new Job; original kept forever          |
| `child_process.exec` with string interpolation | `execFile`/`spawn` with argument arrays                        |
| Non-atomic job `fetch` (race)                  | Atomic claim (`SELECT … FOR UPDATE SKIP LOCKED` or equivalent) |
| Fire-and-forget delivery                       | Durable delivery with retry / recorded outcome                 |
| Global daily upload cap of 3, all users        | Cap model is an **OPEN DECISION** (scope + value)              |

Full mapping: [../legacy/legacy-vs-studio.md](../legacy/legacy-vs-studio.md).
Full compatibility analysis: [../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).
