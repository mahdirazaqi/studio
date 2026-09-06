# Security Requirements

Binding security requirements for Studio. Many are direct responses to
[legacy defects](../legacy/known-issues.md).

## 1. Authentication

| Surface          | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web panel        | **Implemented, Phase 2.** Custom DB-backed session (opaque token, httpOnly cookie, SHA-256 hash stored server-side — ADR-0020, [../architecture/authentication.md](../architecture/authentication.md)). Only `ACTIVE` users authenticate — enforced by the same lookup that resolves the session, so disabling a user invalidates every session on the next request. Passwords hashed with bcrypt (`bcryptjs`, cost 12). Department archive doesn't exist yet (OD-07 open) so that half is not yet applicable.                                                                                                                                  |
| Server Actions   | Every action resolves and verifies the session before doing anything. No anonymous Server Action mutates state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Worker REST      | **Implemented, Phase 7.** **Every** `/api/worker/v1/**` endpoint (and the Worker-auth branch of `/api/files/[fileId]`) requires the shared `WORKER_API_KEY` as `Authorization: Bearer <key>`, checked with a timing-safe comparison (`@/server/worker-auth`, ADR-0004, ADR-0032). No unauthenticated worker endpoint — ever. Required env var; the process refuses to start without it.                                                                                                                                                                                                                                                         |
| Telegram         | **Implemented, Phase 8.** Identity via phone-linked `User` (`features/telegram/use-cases/resolve-telegram-identity.ts`) — only an `ACTIVE` User's linked Telegram id resolves to an `Actor`; unlinked or since-disabled users are refused and shown the linking prompt. The webhook itself is verified with Telegram's own secret-token mechanism (`@/server/telegram-webhook-auth`, timing-safe comparison, same technique as `@/server/worker-auth`) before any update is processed. Optional feature — unconfigured (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET` unset) means the webhook responds `503`, never an unauthenticated `200`. |
| Health endpoints | No sensitive data; may be unauthenticated but must expose nothing about domain state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## 2. Authorization

- **Implemented, Phase 3.** Enforced **server-side in the application layer**, on every
  entry point, for every operation, via `@/server/authz`'s capability registry — see
  [../domain/authorization.md](../domain/authorization.md) (the matrix) and
  [../architecture/authorization.md](../architecture/authorization.md) (the mechanism).
  An unregistered capability fails loudly (`internal` error) rather than silently
  allowing or denying — a missing policy is a bug, not a valid state.
- **UI restrictions are not authorization.** Hiding a button, disabling a field, omitting
  a route — none of these are access control. `/users` and `/departments` are protected
  server-side in the page itself, independent of whether the sidebar/nav renders a link
  to them for the current role.
- **Department isolation** enforced in use cases (`assertSameDepartment` /
  `assertDepartmentScopeOrNotFound`) and available to repositories via
  `departmentScopeFilter(actor)`, spread into a query's `where` clause so the boundary is
  encoded in the query itself.
- **404 over 403** for cross-department access to specific resources (don't leak
  existence) — `assertDepartmentScopeOrNotFound` throws `not_found`, never `forbidden`,
  for this case specifically.
- **Privilege escalation is structurally blocked, not just discouraged:** nobody can
  change their own role or their own active/disabled status through the implemented
  policy functions, including ADMIN (closes the "accidental ADMIN lockout" risk for
  self-service paths without a "last remaining ADMIN" count check); a MANAGER can only
  ever create/manage `USER`-role accounts, never mint or touch a MANAGER or ADMIN; a
  MANAGER can only act within their own Department. See
  [../domain/users.md](../domain/users.md) "Creation"/"Disabling" and
  [../architecture/authorization.md](../architecture/authorization.md).
- The Worker principal has a **narrow capability set** (Worker API only), no Department,
  and never becomes an `Actor` — it is a categorically different, not-yet-implemented
  principal type (OPEN DECISION OD-27 on its credential mechanism).
- **Implemented, Phase 8.** Telegram users get the **identical** role + department checks
  as web users — both resolve to the same `Actor` shape and go through the same
  `authorize()`-gated use cases (`docs/integrations/telegram.md`), never a parallel
  Telegram-only permission function. This closes the single most serious legacy defect on
  this surface: legacy's Telegram bot had **no** authorization checks at all, letting any
  linked user cancel every non-terminal Job system-wide via "Cancel All". Studio's
  equivalent (`cancelAllJobsForTelegram`) is scoped to the actor's own Department and
  cancelable-state Jobs only.
- **Callback data is never trusted just because Studio generated it.** Every Telegram
  inline-button id (Template, Job) is re-resolved through the same department-scoped,
  state-checking use case a fresh request would use
  (`features/telegram/domain/callback-data.ts` decodes only a shape; the use case layer
  decides everything else) — a stale button (disabled/deleted Template since the button
  was sent) or a hand-crafted id naming another Department's resource is rejected, not
  silently honored. Verified end-to-end.

## 3. Secure state transitions

- The Job state machine (ADR-0013) rejects any transition not explicitly allowed.
- The Worker cannot set an arbitrary state value (legacy accepted any integer).
- State changes that trigger side effects (notifications, delivery) are idempotent or
  guarded against double-processing.

## 4. Concurrency / race conditions

- **Atomic job claim** — `SELECT ... FOR UPDATE SKIP LOCKED` (or equivalent). Two Workers
  can never claim the same Job (legacy `fetch` race).
- **Retry** checks the upload cap and creates the new Job in one transaction; the
  original is never mutated destructively (legacy deleted-then-checked).
- Upload-cap enforcement must be race-safe (transactional reservation, not
  read-then-write).
- Bulk operations (cancel) are per-item transactional.

## 5. Input validation

- **Every boundary validates every input** with a schema (Zod or equivalent): Server
  Actions, Route Handlers, Telegram adapter. Never trust arguments.
- Reject unknown fields; coerce nothing silently.
- IDs validated for format before use (legacy threw unhandled `CastError` 500s on
  malformed ObjectIds).
- Numeric ranges enforced (`progress` 0–100, `duration` ≥ 0).
- Enum values validated (asset `kind`, job `state`, `imageRatio`).

## 6. File upload security

**Implemented, Phase 4** (`features/files`, `@/server/media`, ADR-0026) — see
[../architecture/files.md](../architecture/files.md) for the mechanism.

- Validate **both** the file extension **and** the sniffed content type against an
  allow-list. Reject on mismatch. Sniffing uses `file-type` (magic bytes), never the
  client's declared `File.type`.
- Enforce a **maximum size** per kind — 25MB image / 100MB audio / 500MB video
  (ADR-0026, resolves OD-21).
- **Store under a system-generated name** (UUID + extension). The original filename is
  metadata only, never used for storage paths or shell commands.
- Store outside any web-served directory unless access is mediated by an authorized
  handler — the local storage adapter writes under `STORAGE_LOCAL_DIR` (outside
  `public/`); every read goes through the session-authenticated, department-scoped
  `/api/files/[fileId]` route, never a static/public URL.
- Probe media metadata: image dimensions via a pure-JS library (`image-size`), no
  subprocess. Audio/video duration probing is deferred — it would need `ffprobe`, not
  introduced in this phase (see [../domain/files.md](../domain/files.md)).
- Never trust `Content-Type` from the client as authoritative.
- The local storage adapter's key resolution refuses to resolve outside its configured
  root, as defense in depth, even though `key` is always system-generated and never
  derived from user input (Security Requirements §8).

## 7. Shell command injection

- **Studio never calls `child_process.exec` with a constructed command string.**
- Media tooling (ffmpeg, ImageMagick) is invoked via `execFile` / `spawn` with an
  **argument array**, validated absolute input paths, an explicit timeout, and bounded
  CPU/memory where possible (ADR-0015).
- Any future need to shell out goes through one reviewed helper that **forbids** string
  commands by type.
- Legacy built ``exec(`convert ${filepath} ...`)`` with a user-influenced `filepath`
  and a sanitizer that only stripped non-ASCII — a real command-injection hole. Do not
  reproduce.

## 8. Path traversal / unsafe filenames

- No user-supplied string ever contributes to a filesystem path or storage key.
- Storage keys are generated; job/artifact directories are derived from validated IDs
  only.
- Reject filenames containing path separators or null bytes at the boundary (defense in
  depth even though they aren't used for paths).

## 9. Secret management

- Secrets (DB URL, Worker credential, Telegram bot token, YouTube OAuth client secret)
  come from **environment / a secret manager**, never the repo. There is deliberately no
  session-signing secret to manage — sessions are opaque DB-backed tokens, not signed
  JWTs (ADR-0020); tampering with a session cookie fails a hash lookup rather than
  needing a secret to detect.
- `.env` files are git-ignored; only `.env.example` with **placeholder** values is
  committed.
- OAuth tokens for YouTube targets are **encrypted at rest**.
- **Implemented, Phase 7 (ADR-0032):** the Worker API key (`WORKER_API_KEY`) lives only
  in environment configuration — **not** in a database table, so "hashed at rest" does
  not apply the way it would to a stored credential; the environment itself is the trust
  boundary, the same one `DATABASE_URL` already relies on. Compared with a timing-safe
  check (`@/server/worker-auth`), never logged, never echoed in an error response.
  Rotation is a redeploy with a new value — there is no revoke-without-redeploy path
  (a deliberate simplification; see ADR-0032 for the trade-off).
- **Implemented, Phase 8:** `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` follow the
  identical environment-only pattern as `WORKER_API_KEY` — no database table, timing-safe
  comparison for the webhook secret (`@/server/telegram-webhook-auth`), never logged.
  Unlike `WORKER_API_KEY`, both are **optional**: Studio does not require Telegram to be
  configured to start, and an unconfigured webhook fails closed (`503`), never open.
- No secret is logged. Log redaction for tokens/keys.
- **Do not copy any real secret out of the legacy repo** (the legacy `.env` contains live
  keys — treat them as compromised, do not reuse).

## 10. Rate limiting

- Worker API endpoints rate-limited per credential — **not implemented, Phase 7**
  (OD-41 stays open; no rate-limiting infrastructure exists yet to hang this on).
  Worker authentication remains mandatory regardless.
- Auth endpoints (login, Telegram link) rate-limited per IP / per identity to slow
  brute force.
- Telegram webhook protected by the secret token + basic flood control.
- Layer/mechanism = OPEN DECISION (edge middleware, a limiter library, infra).

## 11. CSRF & Server Actions

- Server Actions are POST-only, same-origin; rely on framework CSRF protections **plus**
  a server-side session + authorization check in the use case.
- No state-changing GET requests anywhere in Studio's own surfaces (legacy had a
  side-effecting `GET /jobs/fetch`).

## 12. SSR / server-side authorization

- Server Components that render sensitive data resolve the session and authorize **before
  querying**; they pass an `actor` context to read functions that apply department
  scoping.
- Never render data fetched without an authorization check just because it's "server
  side".

## 13. Protecting internal APIs

- **There are no internal REST APIs** for panel features (ADR-0003) — this removes a
  large attack surface by construction.
- The only HTTP surfaces are: the Worker API (authenticated), the Telegram webhook
  (secret-token verified), and health checks (no domain data).

## 14. Auditability

- Audit every privileged action: user create/disable/role-change, template
  disable/soft-delete, job cancel/retry, department archive, YouTube target
  connect/disconnect. No `AuditEntry` model exists yet (all deferred, OD-23). "Worker
  credential create/revoke" no longer applies as an auditable _action_ — ADR-0032's
  single-env-var key has no create/revoke operation in the app; rotation is a redeploy,
  outside Studio's own audit trail by construction.
- Audit entries record actor, target, action, before/after where meaningful, timestamp,
  department. Never deleted (retention window = OPEN DECISION).
- Job state transitions and delivery outcomes are themselves an audit trail (Jobs are
  never deleted).

## 15. Data protection

- Historical integrity (ADR-0009/0010) is also a security property: an audit record you
  can't trust to be complete is worthless.
- YouTube OAuth tokens: encrypted as noted above. Worker key: environment-only, not a
  database secret (ADR-0032) — see §9. Session tokens:
  hashed (SHA-256) at rest, same reasoning as a password hash — a database read alone
  never yields a usable session.
- PII is minimal (name, email, phone). **Implemented, Phase 8:** `User.phone` and
  `User.telegramUserId` are real, populated columns now, not just documented-future
  fields — both are ordinary PII (not secrets), never logged in cleartext beyond what the
  structured logger's key-based redaction already catches (`phone` doesn't match a
  redaction pattern today; nothing currently logs it — `link-telegram-account.ts` logs
  only the Telegram numeric id on failure, never the submitted phone number). No user
  deletion → if legal erasure is ever required, design anonymization deliberately (OPEN
  DECISION).

## 16. Dependency & supply chain

- Pin dependencies; review lockfile changes.
- Prefer maintained libraries; avoid the sprawl of near-duplicate packages seen in the
  legacy `package.json`.

## 17. Security checklist for any new feature

- [ ] Every entry point authenticates.
- [ ] The use case authorizes the actor for the specific resource + department.
- [ ] All input validated by schema at the boundary.
- [ ] No raw Prisma outside repositories; every scoped query is department-filtered.
- [ ] No `exec` with a string; no user input in paths.
- [ ] File uploads: type + size + generated name.
- [ ] State changes go through the state machine.
- [ ] Concurrency-sensitive writes are transactional / atomic.
- [ ] Privileged actions are audited.
- [ ] Secrets from env, nothing logged.
