# Authorization Workflow

A practical guide for adding a new authorized operation. For the model itself, see
[`../domain/authorization.md`](../domain/authorization.md) (the permission matrix) and
[`../architecture/authorization.md`](../architecture/authorization.md) (the mechanism).

## Adding a new capability

1. Check [`../domain/authorization.md`](../domain/authorization.md)'s permission matrix
   for the operation. If the relevant cell is `OPEN DECISION`, **stop** — don't invent an
   answer; either use the existing conservative default if one is already documented, or
   raise it before proceeding.
2. Register the capability in `CAPABILITY_POLICIES` in `src/server/authz/index.ts`, with
   its role floor. Use `resource:action` naming (`job:manage`, not `manageJob`).
3. Call it from the use case, first thing, before any repository read/write:

   ```ts
   export async function createJob(actor: Actor, input: CreateJobInput) {
     authorize(actor, "job:manage", { departmentId: actor.departmentId });
     // ...
   }
   ```

   For USER/MANAGER, the department is **derived from the actor**, never taken from
   client input — see "Deriving vs. trusting a department" below.

## Scoping a query to the actor's department

Every repository read/write on a department-scoped table applies
`departmentScopeFilter(actor)`:

```ts
export async function listJobs(actor: Actor, filters: JobFilters) {
  return db.job.findMany({
    where: { ...departmentScopeFilter(actor), ...filters },
  });
}
```

For a single resource loaded by id, load it first, then check:

```ts
export async function getJob(actor: Actor, jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw notFoundError();
  assertDepartmentScopeOrNotFound(actor, job.departmentId); // 404, not 403
  return job;
}
```

Do **not** write `findUnique({ where: { id } })` and then `if (job.departmentId !==
actor.departmentId) throw forbidden()` as a first instinct — prefer folding the scope into
the query (`findFirst({ where: { id, ...departmentScopeFilter(actor) } })`, which returns
`null` for a cross-department id exactly like a nonexistent one) when the access pattern
allows it; use `assertDepartmentScopeOrNotFound` after a plain load when the repository
needs the row for other reasons regardless of department (e.g. to decide the right error
message) before rejecting it.

## Deriving vs. trusting a department

```ts
// WRONG — trusts a client-supplied department
async function createJobAction(input: { departmentId: string; ... }) {
  return createJob(actor, input); // input.departmentId flows straight through
}

// RIGHT — USER/MANAGER: derive it; ADMIN: accept it explicitly and validate it exists
async function createJob(actor: Actor, input: CreateJobInput) {
  const departmentId =
    actor.role === "ADMIN" ? input.departmentId : actor.departmentId;
  authorize(actor, "job:manage", { departmentId });
  // ...
}
```

Never accept a `role` or `departmentId` field from client input and write it straight to
a `User` row, either — see the escalation-protection functions in
`src/features/users/use-cases/authorize-user-management.ts` for the pattern once a
user-management use case exists.

## Adding a role-escalation-sensitive operation (e.g. future user management)

Follow `src/features/users/use-cases/authorize-user-management.ts`'s shape:

1. Coarse gate: `authorize(actor, "user:manage", { departmentId: target.departmentId })`.
2. Self-modification check: does `actor.userId === target.id`? If the operation is
   sensitive (role, active status, department), forbid it outright rather than trying to
   allow a "safe subset" of self-service changes.
3. Target-role check: does the actor's role floor cover _this specific target's current
   or requested role_ (e.g. MANAGER may only ever touch a `USER`-role target)?
4. Write a negative test for every branch above before wiring it to a real mutation —
   see that file's `.test.ts` for the shape (one `it` per denied scenario, one per allowed
   scenario).

## Testing an authorization rule

- Test the **use case's authorization branches directly** with plain `Actor`/target
  fixtures — no database, no session, no HTTP. See
  `src/server/authz/index.test.ts` and `src/features/users/use-cases/
authorize-user-management.test.ts`.
- Prioritize the denied paths (Phase 3 convention): wrong role, wrong department, self-
  modification, cross-department resource id. A missing "happy path" test is a coverage
  gap; a missing denial test is a security hole.
- For a page-level gate (like `/users`, `/departments`), a manual/integration check
  against a real running server with one seeded user per role is reasonable — building a
  browser E2E suite for this is not (Studio's testing policy stays unit-first;
  [`conventions.md`](conventions.md) §9).

## Checklist before shipping a new authorized operation

- [ ] The relevant matrix cell in `docs/domain/authorization.md` is `DECIDED`, not `OPEN
DECISION` (or you're intentionally implementing its documented conservative
      default).
- [ ] The capability is registered in `CAPABILITY_POLICIES`, not inlined as
      `actor.role === "..."` in the use case.
- [ ] Department is derived from the actor for USER/MANAGER, never trusted from input.
- [ ] A specific resource load uses `assertDepartmentScopeOrNotFound` (404); a
      capability/route-level check uses `authorize`/`assertSameDepartment` (403); a
      list/search/count uses `departmentScopeFilter`.
- [ ] Self-modification of anything sensitive (role, status, department) is forbidden
      unless explicitly designed otherwise.
- [ ] Negative tests exist for every role × department combination that should fail.
- [ ] The Server Action/Route Handler itself contains no business logic — it validates
      input and delegates; the use case authorizes.
