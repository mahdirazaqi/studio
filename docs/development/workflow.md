# Development Workflow

## Phases

Studio is built in phases. **Do not run ahead of the current phase.**

### Phase 0 — Documentation & architecture foundation _(complete)_

**Goal:** a complete, consistent, AI-readable knowledge base so future work does not
re-derive the architecture or re-introduce legacy defects.

**In scope:** everything under `docs/`, `CLAUDE.md`, `README.md`.

**Explicitly NOT in scope (Phase 0 non-goals):**

- No full UI implementation — no Job UI, Template UI, File Gallery UI, Users UI,
  Departments UI.
- No Telegram bot implementation.
- No Render Worker API implementation.
- No YouTube integration implementation.
- No authentication/session implementation.
- No production `prisma/schema.prisma` or migrations (conceptual model only).
- No Prisma models, API endpoints, Server Actions, use cases, or adapters — **unless**
  strictly required to validate a documented decision.
- No production deployment.
- No new features beyond the documented domain.
- No redesign of business behavior without an explicit requirement.
- No migration or copying of legacy code.

**Definition of done for Phase 0:**

- [x] Legacy repo inspected directly (not just via the analysis doc).
- [x] Legacy `src/render` behavior understood and documented (`legacy/`).
- [x] Legacy technical debt catalogued (`legacy/known-issues.md`, K1–K28).
- [x] Studio architecture documented (`architecture/`).
- [x] Server Actions vs REST boundary documented (`architecture/boundaries.md`).
- [x] Roles & permission matrix documented (`domain/authorization.md`).
- [x] Department isolation documented (`domain/departments.md`, ADR-0011).
- [x] Job lifecycle & state machine documented (`domain/jobs.md`, ADR-0013).
- [x] Job "never deleted" documented (ADR-0005).
- [x] Template soft-delete documented (ADR-0006).
- [x] User disable (never delete) documented (ADR-0007).
- [x] File hard-delete rules + Gallery vs Artifact documented (ADR-0008).
- [x] Historical integrity + snapshot strategy documented (`data/historical-integrity.md`, ADR-0009/0010).
- [x] Non-destructive retry redesigned conceptually (`domain/jobs.md`).
- [x] Worker REST compatibility + auth requirement documented (`integrations/worker-api.md`).
- [x] Telegram integration + durable state documented (`integrations/telegram.md`, ADR-0014).
- [x] Security requirements documented (`security/security.md`).
- [x] Frontend conventions documented (`frontend/conventions.md`).
- [x] ADRs written (`architecture/decisions.md`).
- [x] Legacy → Studio mapping written (`legacy/legacy-vs-studio.md`).
- [x] Compatibility matrix written (`legacy/compatibility-matrix.md`).
- [x] `CLAUDE.md` created.
- [x] OPEN DECISION items collected (`development/open-decisions.md`).

### Phase 1 — Next.js foundation & application architecture _(complete)_

**Goal:** a clean, production-ready application skeleton — no business features.

**Delivered:**

- Next.js 15 App Router + TypeScript (strict) + Tailwind v4 + shadcn/ui, on npm.
- Theme system (Light / Dark / System) via next-themes + token-driven `globals.css`.
- Dashboard shell: `(auth)` + `(dashboard)` route groups, collapsible sidebar, header
  with breadcrumb + theme toggle, mobile off-canvas nav, placeholder feature routes.
- Feature-based structure (`src/features/*` with README-documented scope).
- Server/infra layer (`src/server/*`, all `server-only`): validated env, structured
  logger + redaction, `AppError` model + `toPublicError`, `parseInput` validation,
  `defineAction` (Server Actions), `defineRouteHandler` (REST), auth boundary
  (`getCurrentUser`), authz boundary (`authorize`).
- Error/loading/not-found boundaries at root, `(dashboard)`, and global levels.
- ESLint server/client boundary guard, Prettier, Vitest (37 foundational tests),
  `npm run check`.
- `/api/health` — the only Route Handler.

**Explicitly NOT in Phase 1:** any domain feature (Jobs/Templates/Files/Users/
Departments/Telegram/Worker/YouTube), Prisma schema/models/migrations, the session
backend, real forms, deployment.

**Docs:** `architecture/{project-structure,tech-stack,server-actions,rest-architecture,
server-client-boundary,authentication-boundary,error-handling,environment,logging}.md`,
`frontend/theme.md`, ADR-0017/0018/0019.

### Phase 2 — Database & authentication _(complete)_

**Goal:** a real persistent data layer and real authenticated sessions — no full
authorization matrix, no user/department management UI yet.

**Delivered:**

- PostgreSQL + Prisma (`prisma/schema.prisma`, `src/server/db` singleton,
  `DATABASE_URL` required in `@/server/env`, initial migration applied and verified
  against a real Postgres instance). ADR-0002 (already decided) now has code behind it.
- `Department` (id, name, timestamps) and `User` (id, email, fullName, passwordHash, role,
  status, departmentId, timestamps) models. `User.departmentId` is `onDelete: Restrict` —
  Postgres refuses to delete a Department with Users, with no delete feature needed to
  enforce it.
- `Session` model + a custom, DB-backed session mechanism: opaque bearer token in an
  httpOnly cookie, only its SHA-256 hash stored server-side (ADR-0020 — resolves OD-43).
- bcrypt password hashing (`bcryptjs`), with a timing-safe path for unknown emails.
- Sign-in / sign-out: `features/auth` (schemas, use cases, Server Actions, a real sign-in
  form) on top of `@/server/auth/{session,password,current-user}`.
- `(dashboard)/layout.tsx` now genuinely protects every route under it
  (`getCurrentUser()` + `redirect`); the sidebar shows the real signed-in user and a
  working sign-out control; `(auth)/sign-in` redirects an already-authenticated visitor.
- Prisma seed (`prisma/seed.ts`, `npm run db:seed`) for a local dev Department + optional
  admin user, driven entirely by env vars — no hard-coded credential.
- ADR-0021 resolves OD-45 (Prisma naming: `@@map` tables to snake_case, columns default).
- Docs: `architecture/{database,authentication}.md`, `development/database.md`, and
  updates to `authentication-boundary.md`, `domain/{users,departments}.md`,
  `data/database.md`, `security/security.md`, `tech-stack.md`, `project-structure.md`.

**Explicitly NOT in Phase 2:** the full authorization matrix (`@/server/authz` still
allows ADMIN only, exactly as Phase 1 left it), department isolation enforcement, user
management (create/disable/role-change) or department management UI, Templates, Jobs,
Files, Worker API, Telegram, YouTube, rate limiting on login.

### Phase 3+ (not started)

Sequencing is not finalized, but a sensible order:

1. Full authorization matrix + department isolation enforcement (the backbone Phase 2's
   `Actor`/`CurrentUser` shapes were built for; resolves OD-05, OD-07's enforcement side).
2. User management (create/disable/role-change) + Department management.
3. Templates (authoring + soft-delete + validation).
4. Files / Gallery (upload, storage adapter, categories; resolves OD-42, OD-21).
5. Jobs (creation, snapshot, state machine) + Worker API (atomic claim, auth,
   progress/state/result, durable delivery scaffold; resolves OD-27, OD-40).
6. YouTube delivery adapter.
7. Telegram adapter + durable wizard state.
8. Cleanup jobs, retention, hardening, observability.

Each Phase 2+ slice: read the relevant `docs/`, resolve the blocking OPEN DECISIONs with
the product owner, implement behind the layering rules, test (unit + the integration
tests listed in `conventions.md` §9), update the docs.

## Working on a task (any phase)

1. Read `CLAUDE.md` → the relevant `docs/` pages.
2. If legacy-derived, open the legacy source.
3. Check `open-decisions.md` — is anything you need still undecided? If it **blocks** you,
   ask; otherwise note it and proceed only on the parts that are decided.
4. Implement within the layer rules.
5. Add/adjust tests.
6. Update docs + ADRs + open-decisions.
7. Branch, commit, PR referencing the governing doc/ADR.

## Handling ambiguity

- Never invent a business requirement. Mark it `OPEN DECISION`, record the options **and
  their consequences**, add it to `open-decisions.md`, and ask when it blocks progress.
- Studio requirements > ADRs > Studio docs > legacy behavior > legacy implementation.
