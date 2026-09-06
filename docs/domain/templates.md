# Domain: Templates

**Implemented, Phase 5.** This page is the business rules and permission matrix;
[../architecture/decisions.md](../architecture/decisions.md) ADR-0006/ADR-0027 records the
decisions behind the shape below, and [`prisma/schema.prisma`](../../prisma/schema.prisma)
is the final schema.

## Purpose

A **Template** is a reusable render recipe. It defines _what_ to render and _what inputs_
a Job must supply. Studio does not interpret the render definition — it passes identifiers
through to the Render Worker.

---

## Part A — Legacy behavior (reference only) `LEGACY`

From `qtical-backend-node/src/render/template` (see
[../legacy/render-module-analysis.md](../legacy/render-module-analysis.md) §3.1).

- Mongo collection `templates`. GraphQL `addTemplate` / `editTemplate` / `getTemplate` /
  `getTemplates`.
- Fields: `_createdBy`, `name` (globally **unique** DB index), `_channel` (optional →
  YouTube channel for auto-upload eligibility), `disabled` (bool), `composition`, `src`
  (source project location), `script` (auto-injected as job `assets[0]`), `output`
  (output dir template, copied to `Job.workDir`), `assets: TemplateAsset[]`,
  `description` (→ YouTube description), `tags` (→ YouTube tags, with `{{layer}}`
  substitution).
- `TemplateAsset`: `name` (lookup key into job input), `composition`, `layer` (also the
  `{{layer}}` token for tag substitution), `type` (free text: `data`/`image`/`audio`/
  `video`; `script` injected server-side), `imageRatio` (`9:16`/`16:9`/`square`/`none`).
- **No delete** mutation existed (despite a `TEMPLATE_REMOVE` permission).
- `editTemplate` was **full-replace** (not a patch) and emitted an activity-log diff.
- **Problems:** `name` uniqueness violations surfaced as raw Mongo 500s; `disabled`
  templates were hidden from the Telegram picker but **still usable via the GraphQL
  `addJob`** mutation; `imageRatio` was only enforced in the Telegram flow, not on the
  API path; aspect-ratio detection used exact float equality; no department/workspace
  ownership.

---

## Part B — Studio design (implemented)

### Lifecycle

```
ACTIVE ──> DISABLED ──> ACTIVE ...
     └──────────────> DELETED (soft, from either state; row kept forever)
```

| State            | In creation pickers? | Editable? | Resolvable by historical Jobs? |
| ---------------- | -------------------- | --------- | ------------------------------ |
| `ACTIVE`         | yes                  | yes       | yes                            |
| `DISABLED`       | **no**               | yes       | yes                            |
| `DELETED` (soft) | **no**               | **no**    | **yes**                        |

`status` (`ACTIVE`/`DISABLED`) and `deletedAt`/`deletedByUserId` are **two independent
columns**, never combined into one field (Phase 5 brief §7). `templateLifecycleState()`
(`features/templates/domain/template.ts`) computes the effective three-state value:
`deletedAt` set always wins, regardless of `status`.

- **Templates are soft-deleted only** (ADR-0006). The row is **never** physically
  removed.
- **Disabled ≠ deleted.** Disabled = temporarily hidden from new-Job creation, still
  fully editable. Deleted = also removed from management lists and no longer editable,
  retained purely so a future historical Job remains readable.
- **State transitions are deliberately restricted, not a general state machine:**
  - A soft-deleted Template can never be enabled, disabled, or edited again
    (`business_rule` error on any of these) — it is no longer an active resource.
  - Enabling/disabling an already-enabled/disabled Template is a **no-op**, not an error
    (idempotent, per Phase 5 brief §25).
  - Soft-deleting an already-deleted Template is likewise a no-op.
  - There is no "restore a deleted Template" action in this phase — not a requirement,
    and not built speculatively.
- Disabling/deleting is enforced where Job creation checks it —
  **implemented, Phase 6**: `features/jobs/use-cases/create-job.ts` rejects a
  `DISABLED`/soft-deleted Template. Studio does **not** repeat legacy's leak where the
  GraphQL path bypassed the Telegram picker's `disabled` filter — there is only one Job
  creation path today (the dashboard), and it enforces this rule; a future Telegram
  surface must too. See [../legacy/known-issues.md](../legacy/known-issues.md) and
  "Template / Job contract" below.

### Fields (implemented; final schema in

[`prisma/schema.prisma`](../../prisma/schema.prisma))

| Field                                                 | Notes                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                  | Referenced by a future Job's snapshot forever — never reused, never removed.                                                                                                                                                                                                                                                      |
| `departmentId`                                        | Required. Scopes ownership. Immutable after creation (no reassignment path — matches OD-08's "not supported" default).                                                                                                                                                                                                            |
| `createdByUserId`                                     | Always set (Users are never deleted — ADR-0007 — so this FK is `onDelete: Restrict`, not nullable).                                                                                                                                                                                                                               |
| `name`                                                | Unique per Department among non-deleted rows — **ADR-0027, resolves OD-09.**                                                                                                                                                                                                                                                      |
| `status`                                              | `ACTIVE` \| `DISABLED`. Independent of `deletedAt` — see "Lifecycle" above.                                                                                                                                                                                                                                                       |
| `composition`, `source`, `scriptRef`, `outputPattern` | Legacy `composition`/`src`/`script`/`output` — opaque strings passed through to a future Job/the Render Worker. Studio never interprets them.                                                                                                                                                                                     |
| `description`                                         | Optional. Used as the YouTube description on delivery — **implemented, Phase 9.**                                                                                                                                                                                                                                                 |
| `tags`                                                | String array. YouTube tag templates with `{{layer}}` placeholders — **Templates only store this**; substitution happens at delivery time (`features/delivery/domain/tag-substitution.ts`, Phase 9).                                                                                                                               |
| `youtubeTargetId`                                     | **Implemented, Phase 9** (ADR-0039, resolves OD-36). Optional connected `YouTubeTarget` — verified server-side to belong to this Template's own Department and be `CONNECTED` on every write (`verify-youtube-target.ts`). `onDelete: SetNull`. See [../integrations/youtube.md](../integrations/youtube.md) "Template ↔ Target". |
| `assets`                                              | Ordered `TemplateAsset[]` — see below. **Zero assets is valid** — ADR-0027, resolves OD-10 (a fully static render has no Job-supplied inputs).                                                                                                                                                                                    |
| `createdAt`, `updatedAt`                              |                                                                                                                                                                                                                                                                                                                                   |
| `deletedAt`, `deletedByUserId`                        | Soft-delete marker (ADR-0006). Both `null` until deleted; set together, never individually.                                                                                                                                                                                                                                       |

### Template Asset (slot definition)

| Field           | Notes                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | Internal identity. **Not** what a future Job refers to — see "Stable asset identifiers".                                                                                                                    |
| `key`           | Stable slot identifier a future Job fills in (legacy `name`) — also the only author-facing label for the slot. Unique within the Template (`@@unique([templateId, key])`).                                  |
| `kind`          | `DATA` (literal text) \| `IMAGE` \| `AUDIO` \| `VIDEO`. Legacy's free-text `type` becomes a validated enum; legacy's server-injected `script` kind is not author-visible.                                   |
| `composition`   | Passed through to the future Job asset. Opaque to Studio.                                                                                                                                                   |
| `layer`         | Passed through; also the `{{layer}}` substitution token for tags.                                                                                                                                           |
| `imageRatio`    | `PORTRAIT_9_16` \| `LANDSCAPE_16_9` \| `SQUARE` \| `ANY` — **required for `kind: IMAGE`, forbidden for every other kind.** Enforced in `checkAssetKindConsistency` (domain) and mirrored in the Zod schema. |
| `defaultFileId` | Optional Gallery File reference — **ADR-0027, resolves OD-11.** Allowed only for `IMAGE`/`AUDIO`/`VIDEO`; forbidden for `DATA`. See "File Gallery Integration" below.                                       |
| `order`         | Explicit ordering. Rewritten in full on every Template update (see "Updating Template assets").                                                                                                             |

**Not present, deliberately:** a `required`/`optional` flag. Legacy has no such concept —
every declared asset slot must be supplied by a Job — and Job creation isn't part of this
phase regardless, so adding the field now would be speculative.

### Stable asset identifiers

A slot's `key` — not its database `id` — is the stable handle a future Job (and any
render-time substitution) will use. `key` is validated to letters/digits/hyphen/underscore
only, and duplicate keys within one Template are rejected both client-side
(`findDuplicateAssetKey`) and by the database (`@@unique([templateId, key])`). There is no
support for intentionally duplicate keys — the domain doesn't need it, and it would make a
future Job's "fill in every slot" contract ambiguous.

### File Gallery Integration

A Template asset of kind `IMAGE`/`AUDIO`/`VIDEO` may optionally set `defaultFileId` to a
Gallery File. This is validated on **every** create/update:

- The referenced File must exist, be a `GALLERY_ASSET` (never a `JOB_ARTIFACT`, which
  doesn't exist yet regardless), and belong to the **Template's own Department** — never
  the actor's department, since ADMIN may author a Template for a department other than
  their own. `features/templates/use-cases/verify-file-references.ts` performs this check
  by looking the id(s) up scoped to that department; a cross-department or nonexistent id
  simply doesn't come back, and the resulting error names no specific id or department
  (the same existence-leak caution [../architecture/authorization.md](../architecture/authorization.md)
  applies to a specific resource lookup).
- A client-supplied File id is **never trusted as-is** — this lookup is the only thing
  that decides whether a reference is accepted, exactly mirroring how a client-supplied
  `departmentId` is never trusted (CLAUDE.md §5/§8).

### Template → File dependency (deletion safety)

If any Template asset (of any Template, deleted or not) currently defaults to a File,
that File cannot be deleted: `assertNoActiveTemplateDependencies`
(`features/files/use-cases/authorize-file-management.ts`) — the direct Phase 5 sibling of
ADR-0025's (still-unimplemented) `assertNoActiveJobDependencies` — is called from the File
deletion use case and throws a clean `conflict` error naming no internals. See ADR-0027
for the full reasoning, including why this check is **not** scoped to non-deleted
Templates only.

A Template can therefore never silently end up pointing at a missing File (Phase 5 brief
§13) — the File simply can't be removed while referenced, full stop.

### Department ownership

A Template belongs to one Department, fixed at creation and never reassigned (matches
OD-08's "not supported" default for every resource). USER/MANAGER see and use only their
department's Templates; ADMIN sees and manages all, and may choose an explicit target
department when creating one (validated against `departmentExists`, mirroring
`features/files/use-cases/upload-file.ts`'s `resolveTargetDepartment`). A future Job can
only be created from a Template in the Job's own Department.

### Creation & editing

- **Who:** MANAGER and ADMIN. **Confirmed, Phase 5** (see
  [authorization.md](authorization.md) and
  [../development/open-decisions.md](../development/open-decisions.md) OD-04): a USER may
  view/list Templates in their own Department but not author, edit, enable/disable, or
  soft-delete them.
- **Editing replaces the Template's full asset list wholesale**, not a per-asset diff —
  simple and safe, because a Template's live configuration never needs row-level
  continuity for a historical Job (a future Job holds its own immutable snapshot,
  ADR-0010). Scalar fields (name, composition, tags, ...) are all resent on every edit
  too — the create and edit forms/schemas are intentionally the same shape.
- **Editing a Template never changes an existing Job** — this is the key behavioral
  improvement enabling safe template evolution; see "Template / Job contract" below.
- **Validation on save** (`features/templates/schemas/template-input.schema.ts`,
  `features/templates/domain/template-asset-rules.ts`):
  - `name` non-empty; unique per Department among non-deleted rows (ADR-0027) — a
    database-level violation is translated to a clean `conflict` error, never a raw
    Prisma/SQL error.
  - Asset `key`s unique within the Template; `kind` a valid enum value.
  - `imageRatio` required for `IMAGE`, forbidden otherwise; `defaultFileId` forbidden for
    `DATA`, otherwise verified against the Template's Department.
  - A zero-asset Template is valid (ADR-0027, resolves OD-10).

### Aspect ratio checking

- `imageRatio` on a Template asset is a **named target** (`PORTRAIT_9_16` /
  `LANDSCAPE_16_9` / `SQUARE` / `ANY`), not a numeric comparison — Studio records the
  author's intent here. Actually measuring an uploaded image's ratio against that intent
  (with a tolerance, never legacy's exact float equality) is a **File upload / Job
  creation-time** concern, not something the Template domain itself computes; no such
  check exists yet because no feature accepts an image against a specific Template slot
  yet (that's Jobs, a later phase). The exact tolerance value stays **OD-14, still open**.

### Template / Job contract — implemented, Phase 6

> **Template is mutable. A Job's history is immutable.**

`features/jobs/use-cases/create-job.ts`: (1) identifies a Template by id via
`findTemplateInScope` (department-scoped for USER/MANAGER, all departments for ADMIN),
(2) verifies it is `ACTIVE` and not soft-deleted, checked fresh at Job-creation time —
never trusting that a UI picker already filtered it, (3) resolves its ordered asset
slots, (4) requires a value for every slot (there is no optional-slot concept), and (5)
copies everything it needs — the Template's render-relevant fields into `Job.snapshot`
(JSONB) and the resolved asset values into `JobAsset` rows — at creation time (ADR-0010,
ADR-0028). After that point, editing or even soft-deleting the Template has **zero**
effect on that Job's meaning — verified end-to-end: editing a Template after creating a
Job from it leaves the Job's snapshot untouched. The `templateId` FK stays for
convenience/joins and active-dependency checks, never as the source of truth for a
historical Job's content.

### Template versioning

Not implemented, and not planned as a general mechanism (matches the Phase 0 design
intent) — Studio relies on per-Job snapshots (ADR-0010) for historical correctness instead
of a Template version history. If authoring UX (diff, rollback) is ever wanted, that is a
new, separate decision — not a byproduct of this feature.

### Open decisions (still unresolved)

> **`OPEN DECISION` — OD-14, aspect-ratio tolerance value.** Exact epsilon for "close
> enough" when a future feature actually compares an uploaded image against a Template
> slot's `imageRatio`. Unaffected by this phase, since no such comparison exists yet.

> **OD-36, YouTube target scoping — ✅ RESOLVED, Phase 9.** `youtubeTargetId` is now a
> real field on Template — see "Fields" above and
> [../integrations/youtube.md](../integrations/youtube.md).
