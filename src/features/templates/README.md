# feature: templates

**Scope:** Template + template-asset authoring, editing, disabling, soft-deletion, and
validation.

**Key rules** (`docs/domain/templates.md`, ADR-0006):

- Templates are **soft-deleted only**; the row is kept forever so historical Jobs resolve.
- `DISABLED` ≠ `DELETED`. Job creation rejects both — on **every** path (web + Telegram).
- Editing a Template **never** changes existing Jobs (they hold snapshots).
- Asset `kind` is a validated enum; image aspect-ratio checks use a **tolerance**.

**Not built yet.** Depends on the database layer.

Will contain: `domain/` (Template + asset types, kind enum), `use-cases/`, `actions/`,
`schemas/`, `repository/`, `read/`, `components/`.
