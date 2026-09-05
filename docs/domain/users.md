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

## Fields (conceptual — final schema in [../data/database.md](../data/database.md))

| Field                            | Notes                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `id`                             | Stable primary key; referenced by Jobs, Templates, audit entries, retries — forever. |
| `email`                          | Unique. Login identifier.                                                            |
| `fullName`                       | Display name.                                                                        |
| `phone`                          | Used to link a Telegram account (match on phone). Optional.                          |
| `passwordHash`                   | If password auth is used. Auth mechanism = OPEN DECISION.                            |
| `role`                           | `USER` \| `MANAGER` \| `ADMIN`.                                                      |
| `departmentId`                   | Required.                                                                            |
| `status`                         | `ACTIVE` \| `DISABLED`.                                                              |
| `telegramUserId`                 | Nullable. Set when the user links Telegram. Unique when set.                         |
| `createdAt`, `updatedAt`         |                                                                                      |
| `disabledAt`, `disabledByUserId` | Audit of the disable action.                                                         |

> **`OPEN DECISION` — ADMIN and Departments.** An ADMIN still has a `departmentId` for
> their "home" department, but their authority is system-wide. Whether ADMIN can exist
> without a department, and whether there is a special "system" department, is undecided.
> _Consequence of "ADMIN needs a home department":_ simpler model, every user is
> scoped somewhere. _Consequence of "ADMIN is department-less":_ needs null handling on
> `departmentId` everywhere.

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
