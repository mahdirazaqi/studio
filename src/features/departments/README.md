# feature: departments

**Scope:** the tenancy / isolation boundary. Department records and the helpers that
enforce department scoping across every other feature.

**Key rules** (`docs/domain/departments.md`, ADR-0011): every scoped resource
(`User`, `Template`, `Job`, `File`) has a `departmentId`. USER/MANAGER act only within
their own department; ADMIN acts across all. Department **deletion** policy is OPEN
DECISION OD-07 (recommendation: archive only).

**Status: partial (Phase 4).** No management feature yet — `repository/` and `read/` hold
exactly two reads, added only because the Files feature's ADMIN "upload into any
department" capability needed somewhere to pick a department from:

- `repository/department-repository.ts` — `listDepartments()`, `departmentExists(id)`.
- `read/list-departments-for-admin.ts` — the authorized (ADMIN-only) wrapper the file
  upload form's department picker calls.

**Not built yet:** `use-cases/` (create, rename, archive), `actions/`, `schemas/`,
management `components/`. Scoping primitives already exist in `@/server/authz`
(`assertSameDepartment`, `departmentScopeFilter`).
