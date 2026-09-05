# feature: departments

**Scope:** the tenancy / isolation boundary. Department records and the helpers that
enforce department scoping across every other feature.

**Key rules** (`docs/domain/departments.md`, ADR-0011): every scoped resource
(`User`, `Template`, `Job`, `File`) has a `departmentId`. USER/MANAGER act only within
their own department; ADMIN acts across all. Department **deletion** policy is OPEN
DECISION OD-07 (recommendation: archive only).

**Status: partial (Phase 4/5).** No management feature yet — `repository/` and `read/`
hold exactly two reads, added only because ADMIN's "act on any department" capability
(Files' upload form, Templates' create form) needed somewhere to pick a department from
and something to validate a choice against:

- `repository/department-repository.ts` — `listDepartments()`, `departmentExists(id)`.
  `departmentExists` is also called directly by
  `features/templates/use-cases/resolve-target-department.ts` for ADMIN Template
  creation, mirroring how Files' `upload-file.ts` already used it.
- `read/list-departments-for-admin.ts` — the authorized (ADMIN-only) wrapper the file
  upload form's and the Template list/create pages' department pickers call.

**Not built yet:** `use-cases/` (create, rename, archive), `actions/`, `schemas/`,
management `components/`. Scoping primitives already exist in `@/server/authz`
(`assertSameDepartment`, `departmentScopeFilter`).
