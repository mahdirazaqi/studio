# Authorization

**`DECIDED` — implemented in Phase 3.** Resolves the enforcement half of ADR-0011 and is
recorded as ADR-0022/ADR-0023. This page documents the actual mechanism; the permission
matrix and business rules it enforces live in
[../domain/authorization.md](../domain/authorization.md) — read that first if you're
adding a new capability. [authentication.md](authentication.md) documents the separate
"who is this?" layer this builds on.

## Authentication vs authorization vs department scope

Three separate questions, three separate mechanisms:

| Question                       | Answered by                                  | Failure                                           |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------- |
| Who is the caller?             | `@/server/auth` (session)                    | `unauthenticated` (401)                           |
| What are they allowed to do?   | `@/server/authz` — role floor per capability | `forbidden` (403)                                 |
| Which data can they see/touch? | `@/server/authz` — department scope          | `forbidden` (403) or `not_found` (404), see below |

A use case checks all three, in that order, before doing anything else.

## The `Actor` shape

```ts
interface Actor {
  userId: string;
  role: Role; // "USER" | "MANAGER" | "ADMIN"
  departmentId: string;
}
```

`toActor(currentUser)` builds one from the authenticated session. This is the **only**
shape authorization logic operates on — deliberately not `CurrentUser` (which also carries
display-only fields like `email`/`displayName` a use case has no business branching on)
and deliberately not tied to cookies or `next/*` request APIs. A future Telegram adapter
resolves a Telegram identity to a `User` row and builds an `Actor` the exact same way; the
Render Worker never becomes an `Actor` at all — see "Non-user principals" below. This is
the whole answer to "how does authorization stay reusable across transports" (§36 of the
Phase 3 brief): there is nothing transport-specific to reuse _from_ — the mechanism only
ever sees an `Actor`.

There is no `isActive` field on `Actor`. It doesn't need one: `getCurrentUser()` already
refuses to resolve a session for anyone whose `status` isn't `ACTIVE`
([authentication.md](authentication.md)), so a `CurrentUser` — and therefore an `Actor` —
simply cannot exist for a disabled user. Disabling is enforced once, at the
authentication boundary, not re-checked at every authorization call site.

## The capability registry

`@/server/authz`'s `CAPABILITY_POLICIES` is a flat map from a capability string
(`"user:manage"`, `"job:manage"`, ...) to `{ minRole }`. `authorize(actor, capability,
{ departmentId? })`:

1. Looks up the capability's policy. **No policy → throws `internal`.** This is a
   deliberate loud failure — a capability with no registered floor is a bug (someone
   forgot to declare the rule), not a silent allow or a silent deny.
2. Checks `actor.role` meets the policy's `minRole` (`forbidden` if not).
3. If `departmentId` was passed, checks it matches `actor.departmentId` — ADMIN bypasses
   (`forbidden` if not).

```ts
authorize(actor, "user:manage", { departmentId: targetDepartmentId });
```

Registering a capability is a one-line addition transcribed directly from a decided row
of [../domain/authorization.md](../domain/authorization.md)'s permission matrix — never a
new invented rule. `job:manage`, `file:manage`, `template:manage`, `template:view` were
registered ahead of Jobs/Templates/Files existing, precisely so those phases wouldn't have
to design this registry from scratch. All three have now landed:

- **Templates (Phase 5)**: every `features/templates/use-cases/*` function calls
  `authorize(actor, "template:manage" | "template:view", { departmentId })` as its first
  step, with no additional fine-grained policy function needed (OD-04, "can USER author
  Templates", is confirmed as MANAGER+ only — so the registered role floor alone is the
  complete answer; there is no "own resource" nuance for Templates the way Files' delete
  rule needed one).
- **Jobs (Phase 6)**: every `features/jobs/use-cases/*` function that takes an `Actor`
  calls `authorize(actor, "job:manage", { departmentId })` as its first step, resolving
  OD-03 for Jobs the same way — **whole department**, no "own resource" narrowing. The
  Worker-facing operations (`claimNextJob`, `updateJobProgress`, `updateJobDuration`, and
  the underlying `transitionJob`) take no `Actor` at all — see
  [../domain/jobs.md](../domain/jobs.md) "Worker identity vs User identity".
- **Files (Phase 4)**: `file:manage`'s role floor is the coarse gate, plus
  `assertCanDeleteFile`'s own finer "own upload vs. any in department" rule for
  deletion — the one capability among the three where OD-03's "own resource" reading was
  actually chosen, deliberately different from Jobs' whole-department resolution.

## Department scope: three tools, three situations

| Situation                                                                                                | Use                                                                                          | On mismatch           |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------- |
| Capability-level check, no single resource identity at stake (e.g. "can you open the Users list at all") | `authorize(actor, cap, { departmentId })` (folds this in) or `assertSameDepartment` directly | `forbidden` (403)     |
| Loading one specific resource by id (e.g. `GET /jobs/:id`)                                               | `assertDepartmentScopeOrNotFound(actor, resource.departmentId)` after loading it             | `not_found` (404)     |
| Listing/searching/counting (e.g. `db.job.findMany(...)`, `db.job.count(...)`)                            | `departmentScopeFilter(actor)` spread into the query's `where`                               | (rows never returned) |

The 403-vs-404 split is deliberate, not arbitrary: [../domain/authorization.md](../domain/authorization.md)
and Security Requirements §2 both ask that cross-department access to a **specific,
identified resource** not confirm the id exists at all — a MANAGER guessing another
department's job id should see the same "not found" they'd see for a nonexistent id, not
a "forbidden" that confirms _something_ is there. A route-level or list-level check has no
such identity to leak, so `forbidden` is the right, clearer signal there.

`departmentScopeFilter(actor)` returns `{}` for ADMIN (no filter — sees everything) or
`{ departmentId: actor.departmentId }` otherwise. Every future list/search/count query
spreads this into its `where` — see §29/§30 of the Phase 3 brief ("a MANAGER should never
receive `totalJobs` across all departments", "search scope is part of authorization").
This is also why Studio has no generic `prisma.job.findMany(...)`-style escape hatch
available to application code outside a feature's repository: repositories are the only
callers of `@/server/db`, and this filter is the pattern every one of them follows.

## User-management policy (prepared, not yet wired to a use case)

`src/features/users/use-cases/authorize-user-management.ts` implements the fine-grained
rules from [../domain/authorization.md](../domain/authorization.md) §19–24 that a
capability floor alone can't express — role/status escalation and self-modification
protection:

- `assertCanCreateUserWithRole(actor, departmentId, role)`
- `assertCanChangeRole(actor, target, nextRole)`
- `assertCanSetActiveStatus(actor, target)`

Each starts with `authorize(actor, "user:manage", { departmentId })` (the coarse gate),
then layers a target-specific rule on top — see the file's doc comments for exactly which
matrix row or OPEN DECISION each rule traces to; the highlights:

- **Nobody changes their own role or their own active status through these functions —
  not even ADMIN.** This is the entire ADMIN-lockout safeguard (Phase 3 brief §23): making
  self-service escalation/self-disable structurally impossible is simpler and more
  reliable than a "count the remaining ADMINs" runtime check, and needs no such check to
  still be correct.
- **MANAGER may only disable/re-enable or (once role changes are decided) touch a
  `USER`-role account** — not a peer MANAGER, not an ADMIN, even in their own department.
- **MANAGER may only create a `USER`-role account.** Whether a MANAGER may create/promote
  another MANAGER is OD-05, still open; this is the conservative default until decided.
- **Changing an existing user's role is ADMIN-only for now** — the matrix marks MANAGER's
  access to this OPEN DECISION; nothing is invented past "deny until decided."
- **Only ADMIN may move a user between departments** (see `assertCanCreateUserWithRole`'s
  department-scope check and the plain `requireRole(actor, "ADMIN")` gate a future
  change-department function would use) — matches the matrix exactly; department
  reassignment's _consequences_ (audit trail, etc.) remain OD-08, unaddressed here since
  no such function exists yet.

No repository write, Server Action, or page calls these yet — there is no user-management
UI in Phase 3 (that's a later phase). They exist now, fully unit-tested (including every
negative case above), so that phase only has to call them from a real mutation instead of
designing the policy from scratch.

## Server Action authorization

Every protected Server Action's handler calls a use case, and the use case's first lines
are the authorization check — not the action itself. This was already the Phase 1/2
convention (`defineAction` resolves _authentication_ — the `Actor`/`CurrentUser` — but
never authorization; see [server-actions.md](server-actions.md)); Phase 3 doesn't change
that shape, it just gives use cases a real capability registry to call into instead of the
Phase 1 placeholder that allowed ADMIN only.

```ts
// a future features/jobs/use-cases/cancel-job.ts
export async function cancelJob(actor: Actor, jobId: string) {
  const job = await jobRepository.findById(jobId);
  if (!job) throw notFoundError();
  assertDepartmentScopeOrNotFound(actor, job.departmentId);
  authorize(actor, "job:manage", { departmentId: job.departmentId });
  // ... state machine, etc.
}
```

No use case trusts that the page/action that called it already checked permissions
(Phase 3 brief §15) — the same use case is reachable from a Server Action today and a REST
Route Handler or Telegram adapter later, and must protect itself identically from all of
them.

## Server Component / route authorization

`src/app/(dashboard)/users/page.tsx` and `.../departments/page.tsx` are the first real
examples: each resolves `requireUser()` (already guaranteed by the `(dashboard)` layout;
de-duped by React `cache()`, no extra query), builds an `Actor`, and renders
`<ForbiddenPage />` instead of its real content when the role floor isn't met — direct URL
navigation is checked exactly like a click would be, per §17 of the Phase 3 brief.

`src/components/layout/forbidden-page.tsx` is a plain, reusable "you do not have
permission to access this page" view (English, no internal detail) — a rendering choice
made _after_ the real check fails, never a substitute for it.

`src/app/(dashboard)/templates/[templateId]/page.tsx` (Phase 5) is the first page that
also needs a **not-found** outcome, not just forbidden: `getTemplate` throws a `not_found`
`AppError` for both "doesn't exist" and "exists in another department" (the same fold
`findFileInScope`/`findTemplateInScope` already do), and the page catches `AppError`
directly to call Next's `notFound()` — no other Server Component in this codebase has
needed that translation before. One known, accepted limitation: because the `(dashboard)`
route group has a `loading.tsx` (Phase 1), every route in it streams, so the initial `200`
response headers are already sent before an awaited `notFound()` deep in the page can
change the status — the rendered content is fully correct (Next's real not-found UI, no
data leaked either way), but the raw HTTP status stays `200` instead of `404`. This is a
general Next.js App Router characteristic of streamed routes, not something a leaf page
can opt out of while sharing that layout's `loading.tsx`; it does not weaken the
authorization guarantee (no cross-department content is ever rendered), only the
status-code observability of it.

The dashboard sidebar (`navigationForRole(role)`) and the Overview page's "Planned areas"
list both filter to the current role for the same reason a placeholder page shouldn't
link somewhere it will immediately reject — **this filtering is presentation, not
security**: both routes are independently, redundantly protected server-side regardless
of whether a link to them was ever rendered.

## Why not middleware

Next.js middleware runs before any of this and could redirect unauthenticated requests
away from `/`-prefixed routes in one place. Studio doesn't add one, deliberately:

- The `(dashboard)/layout.tsx` server check already does exactly that coarse job (redirect
  on no session) with no `next/*` Edge-runtime constraints and no duplicated logic —
  adding middleware on top would be a second implementation of the same check, which
  CLAUDE.md and this doc both ask to avoid ("do not duplicate authentication checks").
- Fine-grained, resource-level authorization (role floors per capability, department
  scope, the escalation rules above) cannot live in middleware at all — it needs the
  loaded resource and the use case's business context, which middleware never has. The
  Phase 3 brief is explicit about this (§33): "Middleware is not a substitute for
  resource-level authorization."

If a genuinely middleware-shaped need appears later (e.g. redirecting a whole legacy path
prefix), it should still only ever do the coarse job and defer everything else to the
layout/page/use-case chain above.

## Non-user principals (Worker, Telegram)

- **The Render Worker is never a `User` and never becomes an `Actor`.** It's a separate,
  narrow principal authenticated by a service credential (ADR-0004, still OPEN DECISION
  on the exact mechanism — OD-27) with access to Worker API use cases only. It is not
  implemented in Phase 3; when it lands, its Route Handlers authenticate the credential
  and call Worker-specific use cases that never call `authorize()` with a human
  capability — mixing the two would let a compromised/misconfigured Worker credential
  reach human-authorization-gated code paths it has no business touching.
- **Telegram resolves to a real `User`.** A future Telegram adapter maps a Telegram
  identity to a `User` row (phone-linked, per [../domain/users.md](../domain/users.md)),
  builds a `CurrentUser`-equivalent, and calls `toActor()` on it exactly like the web
  session does — the same `authorize()` calls, the same department scope, the same
  escalation rules, with no special-cased "Telegram path" anywhere in a use case. This is
  the direct fix for the legacy defect where the Telegram surface enforced no permissions
  at all ([../legacy/known-issues.md](../legacy/known-issues.md)).

## Historical integrity is not an authorization concern

Authorization decides what a _current_ actor may do _now_. It never deletes or hides a
historical record to resolve a permission question — a disabled user's past Jobs still
show that user as their creator; a department that stops accepting new resources doesn't
retroactively hide its old ones from an ADMIN's view. See
[../data/historical-integrity.md](../data/historical-integrity.md) and ADR-0009/0010,
unchanged by this phase.

## Verification

`src/server/authz/index.test.ts` and `src/features/users/use-cases/
authorize-user-management.test.ts` cover, per the Phase 3 brief's emphasis on negative
cases first (§44): unregistered-capability failure, role-floor enforcement, department
mismatch for USER/MANAGER, ADMIN bypass, the 403-vs-404 split, `departmentScopeFilter`'s
two shapes, and every escalation/self-modification rule above (USER can't manage users at
all, MANAGER can't cross departments / create or touch an ADMIN / touch a peer MANAGER /
change any role, nobody can touch their own role or status, ADMIN can do everything except
that).

Manually re-verified end-to-end against a real Postgres instance and a real `next build` +
`next start` server, with one `ACTIVE` user seeded per role plus a second MANAGER in a
different department:

| Actor                                | Route                  | Result                                                                                                                                  |
| ------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| USER                                 | `/users`               | `ForbiddenPage` rendered                                                                                                                |
| USER                                 | `/departments`         | `ForbiddenPage` rendered                                                                                                                |
| MANAGER (dept A)                     | `/users`               | Real content rendered (role floor met)                                                                                                  |
| MANAGER (dept A)                     | `/departments`         | `ForbiddenPage` rendered                                                                                                                |
| MANAGER (dept B)                     | `/users`               | Real content rendered (role-only page gate — a future Users list use case is what actually applies `departmentScopeFilter` to the rows) |
| ADMIN                                | `/departments`         | Real content rendered                                                                                                                   |
| USER                                 | Sidebar / Overview nav | No `/users` or `/departments` link rendered                                                                                             |
| MANAGER                              | Sidebar / Overview nav | `/users` link rendered, `/departments` not                                                                                              |
| ADMIN                                | Sidebar / Overview nav | Both rendered                                                                                                                           |
| Disabled user (valid session cookie) | `/`                    | `307` → `/sign-in` (unchanged from Phase 2 — the authentication boundary, not this phase, already refuses a disabled user's session)    |
| No session                           | `/`                    | `307` → `/sign-in`                                                                                                                      |

Re-verified again for Phase 5 (Templates), same real-server setup plus two MANAGERs in
different departments:

| Actor            | Route/action                                                | Result                                                                              |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| USER             | `/templates`, `/templates/[id]` (own dept)                  | Real content rendered, read-only (no "New template", no Edit/Enable/Disable/Delete) |
| USER             | `/templates/new`                                            | `ForbiddenPage` rendered                                                            |
| USER             | `createTemplate`/`updateTemplate` use case, called directly | `forbidden`                                                                         |
| MANAGER (dept A) | `/templates/new`, create/edit/disable/enable/delete         | All succeed, scoped to dept A                                                       |
| MANAGER (dept A) | `updateTemplate`/`softDeleteTemplate` on dept B's template  | `not_found`                                                                         |
| MANAGER (dept A) | `createTemplate` with a dept-B File's id as a default       | `business_rule` (file reference not found in dept A)                                |
| MANAGER (dept A) | Two templates with the same name in dept A                  | Second `conflict`; same name in dept B succeeds                                     |
| ADMIN            | `/templates` (no department filter)                         | Templates from every department rendered, with a department badge per row           |
| ADMIN            | `createTemplate` with an explicit, existing `departmentId`  | Created in that department                                                          |
| ADMIN            | `createTemplate` with a nonexistent `departmentId`          | `business_rule`                                                                     |
| Any role         | `deleteFile` on a File a live Template asset defaults to    | `conflict`, file not deleted                                                        |
| MANAGER          | Enable/disable an already-enabled/disabled template         | No-op, no error (idempotent)                                                        |
| MANAGER          | Soft-delete an already-deleted template                     | No-op, no error (idempotent)                                                        |
| MANAGER          | Enable or edit a soft-deleted template                      | `business_rule`                                                                     |
| MANAGER          | Create a template with the same name a just-deleted one had | Succeeds (partial unique index excludes soft-deleted rows — ADR-0027)               |

Re-verified again for Phase 6 (Jobs), same real-server setup:

| Actor             | Route/action                                                              | Result                                                                          |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| USER              | `/jobs`, `/jobs/[id]` (own dept, including a job created by someone else) | Real content rendered — Jobs' OD-03 resolved as whole-department                |
| USER              | `createJob` for a Template outside their department                       | `not_found` (folded via `findTemplateInScope`)                                  |
| USER              | `cancelJob`/`retryJob` on a job created by a different USER, same dept    | Succeeds — not limited to "own" jobs                                            |
| MANAGER (dept A)  | `getJob`/`listDepartmentJobs` on dept B's job                             | `not_found` / excluded from the list                                            |
| MANAGER (dept A)  | `createJob` with a dept-B File id for an image slot                       | `business_rule` (file reference not found in dept A's gallery)                  |
| ADMIN             | `/jobs` (no department filter)                                            | Jobs from every department rendered                                             |
| Any role          | `deleteFile` on a File an **active** Job references                       | `conflict`, file not deleted; released once that Job leaves an active state     |
| MANAGER           | Cancel an already-canceled job                                            | No-op, no error (idempotent)                                                    |
| MANAGER           | Cancel a `RENDERED`/`UPLOADED` job                                        | `business_rule`                                                                 |
| MANAGER           | Retry a `QUEUED`/`RENDERING` job                                          | `business_rule` (not yet eligible)                                              |
| MANAGER           | Retry a job past `JOB_RETRY_WINDOW_DAYS`                                  | `business_rule`                                                                 |
| MANAGER           | Retry an `ERROR`/`CANCELED` job                                           | New linked Job created; original untouched                                      |
| System (no Actor) | `claimNextJob()` called twice concurrently                                | Two different Jobs claimed, never the same one (real-database concurrency test) |
| System (no Actor) | `createJob`/`retryJob` with `deliverToYouTube: true`, 4th of the UTC day  | `conflict` (daily quota, real-database concurrency test also passed)            |
