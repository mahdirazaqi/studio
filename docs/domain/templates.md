# Domain: Templates

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

## Part B — Studio design

### Lifecycle

```
DRAFT? ──> ACTIVE ──> DISABLED ──> ACTIVE ...
                 └──> DELETED (soft)      (row kept forever)
```

| State            | In creation pickers? | Editable?            | Resolvable by historical Jobs? |
| ---------------- | -------------------- | -------------------- | ------------------------------ |
| `ACTIVE`         | yes                  | yes                  | yes                            |
| `DISABLED`       | **no**               | yes                  | yes                            |
| `DELETED` (soft) | **no**               | no (or restore only) | **yes**                        |

- **Templates are soft-deleted only** (ADR-0006). The row is **never** physically
  removed. `deletedAt` + `deletedByUserId`.
- **Disabled ≠ deleted.** Disabled = temporarily hidden from new-job creation, still
  fully intact and manageable. Deleted = also removed from management lists, retained
  purely so historical Jobs remain readable.
- **Disabling/deleting a Template must be enforced on every job-creation path** — web
  Server Action **and** Telegram. (Legacy leak: API bypassed the `disabled` check.)

### Fields (conceptual — final schema in [../data/database.md](../data/database.md))

| Field                                                    | Notes                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                     | Referenced by Jobs (and snapshots) forever.                                                                                                                         |
| `departmentId`                                           | **New in Studio.** Required. Scopes ownership.                                                                                                                      |
| `createdByUserId`                                        |                                                                                                                                                                     |
| `name`                                                   | Display/lookup name. Uniqueness scope = OPEN DECISION (see below).                                                                                                  |
| `status`                                                 | `ACTIVE` \| `DISABLED` \| `DELETED`.                                                                                                                                |
| `composition`                                            | Passed to the Worker. Opaque to Studio.                                                                                                                             |
| `source`                                                 | Legacy `src` — the Worker's project/source location. Opaque.                                                                                                        |
| `outputPattern`                                          | Legacy `output` — output naming/dir. Copied into the Job at creation.                                                                                               |
| `scriptRef`                                              | Legacy `script` — injected as the first job asset.                                                                                                                  |
| `description`                                            | Used as the YouTube description on delivery.                                                                                                                        |
| `tags`                                                   | YouTube tag templates with `{{layer}}` placeholders.                                                                                                                |
| `youtubeTargetId`                                        | Legacy `_channel`. Nullable. If set, Jobs from this Template may be delivered to that YouTube target. See [../integrations/youtube.md](../integrations/youtube.md). |
| `assets`                                                 | Ordered list of Template Assets (below).                                                                                                                            |
| `createdAt`, `updatedAt`, `deletedAt`, `deletedByUserId` |                                                                                                                                                                     |

### Template Asset (slot definition)

| Field         | Notes                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | Slot identifier; the key a Job must fill. Unique within the Template.                                                                                                      |
| `kind`        | Enum: `DATA` (literal text) \| `IMAGE` \| `AUDIO` \| `VIDEO`. (Legacy free-text `type` becomes a validated enum. `script` is not an author-visible kind — it is injected.) |
| `composition` | Passed through to the Job asset.                                                                                                                                           |
| `layer`       | Passed through; also the `{{layer}}` token for tag substitution.                                                                                                           |
| `imageRatio`  | For `IMAGE` kind: `PORTRAIT_9_16` \| `LANDSCAPE_16_9` \| `SQUARE` \| `ANY`.                                                                                                |
| `order`       | Explicit ordering.                                                                                                                                                         |

### Creation & editing

- **Who:** MANAGER and ADMIN for sure; whether a plain USER can author is an
  **OPEN DECISION** (see [authorization.md](authorization.md)).
- **Editing is a patch**, not a full replace (legacy required resending every field).
- **Editing a Template never changes existing Jobs** — Jobs hold an immutable snapshot
  (ADR-0010). This is the key behavioral improvement enabling safe template evolution.
- **Validation on save:**
  - `name` non-empty; uniqueness per the decided scope.
  - At least one asset slot (OPEN DECISION — is a zero-asset template valid?).
  - Asset `name`s unique within the template.
  - `kind` is a valid enum value.
  - `imageRatio` only meaningful for `IMAGE`.
  - If `youtubeTargetId` set, the target must exist and belong to the same Department
    (OPEN DECISION — are YouTube targets department-scoped?).
  - Duplicate-name attempts return a **clean validation error**, never a raw DB error
    (legacy bug).

### Aspect ratio checking

- Image aspect-ratio validation (Telegram and web upload) must use a **tolerance**
  (e.g. within ~1% of the target ratio), never exact floating-point equality (legacy
  High-severity bug). Exact tolerance value = OPEN DECISION.
- Ratio validation applies on **every** path that accepts an image for a slot, not just
  Telegram (legacy enforced it only in the bot).

### Department ownership

- A Template belongs to one Department. USER/MANAGER see and use only their department's
  Templates; ADMIN sees all.
- A Job can only be created from a Template in the **same Department** as the Job.

### Open decisions

> **`OPEN DECISION` — `name` uniqueness scope.** Options: (a) globally unique among
> non-deleted templates; (b) unique per Department; (c) unique per Department among
> non-deleted. _Consequence of global:_ matches legacy, but two departments can't both
> have a "Standard" template. _Consequence of per-department:_ natural isolation, but
> cross-department admin views show name collisions. Recommended: **unique per Department
> among non-deleted rows.**

> **`OPEN DECISION` — zero-asset templates.** Is a Template with no asset slots valid
> (e.g. a fully static render)? _Consequence of allowing:_ supports static intros/outros.
> _Consequence of forbidding:_ simpler Job creation (always has inputs).

> **`OPEN DECISION` — template versioning.** Studio currently relies on per-Job snapshots
> so Templates can be edited freely. An explicit version history for Templates (beyond
> the audit log) is not planned. _Consequence of adding it later:_ better authoring UX
> (diff, rollback); _of not:_ audit log + snapshots already cover correctness.
