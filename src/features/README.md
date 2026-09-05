# `src/features/*`

Feature-oriented application code. Each folder is one module from
`docs/architecture/overview.md`. A feature is independently understandable and owns its
UI, its Server Actions, its business logic, its data access, and its validation.

## Anatomy of a feature

Create only the folders a feature actually needs.

```
features/<feature>/
├── actions/      'use server' entry points — thin: validate + authenticate + delegate
├── use-cases/    ALL business rules; transport-agnostic; called by actions, route
│                 handlers, and the Telegram adapter alike
├── domain/       pure types, enums, state machines, invariant functions (no I/O)
├── schemas/      Zod schemas for this feature's inputs
├── repository/   the ONLY place Prisma is touched for this feature
├── read/         read models / query functions for Server Components
├── components/   client + server components for this feature's screens
└── server/       feature-scoped server helpers that aren't a full use case
```

## Rules

- `actions/` and route handlers are thin. Business logic lives in `use-cases/`.
- `use-cases/` authorize the actor first (via `@/server/authz`), enforce invariants, then
  orchestrate `repository/` + adapters.
- `repository/` is the only Prisma consumer; it also applies department-scope filters
  defensively.
- `components/` must not import `@/server/*` (enforced by ESLint). Data comes from a
  Server Component or a Server Action as props.
- A feature never imports another feature's `repository/` or `use-cases/` internals.
  Cross-feature needs go through a published use case or a `@/server/*` primitive.

## Phase 1 status

No feature has implementation yet. Each folder currently holds only a `README.md`
describing its scope and boundaries. See `docs/development/workflow.md` for the phase
plan.
