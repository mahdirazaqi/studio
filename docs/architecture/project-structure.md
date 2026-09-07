# Project Structure

**`DECIDED`** — feature-based, layered. This reflects the **actual** Phase 8 tree.

## 1. Repository layout

```
studio/
├── CLAUDE.md
├── README.md
├── docs/
├── public/
├── prisma/                       schema.prisma, migrations/, seed.ts (Phase 2 + 4, ADR-0002)
├── prisma.config.ts              Prisma CLI config (schema path, seed command)
├── src/                          see §2
├── components.json               shadcn/ui config
├── eslint.config.mjs             flat config + server/client boundary guard
├── prettier.config.mjs
├── next.config.ts
├── postcss.config.mjs            @tailwindcss/postcss
├── vitest.config.ts
├── tsconfig.json                 strict + noUncheckedIndexedAccess + noImplicitOverride
├── .env.example
├── .editorconfig  .nvmrc  .gitignore  .prettierignore
├── package.json                  npm; scripts: dev build start lint typecheck format test check db:*
└── package-lock.json
```

No `tailwind.config.*` — Tailwind v4 is configured in CSS (`src/app/globals.css`).

## 2. `src/` tree (actual)

```
src/
├── app/                          Next.js App Router — presentation & wiring only
│   ├── layout.tsx                <html lang=en dir=ltr>, fonts, ThemeProvider, Toaster
│   ├── globals.css               Tailwind v4 + design tokens (light + .dark)
│   ├── error.tsx  global-error.tsx  not-found.tsx
│   ├── (auth)/                   unauthenticated routes
│   │   ├── layout.tsx
│   │   └── sign-in/page.tsx      real sign-in form; redirects to "/" if already authenticated
│   ├── (dashboard)/              authenticated app shell (sidebar + header)
│   │   ├── layout.tsx            getCurrentUser() guard + redirect; SidebarProvider + AppSidebar + AppHeader
│   │   ├── page.tsx              "/" overview — filtered to navigationForRole(user.role)
│   │   ├── loading.tsx  error.tsx
│   │   ├── jobs/                 → IMPLEMENTED (Phase 6/9) — list, `new/`, `[jobId]/`
│   │   │                         (Phase 9: delivery status + retry-delivery UI)
│   │   ├── templates/            → IMPLEMENTED (Phase 5/9) — list, `new/`, `[templateId]/`
│   │   │                         (Phase 9: YouTube channel picker)
│   │   ├── files/                → IMPLEMENTED (Phase 4) — real gallery page
│   │   ├── youtube/               → IMPLEMENTED (Phase 9) — connect/list/disconnect
│   │   │                         YouTubeTarget management page (MANAGER+)
│   │   ├── users/                → role-gated (MANAGER+) PlaceholderPage or ForbiddenPage
│   │   └── departments/          → role-gated (ADMIN) PlaceholderPage or ForbiddenPage
│   └── api/
│       ├── health/route.ts       health check
│       ├── files/[fileId]/route.ts   binary content delivery (Phase 4) — plain handler,
│       │                             not defineRouteHandler; session- **or**
│       │                             Worker-authenticated (Phase 7, see boundaries.md)
│       ├── worker/v1/jobs/       IMPLEMENTED (Phase 7/9) — next/, [jobId]/,
│       │                         [jobId]/{state,progress,duration,result}/ — every route
│       │                         a thin defineRouteHandler over a Phase 6/9 use case;
│       │                         result/ (Phase 9) takes the raw video body, not JSON;
│       │                         _lib/build-file-url.ts (route-local helper, excluded
│       │                         from routing by its `_` prefix)
│       └── telegram/webhook/route.ts IMPLEMENTED (Phase 8) — the Telegram webhook, a thin
│                                 defineRouteHandler authenticated by
│                                 @/server/telegram-webhook-auth; delegates entirely to
│                                 features/telegram/bot/register.ts's registered bot
│
├── features/                     one folder per module (see features/README.md)
│   ├── auth/                     IMPLEMENTED (Phase 2) — schemas/, use-cases/
│   │                             (sign-in, sign-out), actions/, components/ (form, sign-out menu item)
│   ├── users/                    IMPLEMENTED (Phase 2/3/10) — domain/, repository/
│   │                             (credential lookup + the real management queries,
│   │                             Phase 10), use-cases/ (authorize-user-management.ts —
│   │                             Phase 3 policy; create-user, list-users,
│   │                             set-user-active-status, change-user-role — Phase 10
│   │                             wiring), schemas/, actions/, components/ (form, list
│   │                             item, toolbar, actions)
│   ├── departments/               IMPLEMENTED (Phase 4/5/9/10) — repository/ (the
│   │                             ADMIN-only picker reads, Phase 4/5/9, plus the real
│   │                             management queries, Phase 10) + read/, use-cases/
│   │                             (create-department, rename-department,
│   │                             list-departments-for-management), schemas/, actions/,
│   │                             components/ (departments-manager.tsx)
│   ├── files/                     IMPLEMENTED (Phase 4/5/7) — domain/, schemas/,
│   │                             repository/ (incl. findFileForWorkerServing —
│   │                             unscoped, Phase 7), use-cases/ (upload, list, get,
│   │                             delete, authorize-*, list-all-gallery-files-for-admin
│   │                             — Phase 5, get-file-for-worker-serving — Phase 7),
│   │                             actions/, components/ (form, toolbar, card, delete button)
│   ├── templates/                 IMPLEMENTED (Phase 5) — domain/ (template.ts,
│   │                             template-asset-rules.ts), schemas/, repository/,
│   │                             use-cases/ (create, update, get, list, set-status,
│   │                             soft-delete, verify-file-references,
│   │                             resolve-target-department), actions/, components/
│   │                             (form, asset editor, toolbar, list item, status actions)
│   ├── jobs/                      IMPLEMENTED (Phase 6/7) — domain/ (job.ts,
│   │                             job-state-machine.ts, build-job-title.ts,
│   │                             job-asset-rules.ts, legacy-state-mapping.ts and
│   │                             worker-job-payload.ts — Phase 7), schemas/ (incl.
│   │                             worker-transition.schema.ts — Phase 7), repository/
│   │                             (incl. the atomic claim + advisory-lock quota, and
│   │                             findJobById — unscoped, Phase 7), use-cases/ (create,
│   │                             get, list, cancel, retry, claim-next-job,
│   │                             transition-job, update-job-progress/duration,
│   │                             resolve-job-assets, get-template-for-job-form, and
│   │                             the Phase 7 Worker adapters get-job-for-worker.ts /
│   │                             transition-job-for-worker.ts), actions/, components/
│   │                             (create form, list item, actions, toolbar, status badge)
│   └── telegram/                  IMPLEMENTED (Phase 8) — domain/ (wizard.ts —
│                                 flow/step enums, advanceTrackCursor; callback-data.ts;
│                                 phone.ts), schemas/ (wizard-payload.schema.ts, reusing
│                                 jobs' job-asset-input.schema.ts), repository/
│                                 (telegram-repository.ts — User.phone/telegramUserId
│                                 lookups + TelegramWizardState CRUD, incl. the atomic
│                                 advanceWizardState conditional update), use-cases/
│                                 (resolve-telegram-identity, link-telegram-account,
│                                 load-active-wizard-state, pick-template,
│                                 enter-collection-phase, set-delivery-choice,
│                                 set-track-count, collect-asset-value, confirm-wizard,
│                                 cancel-wizard, cancel-all-jobs-for-telegram — several of
│                                 these import directly from features/jobs|templates|files
│                                 use-cases, the intended cross-feature pattern for this
│                                 one feature, see §3 below), bot/ (composer.ts — the
│                                 Telegraf Composer/adapter, no business logic;
│                                 register.ts — attaches the composer to the singleton bot
│                                 exactly once; keyboards.ts, messages.ts — pure
│                                 rendering; incoming.ts — downloads Telegram media into a
│                                 transport-neutral shape)
│   ├── youtube/                   IMPLEMENTED (Phase 9) — domain/ (youtube-target.ts),
│   │                             repository/ (youtube-target-repository.ts — the only
│   │                             module that selects token ciphertext), use-cases/
│   │                             (connect-youtube-target, list-youtube-targets,
│   │                             disconnect-youtube-target, get-valid-access-token,
│   │                             resolve-target-department), schemas/, actions/,
│   │                             components/ (youtube-targets-manager.tsx)
│   └── delivery/                  IMPLEMENTED (Phase 9) — domain/ (tag-substitution.ts),
│                                 repository/ (delivery-repository.ts — DeliveryAttempt
│                                 writes only; reads come from jobs/repository's own
│                                 SafeJobDetail.deliveryAttempts), use-cases/
│                                 (accept-job-result, generate-render-artifacts,
│                                 deliver-job-result, retry-job-delivery,
│                                 cleanup-job-artifacts), infrastructure/telegram
│                                 (telegram-delivery-adapter.ts — best-effort DM),
│                                 infrastructure/youtube (youtube-delivery-adapter.ts —
│                                 wraps features/youtube + server/adapters/youtube),
│                                 schemas/, actions/ (retry-job-delivery.action.ts) — a
│                                 second deliberate cross-feature-import exception
│                                 alongside Telegram's (§3 below): delivery is inherently
│                                 an orchestrator over Jobs/Files/Telegram/YouTube, not a
│                                 competing implementation
│
│   (every feature above is now implemented, Phase 10 — no placeholder-only feature
│   folder remains; `components/layout/placeholder-page.tsx` was removed as dead code
│   for the same reason)
│
├── components/
│   ├── ui/                       shadcn/ui primitives (owned, copied in)
│   ├── theme/                    theme-provider, theme-toggle  ("use client")
│   └── layout/                   app-sidebar, app-header, page-shell,
│                                 forbidden-page (Phase 3), pagination-link (Phase 5,
│                                 shared by Files/Templates/Users list pages)
│
├── hooks/
│   └── use-mobile.ts             (from shadcn, used by the sidebar)
│
├── lib/                          client-safe, dependency-light utilities
│   ├── utils.ts                  cn()
│   ├── roles.ts                  Role vocabulary (no server imports)
│   ├── site-config.ts            app name / metadata
│   └── navigation.ts             centralized nav definition + navigationForRole()
│
├── server/                      SERVER-ONLY infrastructure (every file imports "server-only")
│   ├── env.ts                    validated environment (@t3-oss/env-nextjs + zod)
│   ├── logger.ts                 structured logger + redaction
│   ├── errors/                   app-error.ts (model) + index.ts (toPublicError mapping)
│   ├── validation/              parseInput / safeParseInput / commonSchemas (zod)
│   ├── actions/                 defineAction() + ActionResult<T>
│   ├── api/                     defineRouteHandler() + healthResponse()
│   ├── auth/                    current-user.ts (BOUNDARY) + session.ts + password.ts — real session backend (ADR-0020)
│   ├── authz/                   authorize() / requireRole / assertSameDepartment /
│   │                             assertDepartmentScopeOrNotFound / departmentScopeFilter
│   │                             — BOUNDARY, real capability registry (ADR-0022, Phase 3)
│   ├── worker-auth/              authenticateWorker() — BOUNDARY, hashed WorkerApiKey
│   │                             lookup, Department-scoped (ADR-0040, Phase 11;
│   │                             supersedes the ADR-0032 static-key check)
│   ├── telegram-webhook-auth/    authenticateTelegramWebhook() — BOUNDARY, timing-safe
│   │                             TELEGRAM_WEBHOOK_SECRET check (ADR-0035, Phase 8)
│   ├── db/                      index.ts — the single PrismaClient instance
│   ├── adapters/storage/        StorageAdapter interface + LocalStorageAdapter (ADR-0024, Phase 4)
│   ├── adapters/telegram/       client.ts — getTelegramBot(), the singleton Telegraf
│   │                             instance (globalThis-cached, ADR-0035, Phase 8); returns
│   │                             null when TELEGRAM_BOT_TOKEN is unset (optional feature)
│   ├── adapters/media/          ffmpeg-adapter.ts — the only module that shells out for
│   │                             media processing (execFile, fixed argument array,
│   │                             ADR-0039, Phase 9)
│   ├── adapters/youtube/        youtube-client.ts — the only module that imports
│   │                             googleapis (ADR-0039, Phase 9); token-cipher.ts —
│   │                             AES-256-GCM encrypt/decrypt for YouTubeTarget tokens
│   └── media/                   probe.ts — sniffContentType / probeImageDimensions / hashContent (Phase 4)
│
├── types/                       cross-cutting client-safe types (Maybe, Paginated, Result)
│
└── test/
    └── stubs/empty-module.ts     vitest alias target for server-only/client-only
```

## 3. Layer responsibilities

| Layer                                 | May import                                                                                                                                         | Must NOT                                                                                              | Responsibility                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `app/` pages & layouts                | `features/*/ui`, `features/*/read`, `components/*`, `server/auth`                                                                                  | Prisma, business rules                                                                                | routing, layout, suspense/error boundaries, calling reads + actions                      |
| `app/api/**` route handlers           | `server/api`, `features/*/use-cases`, feature `server/` auth                                                                                       | business logic, Prisma directly                                                                       | parse + authenticate + validate + delegate + map to HTTP                                 |
| `features/*/actions` (`"use server"`) | `server/actions`, `features/*/use-cases`, feature `schemas`                                                                                        | business logic, Prisma directly                                                                       | `defineAction` wrappers — thin                                                           |
| `features/*/use-cases`                | feature `domain` + `repository`, `server/authz`, `server/errors`, adapters, **another feature's `repository` for a narrow, read-only cross-check** | `next/*` request APIs, transport types, another feature's `use-cases`/`domain`/`actions`/`components` | authorize, enforce invariants + state machine, orchestrate, transactions                 |
| `features/*/domain`                   | nothing (pure)                                                                                                                                     | any I/O                                                                                               | types, enums, state machines, invariant functions                                        |
| `features/*/repository`               | `server/db`, feature `domain`                                                                                                                      | business/authorization decisions (but applies dept-scope filters defensively)                         | CRUD + queries, row↔domain mapping, atomic ops                                           |
| `features/*/read`                     | `server/db` or repository, `server/auth`                                                                                                           | mutations                                                                                             | query functions / read models for pages (dept-scoped)                                    |
| `components/`, `components/ui/`       | React, `lib/*`, `types/*`                                                                                                                          | `@/server/*`, `server-only` (**ESLint-enforced**)                                                     | reusable UI; receives data as props                                                      |
| `lib/`, `types/`                      | each other, tiny libs                                                                                                                              | `@/server/*`, `next` server APIs                                                                      | pure client-safe helpers/types                                                           |
| `server/*`                            | each other, the wrapped lib/SDK                                                                                                                    | domain rules (in `env`/`logger`/`errors`)                                                             | env, logging, error mapping, action/route conventions, auth & authz boundaries, adapters |

**Cross-feature repository calls, established Phase 4/5/6:** a use case may import
another feature's `repository` module directly for a small, narrow, read-only lookup —
`features/files/use-cases/upload-file.ts` → `departments/repository` (does this department
exist), `features/templates/use-cases/*` → `files/repository` (does this File id resolve
in this department), `features/files/use-cases/authorize-file-management.ts` →
`templates/repository` (does any Template asset still default to this File) **and** →
`jobs/repository` (does any active Job asset still reference this File),
`features/jobs/use-cases/create-job.ts` → `templates/repository` (resolve and validate
the chosen Template) and → `files/repository` (via `resolve-job-assets.ts`, resolve each
referenced File). This is **not** the same as reaching into another feature's
`use-cases`, `domain`, or UI — those stay off-limits — and it is not a general "features
may import each other" license: each instance exists because one feature's data must be
validated against another's without duplicating that other feature's query logic, the
same reasoning Files → Departments already established.

**Telegram's cross-feature `use-cases` imports are a deliberate second pattern, not an
extension of the one above (Phase 8):** `features/telegram/use-cases/*` and
`features/telegram/bot/composer.ts` import directly from `features/jobs/use-cases`
(`createJob`, `getJob`, `listDepartmentJobs`, `retryJob`, `cancelJob`),
`features/templates/use-cases` (`getTemplateForJobForm`, `listDepartmentTemplates`), and
`features/files/use-cases` (`uploadFile`) — reaching into another feature's `use-cases`
layer, which the pattern above explicitly keeps off-limits everywhere else. This is
correct here specifically because Telegram **is** a second entry point onto those same
application services (docs/integrations/telegram.md's whole design), not a feature with
its own competing business logic — the alternative (Telegram re-implementing Job/Template/
File rules against their repositories directly) is exactly the duplicated-domain-logic
outcome CLAUDE.md §66 forbids. Do not use this as precedent for any other feature to import
another's `use-cases` — Telegram's role as a second UI surface over the existing
application layer is what justifies it, not a general relaxation of the rule above.

**`delivery`'s cross-feature imports are the same pattern's second, narrower instance
(Phase 9, ADR-0039):** `features/delivery/use-cases/*` imports
`features/jobs/use-cases/transition-job` (the state-machine primitive, never a raw
`db.job.update`), and reads/writes File bytes via `features/files/use-cases/
read-file-buffer-for-delivery.ts` and `create-job-artifact.ts`, and a User's linked
Telegram id via `features/telegram/repository/telegram-repository.ts`. This is correct
for the identical reason Telegram's is: `delivery` **is** the orchestrator that ties
Jobs/Files/Telegram/YouTube together after a render completes — it has no Job/File/
Telegram domain logic of its own to duplicate. `features/youtube` is a normal feature
(no cross-`use-cases` imports of its own) — `delivery` calls into
`features/youtube/use-cases/get-valid-access-token.ts` the same way it calls into
Telegram's repository, one directed edge, never the reverse.

## 4. Cross-cutting conventions

- **`@/` → `src/`** path alias (tsconfig + eslint + vitest).
- **`server-only`** guards every `src/server/*` module; ESLint blocks `@/server/*` and
  `server-only` imports from `components/**` and `features/**/components|ui/**`.
- **Prisma client**: single instance from `server/db` (when it exists); never
  `new PrismaClient()` in feature code.
- **Time & IDs** in use cases come from adapters (later), not `new Date()` /
  `crypto.randomUUID()` directly.
- **Errors**: use cases throw typed `AppError`s from `server/errors`; only the
  action/route helpers catch and map them.
- **Department scoping** is applied in use cases (authz) and defensively in
  repositories/reads.
