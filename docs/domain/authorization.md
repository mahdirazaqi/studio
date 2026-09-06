# Domain: Authorization

**`DECIDED`** — ADR-0011. Every rule here is enforced **server-side** in the
application/use-case layer, with defensive department filtering in repositories. **The UI
never enforces authorization.**

**Implemented, Phase 3.** This page is the business-rule source of truth (the matrix
below); [../architecture/authorization.md](../architecture/authorization.md) documents
the actual mechanism (`@/server/authz`'s capability registry, department-scope helpers,
the user-management escalation rules) and how to use it from a new feature. ADR-0022/
ADR-0023.

## 1. Principals

| Principal            | Identity established by       | Authorization                                                                        |
| -------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| Human operator (web) | Session (login)               | Role + Department of the `User`                                                      |
| Telegram user        | Phone-linked `User`           | **Identical** to that `User`'s role + department                                     |
| Render Worker        | Service credential (ADR-0004) | A dedicated non-user principal with a fixed, narrow capability set (Worker API only) |

The Worker principal is **not** a `User`, has no Department, and can only call the Worker
API use cases (claim/progress/state/duration/result/input-upload). It cannot read the
panel, list jobs arbitrarily, or touch users/templates.

## 2. Roles

| Role      | Scope          | Summary                                                                                                                     |
| --------- | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `USER`    | Own Department | Normal operator: work with Jobs, Files, and permitted Templates in their department.                                        |
| `MANAGER` | Own Department | Everything a USER can do, plus manage that department's Users, Templates, Jobs, and Files, and department-level operations. |
| `ADMIN`   | System-wide    | Everything, in every Department, plus system administration (Departments, all Users).                                       |

There is no per-action custom role system (legacy had `role.actions[]`). Studio uses
these three fixed roles. If finer granularity is ever needed, that is a new ADR.

## 3. Permission matrix

Legend: ✅ allowed · 🟨 allowed, own department only · ⬛ not allowed · — n/a

| Capability                        | USER                            | MANAGER                                  | ADMIN                             | Notes                                                                                                |
| --------------------------------- | ------------------------------- | ---------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Auth**                          |                                 |                                          |                                   |                                                                                                      |
| Sign in                           | ✅                              | ✅                                       | ✅                                | Only if `status = ACTIVE`.                                                                           |
| **Departments**                   |                                 |                                          |                                   |                                                                                                      |
| View own department               | ✅                              | ✅                                       | ✅                                |                                                                                                      |
| List all departments              | ⬛                              | ⬛                                       | ✅                                |                                                                                                      |
| Create / rename department        | ⬛                              | ⬛                                       | ✅                                |                                                                                                      |
| Archive / deactivate department   | ⬛                              | ⬛                                       | ✅                                | Deletion policy = OPEN DECISION.                                                                     |
| **Users**                         |                                 |                                          |                                   |                                                                                                      |
| View users                        | ⬛                              | 🟨                                       | ✅                                |                                                                                                      |
| Create user                       | ⬛                              | 🟨 (role USER; MANAGER? = OPEN DECISION) | ✅                                |                                                                                                      |
| Disable / re-enable user          | ⬛                              | 🟨 (USERs only)                          | ✅                                | Never physical delete.                                                                               |
| Change a user's role              | ⬛                              | 🟨 (OPEN DECISION — see users.md)        | ✅                                |                                                                                                      |
| Change a user's department        | ⬛                              | ⬛                                       | ✅ (OPEN DECISION — reassignment) |                                                                                                      |
| **Templates**                     |                                 |                                          |                                   |                                                                                                      |
| View / list templates             | 🟨                              | 🟨                                       | ✅                                | Soft-deleted templates hidden from pickers for all; visible in management views to MANAGER/ADMIN.    |
| Create template                   | ⬛ (confirmed, Phase 5 — OD-04) | 🟨                                       | ✅                                | See below.                                                                                           |
| Edit template                     | ⬛ (confirmed, Phase 5 — OD-04) | 🟨                                       | ✅                                | Edits never alter existing Jobs (snapshots).                                                         |
| Disable template                  | ⬛                              | 🟨                                       | ✅                                |                                                                                                      |
| Soft-delete template              | ⬛                              | 🟨                                       | ✅                                | No hard delete exists.                                                                               |
| **Files / Gallery**               |                                 |                                          |                                   |                                                                                                      |
| Upload file                       | ✅                              | ✅                                       | ✅                                | Into own department (ADMIN: any).                                                                    |
| Browse / reuse gallery files      | 🟨                              | 🟨                                       | ✅                                |                                                                                                      |
| Delete a Persistent Gallery Asset | 🟨 (own uploads? OPEN DECISION) | 🟨                                       | ✅                                | Only when safe (no required dependency).                                                             |
| Delete a Job Artifact manually    | ⬛                              | 🟨                                       | ✅                                | Normally automatic.                                                                                  |
| **Jobs (implemented, Phase 6)**   |                                 |                                          |                                   |                                                                                                      |
| View / list jobs                  | 🟨 (any in dept)                | 🟨                                       | ✅                                | Resolves OD-03 for Jobs: whole department, not just own.                                             |
| Create job                        | 🟨 (any in dept)                | 🟨                                       | ✅                                | Department is derived from the chosen Template — never a client-supplied field.                      |
| Cancel job                        | 🟨 (any in dept — resolved)     | 🟨 (any in dept)                         | ✅                                | Only from a cancelable state (`QUEUED`/`CLAIMED`/`RENDERING`).                                       |
| Retry job                         | 🟨 (any in dept — resolved)     | 🟨 (any in dept)                         | ✅                                | Creates a new linked job; original untouched. Only from `ERROR`/`CANCELED`, within the retry window. |
| Delete job                        | ⬛                              | ⬛                                       | ⬛                                | **Nobody. Ever.** (ADR-0005)                                                                         |
| **Worker API**                    | —                               | —                                        | —                                 | Only the Worker principal. No human role can call it.                                                |

> **OD-04 — USER vs MANAGER split on Templates — confirmed, Phase 5.** Does a plain USER
> author and edit Templates, or only consume them? The Phase 5 brief's own draft
> authorization matrix listed USER as able to create/edit/enable-disable/soft-delete
> Templates, which would have resolved this the other way — but that directly
> contradicted this page's existing default and every other authorization doc, so it was
> raised with the product owner rather than silently implemented either way. **Confirmed
> answer: MANAGER+ only** — USER gets `template:view` (view/list their own department's
> Templates) and nothing else. See
> [../development/open-decisions.md](../development/open-decisions.md) OD-04 for the full
> note.

> **`OPEN DECISION` — "own resource" scope for USER.** For cancel/retry/delete-own-file,
> is a USER limited to resources **they created**, or any resource in their department?
> _Consequence of "own only":_ least privilege, but awkward when a colleague is away.
> _Consequence of "whole department":_ collaborative, matches how MANAGER works, simpler
> to reason about. Recommended pending decision: **whole department for view; own-or-
> department for cancel/retry (confirm); MANAGER+ for destructive file ops.**

### Implemented in Phase 3/5/6 — conservative defaults where still OPEN

The mechanism (role floor per capability + department scope) is implemented for every row
above via `@/server/authz` (see [../architecture/authorization.md](../architecture/authorization.md)).
Users/Departments/Templates/Jobs now have a real policy behind them
(`src/features/users/use-cases/authorize-user-management.ts`;
`src/features/templates/use-cases/*` call `authorize(actor, "template:manage"|"template:view", ...)`
directly; `src/features/jobs/use-cases/*` call `authorize(actor, "job:manage", ...)`
directly, needing no extra fine-grained policy function the way Users' escalation rules
did) — Files' remaining `OPEN DECISION` row (destructive-op-only, already resolved via
`assertCanDeleteFile`) is the one row left without a use case of its own; Jobs' OD-03 is
now resolved (see below). Where a cell above is marked `OPEN DECISION`, the code takes
the most conservative reading until it's resolved, never a guessed answer:

- **Create user (MANAGER):** implemented as role `USER` only. OD-05 (can MANAGER mint
  another MANAGER) stays open; the code simply doesn't allow it yet.
- **Change a user's role (MANAGER):** implemented as **not allowed at all** — ADMIN-only.
  This row's OPEN DECISION is "does MANAGER get this at all", so denying it entirely is
  the conservative default, not a partial guess.
- **Change a user's department:** implemented as **ADMIN-only**, matching the ✅/⬛/⬛
  cells exactly. The reassignment mechanics OPEN DECISION (audit trail, snapshotting —
  OD-08) is about what ADMIN reassignment _does_, not whether ADMIN can do it at all, so
  granting ADMIN the capability doesn't overreach past what's already decided; no
  reassignment function exists yet regardless.
- **Nobody may change their own role or active status** through the implemented
  functions, including ADMIN — not one of the matrix rows above, but the concrete answer
  to `§20`/`§23`'s "prevent an accidental ADMIN lockout" requirement (see the
  architecture doc). A general "don't disable the last ADMIN" safeguard for other paths
  remains unaddressed and `OPEN DECISION`.
- **Disable / re-enable user (MANAGER):** implemented exactly as written — `USER`s only,
  not "anyone who isn't an ADMIN" (a peer MANAGER is also out of reach).
- **Templates' OD-04 is confirmed (Phase 5, see above) and fully implemented**: every
  Template use case's first step is `authorize(actor, "template:manage"|"template:view",
{ departmentId })` — a USER never even reaches the department-scope check for a
  mutation, since `template:manage`'s `MANAGER` role floor rejects it first.
- **Jobs' OD-03 is resolved (Phase 6): whole department, not "own resources only."** A
  USER may view, create, cancel, and retry any Job in their own Department — matching
  MANAGER's own scope and the collaborative model Templates already uses. Every Jobs use
  case's first step is `authorize(actor, "job:manage", { departmentId })`, with no
  additional "is this actor the creator" check layered on top (unlike Files' delete
  rule, which does add one).
- **Files' "own uploads?" row stays resolved as it already was** (ADR-0025): a USER may
  delete only a File they uploaded; MANAGER/ADMIN may delete any File in scope. Jobs'
  resolution above does not change this — the two capabilities were always independent.

## 4. Enforcement requirements

1. **Every use case starts by authorizing the actor** for the specific capability and the
   specific resource's department (`authorize(actor, capability, { departmentId })` —
   implemented). No use case trusts its caller.
2. **404 over 403** for cross-department access to a specific resource, to avoid leaking
   which ids exist in other departments (`assertDepartmentScopeOrNotFound` — implemented,
   see [../architecture/authorization.md](../architecture/authorization.md)).
3. **List endpoints always pass a department filter** unless the actor is ADMIN
   (`departmentScopeFilter(actor)` — implemented as a reusable helper; no list endpoint
   exists yet to call it).
4. **Server Actions and Route Handlers both** go through the same authorized use case.
5. **Telegram** (implemented, Phase 8) resolves to a `User` and runs the same checks — a
   Telegram user with role USER cannot do MANAGER things, and cannot touch other
   departments.
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
