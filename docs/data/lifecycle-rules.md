# Data Lifecycle Rules

The single reference for what can be deleted, when, and how. These rules are **binding**
(ADR-0005 through ADR-0009).

## Summary table

| Entity | Hard delete | Soft delete | Lifecycle mechanism | Why |
|---|---|---|---|---|
| **Job** | ❌ never | ❌ never | State machine (`CANCELED`, `ERROR` are states, not deletions) | Permanent audit / history / reporting record. |
| **Template** | ❌ never | ✅ yes (`status=DELETED` / `deletedAt`) | Soft delete; row retained forever | Historical Jobs must resolve their Template. |
| **User** | ❌ never | ➖ status only (`ACTIVE`/`DISABLED`) | Disable / re-enable | Historical records reference the User. |
| **Department** | ❌ (pending OPEN DECISION) | ➖ archive (`status=ARCHIVED`) recommended | Archive | Contains never-deletable Jobs. |
| **File — Gallery Asset** | ✅ when safe | ❌ | Explicit delete, dependency-checked | Media is costly; history doesn't depend on the row. |
| **File — Job Artifact** | ✅ automatically when safe | ❌ | Retention policy after Job completion | Transient output; snapshot retains context. |
| **TelegramWizardState** | ✅ by TTL | ❌ | Expiry sweep of stale rows | Ephemeral conversation state. |
| **AuditEntry** | ➖ (retention = OPEN DECISION) | ❌ | Long retention | Compliance / forensics. |

## Jobs — never deleted

- No API, use case, admin tool, migration, or cleanup job may delete a Job row.
- "Delete job" does not exist in any role's permissions.
- Cancellation → `state = CANCELED` (+ actor, timestamp, reason). The row stays.
- Failure → `state = ERROR` (+ `errorReason`). The row stays.
- Retry → a **new** Job, linked via `retryOfJobId`; the original is **not** touched.
- Consequence: Job storage grows monotonically. Archival/partitioning for scale is a
  future concern (OPEN DECISION) and must itself preserve full readability — it is never
  a deletion.

## Templates — soft delete only

- `status`: `ACTIVE` → `DISABLED` (reversible) → `DELETED` (reversible: restore).
- The database row is **never** physically removed.
- `DISABLED`: hidden from job-creation pickers; still fully editable and manageable.
- `DELETED`: hidden from pickers **and** from normal management lists; visible in
  history/admin views; still resolvable by every historical Job.
- Job creation must reject a `DISABLED`/`DELETED` Template on **every** path (web +
  Telegram). Legacy leaked this on the API path.
- Editing a Template (any status) never mutates existing Jobs — they hold snapshots.

## Users — disabled, never deleted

- `status`: `ACTIVE` ↔ `DISABLED`.
- No deletion operation exists.
- Disabling: revokes sessions immediately, blocks Telegram actions, keeps all historical
  references valid.
- "Personal data erasure" (if ever legally required) = a separate deliberate
  anonymization design, not row deletion. OPEN DECISION.

## Files — hard delete when safe

### "Safe to delete" definition

A File may be physically deleted (row + bytes) only when **all** hold:

1. No Job in an **active** state (`QUEUED`, `CLAIMED`, `RENDERING`, `DELIVERING`)
   references it as an input asset.
2. It is not currently being written / processed.
3. Deleting it does not remove information a **historical** Job needs — and it never
   does, because historical Jobs carry the identifying metadata in their snapshot
   (ADR-0010). After deletion the old Job shows "media no longer stored" with
   name/type/size intact.

If (1) or (2) fails, deletion is **blocked** with a clear reason.

### Gallery Assets

- Deleted only by explicit user action (role rules in
  [../domain/authorization.md](../domain/authorization.md)), subject to the safety check.
- If a Gallery Asset is referenced by an active Job, the user is told to wait or cancel
  that Job first.

### Job Artifacts

- Eligible for **automatic** physical deletion after the owning Job reaches a completed
  state (`UPLOADED`; possibly `CANCELED`/`ERROR` after a grace period).
- The Job row keeps `videoFileId`/`screenshotFileId`/`thumbnailFileId` — these become
  `null` (or a tombstone flag) after cleanup; the Job stays coherent.

> **`OPEN DECISION` — Job Artifact retention specifics.**
> - Delete the full rendered video immediately after successful required delivery, or
>   after N days?
> - Keep screenshot/thumbnail longer than the video (cheap, useful for the UI)?
> - Does successful YouTube delivery make the local copy redundant enough to purge?
> - Grace period for `ERROR`/`CANCELED` jobs before purging their artifacts (to allow
>   debugging / retry)?
> *Consequence of aggressive:* minimal storage, but no re-delivery and harder debugging.
> *Consequence of conservative:* storage grows with every render.
> Recommended starting point: **video purged after successful required delivery + 7-day
> grace; screenshot + thumbnail kept 90 days; all windows configurable.**

> **`OPEN DECISION` — one-off Telegram/upload inputs.** An input file uploaded solely for
> one Job (e.g. a Telegram-downloaded image) — is it a `JOB_ARTIFACT` (purgeable) or does
> the user get to promote it to a `GALLERY_ASSET`? Recommended: **default `JOB_ARTIFACT`,
> with an explicit "save to gallery" action.**

## TelegramWizardState — TTL

- A row represents an in-progress conversation. Updated on every inbound message.
- A scheduled sweep deletes rows not updated within the TTL window.
  > **`OPEN DECISION` — wizard TTL length.** e.g. 1 hour? 24 hours? Long enough that a
  > user finishing a form after lunch doesn't lose progress; short enough to stay tidy.

## Cleanup jobs

Studio needs scheduled maintenance tasks (mechanism = the background-work OPEN DECISION):
- Expire stale `TelegramWizardState` rows.
- Purge eligible `JOB_ARTIFACT` files per the retention policy.
- (Optionally) requeue/error out Jobs stuck in `CLAIMED`/`RENDERING` past a Worker
  timeout.

Each cleanup job must respect the never-delete rules for Jobs/Templates/Users and log
what it removed.
