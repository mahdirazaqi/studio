# feature: templates

**Scope:** Template + Template Asset authoring, editing, enable/disable, soft-deletion,
and validation. **Status: implemented (Phase 5).**

**Key rules** (`docs/domain/templates.md`, ADR-0006, ADR-0027):

- Templates are **soft-deleted only**; the row is kept forever so a future historical Job
  can resolve it. `status` (`ACTIVE`/`DISABLED`) and `deletedAt`/`deletedByUserId` are two
  independent fields — never combined.
- A soft-deleted Template can never be enabled, disabled, or edited again. Enable/
  disable/soft-delete are all idempotent — repeating one is a no-op, not an error.
- `name` is unique per Department among non-deleted rows (a hand-added partial DB index —
  Prisma's schema language has no native filtered-unique syntax).
- Editing a Template **never** changes an existing Job — it will hold its own immutable
  snapshot (ADR-0010) once Jobs exist. Editing replaces the entire asset list wholesale,
  not a per-asset diff.
- Asset `kind` (`DATA`/`IMAGE`/`AUDIO`/`VIDEO`) is a validated enum; `imageRatio` is
  required for `IMAGE` and forbidden otherwise; a `defaultFileId` is optional, allowed
  only for `IMAGE`/`AUDIO`/`VIDEO`, and verified against the Template's own Department on
  every write.
- `template:manage` (create/edit/enable/disable/soft-delete) is **MANAGER+ only**;
  `template:view` (view/list) is USER+ — confirmed for Phase 5 (OD-04).

**Layout:**

```
domain/       template.ts (types, lifecycle state), template-asset-rules.ts (kind
              consistency, duplicate-key check) — pure, unit-tested
schemas/      template-asset-input.schema.ts, template-input.schema.ts,
              update-template.schema.ts, list-templates.schema.ts
repository/   template-repository.ts — the only module querying Template/TemplateAsset;
              also exports countTemplateAssetReferencesToFile for the Files feature's
              deletion-safety check
use-cases/    create/update/get/list-templates, set-template-status (enable/disable),
              soft-delete-template, verify-file-references, resolve-target-department
actions/      create/update/enable/disable/soft-delete Server Actions
components/   TemplateForm (shared create/edit, read-only mode for USER/deleted),
              TemplateAssetEditor, TemplatesToolbar, TemplateListItem,
              TemplateStatusActions
```

**Consumed by `features/jobs`, Phase 6:** `create-job.ts` calls `findTemplateInScope`
directly (this feature's own repository) to resolve a Template, validate its
`status`/`deletedAt`, and read its `assets` — the exact contract this README anticipated.

**Not built yet, deliberately:** a Template version-history/restore mechanism,
aspect-ratio tolerance comparison against an actual uploaded image (OD-14 stays open).
(`youtubeTargetId` briefly existed, Phases 9–11, then was removed along with the rest of
YouTube upload — ADR-0041.)
