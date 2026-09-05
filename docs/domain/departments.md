# Domain: Departments

## Purpose

A **Department** is Studio's ownership and isolation boundary. It replaces the legacy
**Workspace** concept — but unlike the legacy render module, department scoping is
**actually enforced** (ADR-0011).

## Rules

- **Every scoped resource belongs to exactly one Department:**
  - `User.departmentId`
  - `Template.departmentId`
  - `Job.departmentId`
  - `File.departmentId`
- **USER** and **MANAGER** may only see and act on resources in **their own Department**.
- **ADMIN** may see and act on resources in **all Departments**.
- Department scoping is enforced:
  1. in the **application/use-case layer** (primary authorization decision), and
  2. defensively in **repositories / read functions** (every scoped query filters by the
     actor's department unless the actor is ADMIN).
- **The UI filtering by department is never the enforcement mechanism.**

## Fields (conceptual)

| Field                    | Notes                                           |
| ------------------------ | ----------------------------------------------- |
| `id`                     | Referenced by all scoped resources — permanent. |
| `name`                   | Unique, display name.                           |
| `status`                 | `ACTIVE` \| (see deletion decision below).      |
| `createdAt`, `updatedAt` |                                                 |

## Resource assignment

- A resource's Department is set **at creation** from the actor's context:
  - A USER/MANAGER creating a Job/Template/File → that resource's `departmentId` = the
    actor's `departmentId`.
  - An ADMIN creating a resource must specify the target Department.
- **Moving a resource between Departments** is not a supported operation.
  > **`OPEN DECISION` — cross-department move / reassignment.** _Consequence of "not
  > supported":_ simplest, no historical ambiguity. _Consequence of "ADMIN can
  > reassign":_ useful for reorganizations but complicates historical reporting (a Job's
  > department could change after the fact) — if allowed, the change must be audited and
  > arguably snapshotted on the Job.

## Enforcement pattern (for implementers)

Every use case receives an `actor` context: `{ userId, role, departmentId }`.

- **Read of a specific resource:** load it, then assert
  `role === ADMIN || resource.departmentId === actor.departmentId`, else `NotFoundError`
  (prefer 404 over 403 to avoid leaking existence).
- **List:** pass `role === ADMIN ? undefined : actor.departmentId` as a mandatory filter
  to the repository.
- **Create:** derive `departmentId` from actor (or explicit for ADMIN).
- **Mutate:** same check as read, before applying the change.

## Department deletion

> **`OPEN DECISION` — Department deletion policy.** Not finalized; do not implement a
> delete path.
>
> Constraints that make this hard:
>
> - **Jobs are never deleted** (ADR-0005). A Department with historical Jobs cannot be
>   cleanly removed without either keeping its data or violating that rule.
> - Users are never deleted (ADR-0007); Templates are only soft-deleted (ADR-0006).
>
> Options and consequences:
>
> | Option                                         | Consequence                                                                                                                                                                   |
> | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | **Soft-deactivate only** (`status = ARCHIVED`) | Department stops accepting new resources/logins; all history stays queryable by ADMIN. Simple, safe, no data loss. Likely the default.                                        |
> | **Hard delete forbidden entirely**             | Same as above but even the concept is absent.                                                                                                                                 |
> | **Hard delete with reassignment**              | Requires moving/absorbing all Jobs/Templates/Files/Users into another Department first — contradicts "no cross-department move" unless that is also decided. High complexity. |
> | **Hard delete with cascade**                   | Violates ADR-0005/0007. Not acceptable.                                                                                                                                       |
>
> Recommended pending decision: **soft-deactivate (`ARCHIVED`) only.**

## Not a "Channel"

The legacy term _Channel_ refers to a connected **YouTube channel**, not a Department.
Studio keeps the YouTube-target concept in [../integrations/youtube.md](../integrations/youtube.md).
A Department is purely an internal org/isolation unit.
