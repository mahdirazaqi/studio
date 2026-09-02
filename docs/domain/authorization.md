# Domain: Authorization

**`DECIDED`** — ADR-0011. Every rule here is enforced **server-side** in the
application/use-case layer, with defensive department filtering in repositories. **The UI
never enforces authorization.**

## 1. Principals

| Principal | Identity established by | Authorization |
|---|---|---|
| Human operator (web) | Session (login) | Role + Department of the `User` |
| Telegram user | Phone-linked `User` | **Identical** to that `User`'s role + department |
| Render Worker | Service credential (ADR-0004) | A dedicated non-user principal with a fixed, narrow capability set (Worker API only) |

The Worker principal is **not** a `User`, has no Department, and can only call the Worker
API use cases (claim/progress/state/duration/result/input-upload). It cannot read the
panel, list jobs arbitrarily, or touch users/templates.

## 2. Roles

| Role | Scope | Summary |
|---|---|---|
| `USER` | Own Department | Normal operator: work with Jobs, Files, and permitted Templates in their department. |
| `MANAGER` | Own Department | Everything a USER can do, plus manage that department's Users, Templates, Jobs, and Files, and department-level operations. |
| `ADMIN` | System-wide | Everything, in every Department, plus system administration (Departments, all Users). |

There is no per-action custom role system (legacy had `role.actions[]`). Studio uses
these three fixed roles. If finer granularity is ever needed, that is a new ADR.

## 3. Permission matrix

Legend: ✅ allowed · 🟨 allowed, own department only · ⬛ not allowed · — n/a

| Capability | USER | MANAGER | ADMIN | Notes |
|---|---|---|---|---|
| **Auth** | | | | |
| Sign in | ✅ | ✅ | ✅ | Only if `status = ACTIVE`. |
| **Departments** | | | | |
| View own department | ✅ | ✅ | ✅ | |
| List all departments | ⬛ | ⬛ | ✅ | |
| Create / rename department | ⬛ | ⬛ | ✅ | |
| Archive / deactivate department | ⬛ | ⬛ | ✅ | Deletion policy = OPEN DECISION. |
| **Users** | | | | |
| View users | ⬛ | 🟨 | ✅ | |
| Create user | ⬛ | 🟨 (role USER; MANAGER? = OPEN DECISION) | ✅ | |
| Disable / re-enable user | ⬛ | 🟨 (USERs only) | ✅ | Never physical delete. |
| Change a user's role | ⬛ | 🟨 (OPEN DECISION — see users.md) | ✅ | |
| Change a user's department | ⬛ | ⬛ | ✅ (OPEN DECISION — reassignment) | |
| **Templates** | | | | |
| View / list templates | 🟨 | 🟨 | ✅ | Soft-deleted templates hidden from pickers for all; visible in management views to MANAGER/ADMIN. |
| Create template | 🟨 (OPEN DECISION) | 🟨 | ✅ | See below. |
| Edit template | 🟨 (OPEN DECISION) | 🟨 | ✅ | Edits never alter existing Jobs (snapshots). |
| Disable template | ⬛ | 🟨 | ✅ | |
| Soft-delete template | ⬛ | 🟨 | ✅ | No hard delete exists. |
| **Files / Gallery** | | | | |
| Upload file | ✅ | ✅ | ✅ | Into own department (ADMIN: any). |
| Browse / reuse gallery files | 🟨 | 🟨 | ✅ | |
| Delete a Persistent Gallery Asset | 🟨 (own uploads? OPEN DECISION) | 🟨 | ✅ | Only when safe (no required dependency). |
| Delete a Job Artifact manually | ⬛ | 🟨 | ✅ | Normally automatic. |
| **Jobs** | | | | |
| View / list jobs | 🟨 | 🟨 | ✅ | |
| Create job | 🟨 | 🟨 | ✅ | |
| Cancel job | 🟨 (own? OPEN DECISION) | 🟨 (any in dept) | ✅ | Only from a cancelable state. |
| Retry job | 🟨 (own? OPEN DECISION) | 🟨 (any in dept) | ✅ | Creates a new linked job; original untouched. |
| Delete job | ⬛ | ⬛ | ⬛ | **Nobody. Ever.** (ADR-0005) |
| **Worker API** | — | — | — | Only the Worker principal. No human role can call it. |

> **`OPEN DECISION` — USER vs MANAGER split on Templates.** Does a plain USER author and
> edit Templates, or only consume them? *Consequence of "USER can author":* faster for
> small teams, but templates are powerful (they define render + delivery) and a bad
> template affects everyone in the department. *Consequence of "MANAGER+ only":* safer,
> clearer ownership, matches "MANAGER manages templates" from the brief. The brief lists
> template management under MANAGER and ADMIN explicitly and lists USER as working "with
> Templates according to authorization rules" — leaning toward **USER consumes, MANAGER
> authors**, but this must be confirmed.

> **`OPEN DECISION` — "own resource" scope for USER.** For cancel/retry/delete-own-file,
> is a USER limited to resources **they created**, or any resource in their department?
> *Consequence of "own only":* least privilege, but awkward when a colleague is away.
> *Consequence of "whole department":* collaborative, matches how MANAGER works, simpler
> to reason about. Recommended pending decision: **whole department for view; own-or-
> department for cancel/retry (confirm); MANAGER+ for destructive file ops.**

## 4. Enforcement requirements

1. **Every use case starts by authorizing the actor** for the specific capability and the
   specific resource's department. No use case trusts its caller.
2. **404 over 403** for cross-department access to a specific resource, to avoid leaking
   which ids exist in other departments.
3. **List endpoints always pass a department filter** unless the actor is ADMIN.
4. **Server Actions and Route Handlers both** go through the same authorized use case.
5. **Telegram** resolves to a `User` and runs the same checks — a Telegram user with role
   USER cannot do MANAGER things, and cannot touch other departments.
6. **Session invalidation on disable** — disabling a user or archiving a department takes
   effect immediately.
7. **Audit** every privileged action (user disable, role change, template delete, job
   cancel/retry, department archive) with actor, target, timestamp.

## 5. What legacy did wrong here (do not repeat)

- Render module passed **no** access filters → every user saw every Template/Job/File.
- Telegram surface enforced **no** permissions → any linked user could cancel every job
  in the entire system.
- Worker REST endpoints had **no** auth at all.

See [../legacy/known-issues.md](../legacy/known-issues.md).
