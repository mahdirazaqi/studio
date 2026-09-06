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
`@unique`, set once by `features/telegram/use-cases/link-telegram-account.ts`). Neither
field has a self-service or admin editing UI yet — `phone` is set today only via
`prisma db seed`'s optional `SEED_ADMIN_PHONE` or a direct administrative write, pending a
real user-management phase; Phase 8's own scope was the linking _mechanism_, not a
phone-editing surface (see ADR-0036 for why this is a deliberate boundary, not a gap).

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
> **Phase 3 implementation note:** the authorization policy
> (`assertCanCreateUserWithRole`, [../architecture/authorization.md](../architecture/authorization.md))
> takes the conservative reading until this is decided: a MANAGER may create a `USER`
> only. No user-creation use case exists yet to exercise this either way.

## Disabling

- **MANAGER** can disable `USER`s in their own Department.
- **ADMIN** can disable anyone (except, by policy, the last active ADMIN — OPEN DECISION
  on safeguard).
- Disabling immediately invalidates the user's sessions and blocks Telegram actions.
- In-flight Jobs created by the user continue; the user simply can no longer act.

> **Phase 3 implementation note:** "MANAGER can disable USERs" is implemented literally —
> a MANAGER cannot disable a peer MANAGER even in their own Department, only a `USER`-role
> account (`assertCanSetActiveStatus`). **Nobody can disable/re-enable or change the role
> of their own account**, including ADMIN — this closes the entire "accidental ADMIN
> lockout" question for these two operations without needing a "last remaining ADMIN"
> count check; that kind of safeguard for other paths (e.g. a bulk operation, if one is
> ever built) remains `OPEN DECISION`. Changing an _existing_ user's role is currently
> ADMIN-only regardless of actor — the matrix's MANAGER cell for that operation is itself
> `OPEN DECISION`, so the code denies it entirely rather than guessing a partial rule.

## What Users own

A User is the `createdBy` of Jobs, Templates, and Files they create, and the
`retriedBy` / `canceledBy` / `disabledBy` actor on the relevant records. These references
are permanent and must always resolve (ADR-0009).
