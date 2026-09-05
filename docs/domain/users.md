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

## Fields (final schema: [`prisma/schema.prisma`](../../prisma/schema.prisma); rationale:

[../architecture/database.md](../architecture/database.md))

**Implemented (Phase 2):** `id`, `email` (unique login identifier), `fullName`,
`passwordHash`, `role`, `departmentId` (required), `status`, `createdAt`, `updatedAt`. See
[../architecture/authentication.md](../architecture/authentication.md) for how
`passwordHash`/`status` gate login.

**Not yet implemented** — added when the feature that needs them lands:

| Field                            | Notes                                                        | Lands with                   |
| -------------------------------- | ------------------------------------------------------------ | ---------------------------- |
| `phone`                          | Used to link a Telegram account (match on phone). Optional.  | Telegram integration         |
| `telegramUserId`                 | Nullable. Set when the user links Telegram. Unique when set. | Telegram integration         |
| `disabledAt`, `disabledByUserId` | Audit of the disable action.                                 | User management / disable UI |

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

## Telegram linkage

- A Telegram user proves identity by sharing their phone number with the bot.
- Studio matches the phone against `User.phone`. On a unique match, it sets
  `telegramUserId`.
- **Legacy behavior preserved:** phone-based linking, no separate password/OTP for
  Telegram.
- **Legacy behavior changed:** after linking, the Telegram user is subject to the full
  role + department authorization model — not an unchecked "any linked user can do
  anything" surface. See [known-issues.md](../legacy/known-issues.md) item on Telegram
  permissions.

> **`OPEN DECISION` — ambiguous / no phone match.** If zero or multiple Users share the
> phone number, what happens? _Options:_ reject with a generic message (legacy behavior,
> safe); require an admin to link manually; support an invite/claim token flow.

## Creation

- **MANAGER** can create Users **in their own Department** with role `USER` or `MANAGER`.
- **ADMIN** can create Users in any Department with any role.
- A **USER** cannot create Users.

> **`OPEN DECISION` — can a MANAGER create another MANAGER?** _Consequence of yes:_
> managers can fully delegate; risk of privilege sprawl within a department.
> _Consequence of no:_ only ADMIN mints managers; tighter control, more admin load.

## Disabling

- **MANAGER** can disable `USER`s in their own Department.
- **ADMIN** can disable anyone (except, by policy, the last active ADMIN — OPEN DECISION
  on safeguard).
- Disabling immediately invalidates the user's sessions and blocks Telegram actions.
- In-flight Jobs created by the user continue; the user simply can no longer act.

## What Users own

A User is the `createdBy` of Jobs, Templates, and Files they create, and the
`retriedBy` / `canceledBy` / `disabledBy` actor on the relevant records. These references
are permanent and must always resolve (ADR-0009).
