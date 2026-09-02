# Legacy System Overview

## What the legacy system is

`qtical-backend-node` ("Qtical") is a large **NestJS** monolith backend for a YouTube
automation platform. It uses **MongoDB + Mongoose**, exposes **GraphQL** for its panel,
some **REST** controllers, a **Telegram** bot, **Redis/Bull** queues, and integrations
with **YouTube**, **Spotify**, **Elasticsearch**, **Google Drive**, and more.

Studio only concerns itself with **one module**: `src/render` — the video-rendering job
orchestration module. Everything else in the legacy repo (analytics, distribution,
copyright, competitors, releases, playlists, newsletters, …) is **out of scope**.

## Location

`/home/mahdirazaqi/Projects/qtical-backend-node` — inspect it directly. Module of
interest: `src/render` (55 files, ~3,466 LOC, **zero tests**).

## What `src/render` does

It is the **control plane** for rendering — it does not render video itself:

1. **Templates** (`src/render/template`) — GraphQL CRUD (no delete) for reusable render
   recipes: a composition id, a source-project location, an output pattern, a script
   reference, an ordered list of asset slots, plus YouTube description/tags and an
   optional linked YouTube channel.
2. **Jobs** (`src/render/job`) — GraphQL for operators + **unauthenticated REST** for an
   external render worker. A Job binds concrete values to a Template's asset slots and
   moves through a 10-value numeric state machine.
3. **Files** (`src/render/file`) — a **global, unscoped** media registry. Upload +
   transcode (ffmpeg / ImageMagick) + GraphQL read. No delete, no cleanup.
4. **Telegram bot** (`src/render/telegrambot`) — a conversational alternative to the
   GraphQL job-creation flow, with in-memory wizard state.

The **external render worker** (not in the repo, technology unknown) integrates purely
through the REST endpoints on `JobController`: fetch a queued job, patch
progress/state/duration, upload the finished `.mp4`.

## Tenancy in legacy

- Legacy has a **Workspace** concept. A `User` has `workspaces[]`, each with a `_role`
  (`Role` doc with `admin` bool + `actions[]` permission list) and per-workspace
  channel/label/artist access. `User.superAdmin` is a global bypass.
- **The `src/render` module ignores all of this.** It passes **no** access filters to its
  query builders, so any authenticated user with a `*_VIEW` permission sees **every**
  Template / Job / File in the whole system. Telegram-originated actions are attributed
  to a single hard-coded workspace id (`QTICAL_WORKSPACE_ID`).

Studio replaces "Workspace (unenforced in render)" with "**Department** (enforced
everywhere)".

## Key legacy data shapes

See [render-module-analysis.md](render-module-analysis.md) §3 for full field tables.

- **Template**: `name` (globally unique), `disabled`, `composition`, `src`, `script`,
  `output`, `assets[]`, `description`, `tags[]`, `_channel?`, `_createdBy`.
- **TemplateAsset** (embedded): `name`, `composition`, `layer`, `type` (free text),
  `imageRatio`.
- **Job**: `_createdBy`, `_retriedBy?`, `_template`, `title` (derived), `state` (0–9),
  `workDir`, `assets[]` (embedded, resolved), `progress`, `duration`, `retriedCount`,
  `upload`, timeline dates, `video`/`screenshot`/`thumbnail` paths.
- **JobAsset** (embedded): `composition`, `layer`, `type`, `src?`, `text?`.
- **File**: `filename`, `originalname`, `mimetype`, `path`, `size`, `_createdBy` (declared
  but never populated).

## Job state machine (legacy)

```
0 Queued → 1 Fetched → 2 Downloading → 3 Started → 4 InProgress → 5 Rendered
        → 6 Uploading → 7 Uploaded
                                     ↘ 8 Error
(any non-terminal) → 9 Cancel
```

Only `Queued`, `Fetched`, `InProgress`, `Rendered`, `Uploaded`, `Error`, `Cancel` are
ever set by the backend code. `Downloading`, `Started`, `Uploading` are set (if at all) by
the external worker via the unvalidated `PATCH /jobs/:id/state`.

## Legacy business rules worth preserving

(See [render-module-analysis.md](render-module-analysis.md) §18 for the full list, and
[compatibility-matrix.md](compatibility-matrix.md) for the keep/change decision on each.)

1. A Job needs a valid Template; every asset slot must be filled at creation.
2. `data` asset values become the Job `title` (joined with `" | "`).
3. Non-`data` assets reference a File; the file location is captured **by value** at
   creation (later File changes don't affect the Job) — Studio formalizes this as a
   **snapshot**.
4. A script asset is auto-injected as the first asset.
5. Disabled templates are hidden from creation pickers.
6. Retry eligibility: not already rendered/uploading/uploaded, and within 3 days of
   creation. `retriedCount` increments; `_retriedBy` records who.
7. Bulk cancel skips already-terminal jobs silently (reports the ones it did cancel).
8. YouTube upload only when the job opts in **and** the template has a channel; video is
   uploaded `private`; tags come from template tags with `{{layer}}` substitution;
   unresolved-placeholder tags are dropped.
9. The Telegram "Album" flow turns one conversation into multiple Jobs (one per track).
10. On render completion the creator is notified (Telegram + in-app); on upload/error,
    notified too (legacy was inconsistent about which channel).
11. A daily cap limits YouTube-upload jobs (legacy: 3, global).

## Legacy problems

Recorded in detail in [known-issues.md](known-issues.md). Headlines: unauthenticated
worker API, command injection via filenames, non-atomic job claim, destructive retry with
a post-delete quota check, exact-float aspect-ratio check, no department isolation, no
Telegram permission checks, in-memory Telegram state, fire-and-forget delivery, no file
cleanup, unhandled duplicate-name and malformed-id errors, zero tests.

**Studio must not reproduce any of these.** (ADR-0012.)
