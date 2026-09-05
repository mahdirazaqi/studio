# Error Handling

## Error model

`src/server/errors/app-error.ts` defines **one** error class, `AppError`, discriminated
by `kind`:

| kind              | HTTP | exposed message? | meaning                                                    |
| ----------------- | ---- | ---------------- | ---------------------------------------------------------- |
| `validation`      | 422  | yes              | input failed a schema/precondition (carries `fieldErrors`) |
| `unauthenticated` | 401  | yes              | no valid session / credential                              |
| `forbidden`       | 403  | yes              | authenticated but not allowed                              |
| `not_found`       | 404  | yes              | resource does not exist (or is hidden)                     |
| `conflict`        | 409  | yes              | state / uniqueness conflict                                |
| `rate_limited`    | 429  | yes              | too many requests                                          |
| `business_rule`   | 422  | yes              | a domain rule rejected the operation                       |
| `dependency`      | 503  | yes              | a downstream/external dependency failed                    |
| `internal`        | 500  | **no**           | unexpected — message is always generic                     |

Convenience constructors: `validationError()`, `notFoundError()`, `forbiddenError()`,
`conflictError()`, `businessRuleError()`, `dependencyError()`, `internalError()`, …

## Boundary mapping

`src/server/errors/index.ts`:

- `toAppError(unknown)` — normalizes any thrown value; unknowns become an opaque
  `internal` error with the original attached as `cause` (for logging only).
- `toPublicError(unknown, context?)` — returns a `PublicError`
  (`{ kind, code, message, fieldErrors?, details? }`) and logs:
  - `internal` → logged at **error** with full detail; returned message is generic.
  - everything else → logged at **warn**; safe message passed through.

`PublicError` is the **only** error shape that crosses a trust boundary. It never carries
a stack trace, `cause`, SQL, secrets, or internal paths.

## Who maps what

| Transport                     | Mechanism                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| Server Action                 | `defineAction` catches → `{ ok: false, error: PublicError }`                               |
| Route Handler                 | `defineRouteHandler` catches → `{ error: PublicError, requestId }` + `AppError.httpStatus` |
| Server Component render error | Next.js `error.tsx` boundary                                                               |

## UI error boundaries (App Router)

| File                              | Scope                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `src/app/global-error.tsx`        | Root layout itself failed. Self-contained HTML, inline styles, no app shell. |
| `src/app/error.tsx`               | Any segment without a closer boundary (e.g. the `(auth)` group).             |
| `src/app/(dashboard)/error.tsx`   | Dashboard routes — keeps the sidebar/header, offers "Try again".             |
| `src/app/not-found.tsx`           | 404.                                                                         |
| `src/app/(dashboard)/loading.tsx` | Dashboard route loading skeleton.                                            |

None of these render error internals. Next.js strips messages from production `error`
objects; we additionally never echo `error.message`, only the `digest` reference id.

## Rules

- Use cases **throw** typed `AppError`s. They do not return error results.
- Never `catch` and swallow — let it reach the boundary helper (legacy K13 swallowed
  failure reasons).
- Never leak a raw Prisma/driver error (legacy K9/K16 surfaced `E11000` / `CastError` as
  500s). Repositories translate known DB errors into `conflict` / `not_found`.
