# Studio

Standalone **Next.js (App Router, TypeScript)** application for operating a
video-rendering job pipeline: reusable **Templates**, concrete **Jobs**, an external
**Render Worker** (REST), **YouTube** / **Telegram** delivery, a **Telegram Bot**
front-end, and a reusable **File Gallery**.

Studio replaces the `src/render` module of the legacy backend `qtical-backend-node`. It
is a rewrite on a new architecture (PostgreSQL + Prisma, Server Actions, department-scoped
authorization), **not** a port.

## Status

**Phase 0 — documentation & architecture foundation.** No features implemented yet.

## Start here

- **AI agents / Claude Code:** read [`CLAUDE.md`](CLAUDE.md) first.
- **Humans:** read [`docs/README.md`](docs/README.md).

## Documentation map

```
docs/
├── README.md                     Documentation index
├── glossary.md                   Shared vocabulary
├── architecture/
│   ├── overview.md               System shape, layers, modules
│   ├── boundaries.md             Server Actions vs REST vs Telegram
│   ├── project-structure.md      Folder layout & layer responsibilities
│   ├── data-flow.md              End-to-end flows (create → render → deliver)
│   ├── tech-stack.md             Chosen technologies & rationale
│   └── decisions.md              Architecture Decision Records (ADRs)
├── domain/
│   ├── users.md   departments.md   files.md   templates.md   jobs.md
│   └── authorization.md          Roles & permission matrix
├── data/
│   ├── database.md               PostgreSQL + Prisma entities
│   ├── lifecycle-rules.md        Deletion / retention per entity
│   └── historical-integrity.md   Snapshots & immutable references
├── integrations/
│   ├── worker-api.md             Render Worker REST contract
│   ├── telegram.md               Telegram bot integration
│   └── youtube.md                YouTube upload integration
├── security/security.md          Security requirements
├── legacy/
│   ├── overview.md               What the legacy system did
│   ├── render-module-analysis.md Full technical analysis of legacy src/render
│   ├── known-issues.md           Legacy problems Studio must not reproduce
│   ├── legacy-vs-studio.md       Concept mapping table
│   └── compatibility-matrix.md   Behavior-by-behavior compatibility decisions
├── frontend/conventions.md       UI conventions
└── development/
    ├── conventions.md            Coding conventions
    ├── workflow.md               Phases & dev workflow
    └── open-decisions.md         OPEN DECISION register
```
