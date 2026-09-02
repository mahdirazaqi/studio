# Development Conventions

## 1. Language & tooling

- **TypeScript strict mode** on. No `any` without a written reason. Prefer `unknown` +
  narrowing.
- ESLint + Prettier; CI fails on lint errors and format drift.
- Node LTS; package manager choice = OPEN DECISION (pin one, commit the lockfile).
- Path alias `@/` → `src/`.

## 2. Layering discipline (enforced by convention + lint where possible)

See [../architecture/project-structure.md](../architecture/project-structure.md) for the
full table. Hard rules:

- **Components / pages never import a repository or Prisma.**
- **Server Actions and Route Handlers never contain business logic** — they validate and
  delegate to a use case.
- **Use cases never import `next/*` request APIs** or transport types.
- **Only repositories import the Prisma client** (`server/db`).
- **Use cases get time and ids from adapters** (`server/adapters/clock`, `.../id`), never
  `new Date()` / `crypto.randomUUID()` directly.
- A feature does not import another feature's internals; cross-feature needs go through a
  published use case or a `server/` primitive.

## 3. Naming

- Files: kebab-case. Use-case files: `create-job.ts`, `claim-next-job.ts`.
- Server Action files: `*.action.ts`, exported function `createJobAction`.
- Types: PascalCase; domain types live in `features/<f>/domain`.
- Prisma models: PascalCase singular (`Job`, `Template`); tables snake_case plural via
  `@@map` (OPEN DECISION — or keep Prisma defaults).
- Enums: SCREAMING_SNAKE_CASE values (`QUEUED`, `GALLERY_ASSET`).

## 4. Errors

- Use cases throw typed errors from `server/errors`: `NotFoundError`, `ForbiddenError`,
  `ValidationError`, `ConflictError`, `DependencyError` (e.g. file in use),
  `StateTransitionError`.
- Route Handlers map them to status codes (`404`, `403`/`404`, `422`, `409`, `409`,
  `409`). Server Actions map them to `{ ok: false, error }`.
- Never let a raw Prisma error or stack trace reach a client (legacy leaked `E11000` and
  `CastError` as 500s — K9, K16).

## 5. Validation

- One Zod schema per use-case input, in `features/<f>/validation`.
- Both the Server Action / Route Handler **and** (optionally) the client form use it.
- Server-side validation is authoritative and non-optional.

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

- **Unit tests** for every use case (happy path + authorization failures + invariant
  violations) and for the Job state-machine transition map.
- **Integration tests** for: the atomic job claim under concurrency, the Worker API
  endpoints (auth + validation + state mapping), retry non-destructiveness, historical
  integrity (edit template / delete file → old job still opens).
- Adapters mocked in use-case tests; real Postgres (test container) for integration.
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
