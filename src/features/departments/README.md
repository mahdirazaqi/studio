# feature: departments

**Scope:** the tenancy / isolation boundary. Department records and the helpers that
enforce department scoping across every other feature.

**Key rules** (`docs/domain/departments.md`, ADR-0011): every scoped resource
(`User`, `Template`, `Job`, `File`) has a `departmentId`. USER/MANAGER act only within
their own department; ADMIN acts across all. Department **deletion** policy is OPEN
DECISION OD-07 (recommendation: archive only).

**Not built yet.** Depends on the database layer.

Will contain: `use-cases/` (create, rename, archive), `actions/`, `schemas/`,
`repository/`, `read/`, `components/`. Scoping primitives already exist in
`@/server/authz` (`assertSameDepartment`).
