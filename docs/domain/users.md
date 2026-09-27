# Domain: Users

## Purpose

A **User** is a person who operates Studio, through the web panel or the Telegram bot.

## Rules

- **Every User belongs to exactly one Department.** (`departmentId`, required.)
- **Every User has exactly one role:** `USER`, `MANAGER`, or `ADMIN`. See
  [authorization.md](authorization.md).
- **Users are never physically deleted** (ADR-0007). Lifecycle is a status:
  - `ACTIVE` — can authenticate and act.
  - `DISABLED` — cannot authenticate or act; all historical references remain intact;
    can be re-enabled.
- **User deletion is not a business operation.** "Remove user" in the UI = disable.
- A User may be **linked to a Telegram account** (see below). The link is identity only;
  it grants no extra privileges.

## Fields

Final schema: [`prisma/schema.prisma`](../../prisma/schema.prisma). Rationale:
[../architecture/database.md](../architecture/database.md).

**Implemented (Phase 2):** `id`, `email` (unique login identifier), `fullName`,
`passwordHash`, `role`, `departmentId` (required), `status`, `createdAt`, `updatedAt`. See
[../architecture/authentication.md](../architecture/authentication.md) for how
`passwordHash`/`status` gate login.

**Implemented (Phase 8, ADR-0036):** `phone` (nullable, `@unique`, digits-only normalized
— `features/telegram/domain/phone.ts`'s `normalizePhone`), `telegramUserId` (nullable,
`@unique`, set once by `features/telegram/use-cases/link-telegram-account.ts`).

**Implemented (Phase 20, ADR-0051):** a self-service and admin/manager editing UI for
`fullName`/`phone` — see "Profile editing" below. `telegramUserId` still has no editing
UI (it's set only by the Telegram linking flow itself, never directly); `phone` now does.

**Not yet implemented** — added when the feature that needs them lands:

| Field                            | Notes                        | Lands with                   |
| -------------------------------- | ---------------------------- | ---------------------------- |
| `disabledAt`, `disabledByUserId` | Audit of the disable action. | User management / disable UI |

> **`OPEN DECISION` — ADMIN and Departments.** An ADMIN still has a `departmentId` for
> their "home" department, but their authority is system-wide. Whether ADMIN can exist
> without a department, and whether there is a special "system" department, is undecided.
> _Consequence of "ADMIN needs a home department":_ simpler model, every user is
> scoped somewhere. _Consequence of "ADMIN is department-less":_ needs null handling on
> `departmentId` everywhere.
>
> **Phase 2 schema note:** `User.departmentId` is a required (`NOT NULL`) column for
> every role, including `ADMIN` — the "every user has exactly one Department" reading of
> CLAUDE.md §5. This isn't a final ruling on whether ADMIN's department carries any
> special meaning beyond "home"; it only means the schema doesn't need nullable-department
> handling. Revisit if a concrete requirement needs a department-less ADMIN.

## Telegram linkage — implemented, Phase 8 (ADR-0036)

- A Telegram user proves identity by sharing their phone number with the bot (Telegram's
  native "share contact" button — never a typed number, and never accepted from a
  forwarded contact card belonging to someone else).
- Studio matches the phone against `User.phone`. On a match, it sets `telegramUserId`.
  `User.phone` is `@unique`, so this match is never ambiguous (resolves OD-06) — the only
  real "no match" outcome gets one generic, safe rejection message.
- **Legacy behavior preserved:** phone-based linking, no separate password/OTP for
  Telegram.
- **Legacy behavior changed:** after linking, the Telegram user is subject to the full
  role + department authorization model — not an unchecked "any linked user can do
  anything" surface. See [known-issues.md](../legacy/known-issues.md) item on Telegram
  permissions.
- See [../integrations/telegram.md](../integrations/telegram.md) for the full mechanism.

## Creation

- **MANAGER** can create Users **in their own Department** with role `USER` or `MANAGER`.
- **ADMIN** can create Users in any Department with any role.
- A **USER** cannot create Users.

> **`OPEN DECISION` — can a MANAGER create another MANAGER?** _Consequence of yes:_
> managers can fully delegate; risk of privilege sprawl within a department.
> _Consequence of no:_ only ADMIN mints managers; tighter control, more admin load.
>
> **Implemented, Phase 10** (`features/users/use-cases/create-user.ts`, `/users/new`):
> the authorization policy (`assertCanCreateUserWithRole`,
> [../architecture/authorization.md](../architecture/authorization.md)) takes the
> conservative reading until OD-05 is decided: a MANAGER may create a `USER` only, in
> their own Department; ADMIN may create any role in any Department. A brand-new User is
> always `ACTIVE`; the password is set once at creation (bcrypt-hashed before it ever
> reaches the repository) — there is no separate "invite" flow.

## Profile editing — implemented, Phase 20 (ADR-0051)

Two entry points, one write path (`features/users/use-cases/update-user-profile.ts`,
`features/users/repository/user-repository.ts`'s `updateUserProfile`) — `fullName`/
`phone` only, ever. `role`/`departmentId`/`status`/`email` are structurally unreachable
here: `updateUserProfileSchema` has no such fields, so a client-submitted one is stripped
by Zod before the use case ever runs (same pattern as `templateInputSchema` having no
`departmentId`, CLAUDE.md §10).

- **`/profile`** — every authenticated User, `USER` role included, edits their own
  `fullName`/`phone`. No `authorize()`/capability check at all for this path — it's
  identity-based (`actor.userId === targetUserId`), not role-gated; a plain `USER` has no
  `user:manage`/`user:view` capability but can still always reach this. Department/role/
  status are shown read-only on the same page.
- **`/users/[userId]/edit`** — MANAGER/ADMIN editing **another** user's `fullName`/
  `phone`, via `assertCanEditProfile`
  ([../architecture/authorization.md](../architecture/authorization.md)): the same shape
  as `assertCanSetActiveStatus` — MANAGER may only touch a `USER`-role target in their own
  Department, ADMIN may touch anyone. Role/active-status changes on this same page reuse
  the existing, unmodified `UserActions` component/actions — never a second copy of that
  logic.
- **Phone validation**: `phone` is normalized through the exact same
  `features/telegram/domain/phone.ts`'s `normalizePhone` Telegram's own "share contact"
  linking already uses — a manually-entered phone number is guaranteed to normalize
  identically to what a later Telegram link attempt expects. Plausibility is 7–15 digits
  after stripping formatting (E.164's own upper bound), rejecting obvious garbage without
  a full phone-parsing library. An empty value clears `phone` back to `null` — a User
  having no phone remains a fully valid state (unchanged since Phase 8).
- **No SMS/OTP verification of any kind** — entering a phone number here does not prove
  ownership of it; only the existing Telegram "share contact" flow does that (unchanged).
- **Uniqueness**: `phone` was already `@unique` since Phase 8 — a duplicate submission is
  caught (`P2002`) and turned into a clean `conflict` error
  ("This phone number is already associated with another user."), never a raw Prisma
  error, same pattern `createUser`'s duplicate-email handling already uses.

## Disabling

- **MANAGER** can disable `USER`s in their own Department.
- **ADMIN** can disable anyone (except, by policy, the last active ADMIN — OPEN DECISION
  on safeguard).
- Disabling immediately invalidates the user's sessions and blocks Telegram actions.
- In-flight Jobs created by the user continue; the user simply can no longer act.

> **Implemented, Phase 10** (`features/users/use-cases/set-user-active-status.ts`,
> `change-user-role.ts`, the `/users` list page's row actions): "MANAGER can disable
> USERs" is implemented literally — a MANAGER cannot disable a peer MANAGER even in their
> own Department, only a `USER`-role account (`assertCanSetActiveStatus`). **Nobody can
> disable/re-enable or change the role of their own account**, including ADMIN
> (verified against the real database) — this closes the entire "accidental ADMIN
> lockout" question for these two operations without needing a "last remaining ADMIN"
> count check; that kind of safeguard for other paths (e.g. a bulk operation, if one is
> ever built) remains `OPEN DECISION` (OD-47). Changing an _existing_ user's role is
> ADMIN-only regardless of actor — the matrix's MANAGER cell for that operation is itself
> `OPEN DECISION` (OD-05), so the code denies it entirely rather than guessing a partial
> rule. Both operations are idempotent (setting a status/role a user already has is a
> no-op, not an error) and department-scoped via `findUserInScope` (folds "doesn't exist"
> and "exists in another department" into the same `not_found`, matching every other
> feature's 403-vs-404 convention).

## What Users own

A User is the `createdBy` of Jobs, Templates, and Files they create, and the
`retriedBy` / `canceledBy` / `disabledBy` actor on the relevant records. These references
are permanent and must always resolve (ADR-0009).
