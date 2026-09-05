# Studio Documentation

This is the source of truth for Studio's architecture, domain model, integrations, and
conventions. If you are an AI agent, read [`../CLAUDE.md`](../CLAUDE.md) first.

## How to use this documentation

- **Building or changing a feature?** Read the relevant `domain/` page + `architecture/`
  pages + any `integrations/` page it touches, then check `data/lifecycle-rules.md` and
  `data/historical-integrity.md`.
- **Touching legacy-derived behavior?** Read the matching `legacy/` page **and** open the
  legacy source at `/home/mahdirazaqi/Projects/qtical-backend-node/src/render`.
- **Unsure about something the docs don't answer?** It is an
  [`OPEN DECISION`](development/open-decisions.md). Do not invent an answer.

## Contents

- [glossary.md](glossary.md) — shared vocabulary (legacy term ↔ Studio term)

### Architecture

- [overview.md](architecture/overview.md) — system shape, layered architecture, module boundaries
- [boundaries.md](architecture/boundaries.md) — Server Actions vs REST vs Telegram adapter
- [project-structure.md](architecture/project-structure.md) — actual folder layout, layer responsibilities
- [tech-stack.md](architecture/tech-stack.md) — technology choices, versions, and rationale
- [server-actions.md](architecture/server-actions.md) — `defineAction` convention
- [rest-architecture.md](architecture/rest-architecture.md) — `defineRouteHandler` convention
- [server-client-boundary.md](architecture/server-client-boundary.md) — Server vs Client Components, ESLint guard
- [authentication-boundary.md](architecture/authentication-boundary.md) — where the current user is resolved
- [error-handling.md](architecture/error-handling.md) — `AppError` model, boundaries, UI error pages
- [environment.md](architecture/environment.md) — validated env configuration
- [logging.md](architecture/logging.md) — structured logging + redaction
- [data-flow.md](architecture/data-flow.md) — end-to-end request/render flows
- [decisions.md](architecture/decisions.md) — Architecture Decision Records

### Domain

- [users.md](domain/users.md)
- [departments.md](domain/departments.md)
- [files.md](domain/files.md)
- [templates.md](domain/templates.md)
- [jobs.md](domain/jobs.md)
- [authorization.md](domain/authorization.md) — roles, permission matrix, enforcement

### Data

- [database.md](data/database.md) — PostgreSQL + Prisma entities & relationships
- [lifecycle-rules.md](data/lifecycle-rules.md) — deletion & retention rules per entity
- [historical-integrity.md](data/historical-integrity.md) — snapshot / immutability strategy

### Integrations

- [worker-api.md](integrations/worker-api.md) — Render Worker REST contract & compatibility
- [telegram.md](integrations/telegram.md) — Telegram bot integration & durable wizard state
- [youtube.md](integrations/youtube.md) — YouTube upload integration

### Security

- [security.md](security/security.md)

### Legacy reference

- [overview.md](legacy/overview.md) — what the legacy system was and did
- [render-module.md](legacy/render-module.md) — reading guide to the analysis + source
- [render-module-analysis.md](legacy/render-module-analysis.md) — full technical analysis
- [known-issues.md](legacy/known-issues.md) — problems Studio must not reproduce
- [legacy-vs-studio.md](legacy/legacy-vs-studio.md) — concept mapping
- [compatibility-matrix.md](legacy/compatibility-matrix.md) — compatibility vs deliberate changes

### Frontend

- [conventions.md](frontend/conventions.md)
- [theme.md](frontend/theme.md) — Light / Dark / System theme system

### Development

- [conventions.md](development/conventions.md)
- [workflow.md](development/workflow.md) — phases, definition of done
- [open-decisions.md](development/open-decisions.md) — **the OPEN DECISION register**

## Document status conventions

Inline markers used throughout:

- **`OPEN DECISION`** — not yet decided; options and consequences are listed; do not
  implement past it without clarification.
- **`DECIDED`** — a finalized architectural decision; cross-referenced to an ADR.
- **`LEGACY`** — describes legacy behavior for reference only; not necessarily kept.
- **`NEEDS_VERIFICATION`** — believed true but not confirmed against running infra.
