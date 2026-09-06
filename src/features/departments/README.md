# feature: departments

**Scope:** the tenancy / isolation boundary. Department records and the helpers that
enforce department scoping across every other feature.

**Key rules** (`docs/domain/departments.md`, ADR-0011): every scoped resource
(`User`, `Template`, `Job`, `File`) has a `departmentId`. USER/MANAGER act only within
their own department; ADMIN acts across all. Department **deletion** policy is still
OPEN DECISION OD-07 (recommendation: archive only) — **no delete/archive path exists,
deliberately.**

**Status: implemented (Phase 4/5/9/10).**

- `domain/department.ts` — the pure `SafeDepartment` type (Phase 10). No `status` field —
  adding one ahead of OD-07 being decided would be speculative schema for a policy that
  doesn't exist yet.
- `repository/department-repository.ts` — `listDepartments()`/`departmentExists(id)`
  (the lightweight picker helpers ADMIN's "act on any department" capability needs,
  Phase 4/5/9), plus the real management queries (Phase 10): `listAllDepartments`,
  `findDepartmentById`, `createDepartment`, `renameDepartment` (both ADMIN-only,
  `department:manage`).
- `read/list-departments-for-admin.ts` — the authorized (ADMIN-only) wrapper the file
  upload form's, Template form's, and User form's department pickers call.
- `use-cases/`, `actions/`, `schemas/`, `components/` (Phase 10) — the `/departments`
  page: every role sees their own department (read-only); ADMIN additionally sees every
  department and can create/rename.

See [`docs/domain/departments.md`](../../../docs/domain/departments.md) for the full
enforcement pattern and the still-open deletion-policy decision.
