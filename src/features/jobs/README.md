# feature: jobs

**Scope:** Job creation, the state machine, assets, progress/duration, cancellation,
retry lineage, completion, and delivery orchestration. Also the use cases the Worker
REST API calls (atomic claim, progress/state/duration, result upload).

**Key rules** (`docs/domain/jobs.md`, ADR-0005/0010/0013/0016):

- A Job is **never deleted** (no hard or soft delete).
- A Job carries an **immutable snapshot** of its creation context.
- State transitions are **explicit and validated**; the Worker claim is **atomic**.
- Retry creates a **new linked Job**; the original is untouched.
- Delivery is **durable**, never fire-and-forget.

**Not built yet.** Depends on the database layer, templates, files, and the durable-work
mechanism (OPEN DECISION OD-40).

Will contain: `domain/` (state machine + transition map, Job types, invariants),
`use-cases/`, `actions/`, `schemas/`, `repository/` (incl. `FOR UPDATE SKIP LOCKED`
claim), `read/`, `components/`.
