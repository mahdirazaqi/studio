# Development Conventions

## 1. Language & tooling

- **TypeScript strict mode** on, plus `noUncheckedIndexedAccess` and `noImplicitOverride`.
  `@typescript-eslint/no-explicit-any` is an **error** — no `any` without a written reason.
  Prefer `unknown` + narrowing.
- **npm** (bundled with Node 20, `npm >= 10`). `package-lock.json` committed; use
  `npm ci` in CI. ADR-0018.
- **Node** ≥ 20.9 (`.nvmrc` = 20).
- ESLint 9 (flat config) + Prettier 3. CI fails on lint errors and format drift.
- Path alias `@/` → `src/` (tsconfig + eslint + vitest).

### Scripts

| Command                                   | What                                                         |
| ----------------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                             | dev server                                                   |
| `npm run build` / `npm run start`         | production build / serve                                     |
| `npm run lint` / `npm run lint:fix`       | ESLint                                                       |
| `npm run typecheck`                       | `tsc --noEmit`                                               |
| `npm run format` / `npm run format:check` | Prettier                                                     |
| `npm run test` / `npm run test:watch`     | Vitest                                                       |
| `npm run check`                           | lint + typecheck + format:check + test (run before every PR) |

## 2. Layering discipline (enforced by convention + lint where possible)

See [../architecture/project-structure.md](../architecture/project-structure.md) and
[../architecture/server-client-boundary.md](../architecture/server-client-boundary.md)
for the full tables. Hard rules:

- **UI components never import `@/server/*` or `server-only`** — ESLint-enforced for
  `src/components/**` and `src/features/**/components|ui/**`. Data comes in as props.
- **Components / pages never import a repository or Prisma.**
- **Server Actions (`defineAction`) and Route Handlers (`defineRouteHandler`) never
  contain business logic** — they validate and delegate to a use case.
- **Use cases never import `next/*` request APIs** or transport types.
- **Only repositories import the Prisma client** (`@/server/db`).
- **Use cases get time and ids from adapters**, not `new Date()` / `crypto.randomUUID()`.
- **`process.env` is read only in `@/server/env`; logging only via `@/server/logger`.**
- A feature does not import another feature's internals; cross-feature needs go through a
  published use case or a `@/server/*` primitive.

## 3. Naming

- Files: kebab-case. Use-case files: `create-job.ts`, `claim-next-job.ts`.
- Server Action files: `*.action.ts`, exported function `createJobAction`.
- Types: PascalCase; domain types live in `features/<f>/domain`.
- Prisma models: PascalCase singular (`Job`, `Template`); tables snake_case plural via
  `@@map` (OPEN DECISION — or keep Prisma defaults).
- Enums: SCREAMING_SNAKE_CASE values (`QUEUED`, `GALLERY_ASSET`).

## 4. Errors

See [../architecture/error-handling.md](../architecture/error-handling.md).

- Use cases **throw** typed `AppError`s from `@/server/errors` via the constructors
  (`notFoundError()`, `forbiddenError()`, `validationError()`, `conflictError()`,
  `businessRuleError()`, `dependencyError()`, …). Discriminated by `kind`.
- Only `defineAction` / `defineRouteHandler` catch — via `toPublicError`. Actions →
  `{ ok: false, error }`; Route Handlers → `AppError.httpStatus` + `{ error, requestId }`.
- `internal` errors never expose their message; the `cause` is logged, not returned.
- Never let a raw Prisma error or stack trace reach a client (legacy leaked `E11000` and
  `CastError` as 500s — K9, K16). Repositories translate known DB errors.

## 5. Validation

- One Zod schema per use-case input, in `features/<f>/schemas/`.
- Parse at every boundary with `parseInput` (from `@/server/validation`) — Server Actions,
  Route Handlers, and (later) the Telegram adapter. A failure throws a `validation`
  `AppError` with `fieldErrors`.
- The client form may reuse the same schema for UX, but **server-side validation is
  authoritative and non-optional**.

## 6. Authorization

- Every use case's first step: `authorize(actor, capability, resource?)`.
- Repositories/read functions take the `actor` and apply department scoping defensively.
- Tests must include a "wrong department" and "wrong role" case for every use case.

## 7. Database

- All schema changes via Prisma Migrate; migrations committed.
- No migration may hard-delete a Job or hard-delete a Template (lifecycle rules).
- Multi-step writes run in a transaction (see [../data/database.md](../data/database.md) §5).
- The job-claim query uses `FOR UPDATE SKIP LOCKED`.

## 8. Security (always)

Follow [../security/security.md](../security/security.md). The recurring ones:

- No `child_process.exec` with a string — `execFile`/`spawn` + arg array only.
- No user input in filesystem paths or storage keys.
- Validate file uploads by content type + size; generated stored names.
- Secrets from env; never commit real secrets; never reuse the legacy repo's secrets.

## 9. Testing

- **Vitest.** Test files are `*.test.ts` co-located with the code. `server-only` /
  `client-only` are aliased to an empty stub (`vitest.config.ts`) so server modules are
  testable.
- **Phase 1** covers the foundation only: `cn`, roles, the navigation filter, the error
  model and `toPublicError` (verified no-leak), `parseInput`, and logger redaction.
- **Unit tests** for every use case (happy path + authorization failures + invariant
  violations) and for the Job state-machine transition map.
- **Integration tests** for: the atomic job claim under concurrency, the Worker API
  endpoints (auth + validation + state mapping), retry non-destructiveness, historical
  integrity (edit template / delete file → old job still opens).
- Adapters mocked in use-case tests; real Postgres (test container) for integration.
- No E2E in Phase 1.
- The legacy module had **zero tests** (K28) — Studio does not repeat that.

## 10. Commits & branches

- Work on a branch, not the default branch.
- Conventional-commit style messages preferred.
- Reference the ADR / doc section that governs the change in the PR description.
- End commit messages with the co-author trailer as configured for this repo.

## 11. Documentation as part of "done"

A change is not done until:

- the relevant `docs/` page reflects the new behavior,
- any new architectural decision is in `docs/architecture/decisions.md`,
- any new unknown is in `docs/development/open-decisions.md`,
- `CLAUDE.md` still points at the right places.
