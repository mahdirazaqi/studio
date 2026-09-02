# Security Requirements

Binding security requirements for Studio. Many are direct responses to
[legacy defects](../legacy/known-issues.md).

## 1. Authentication

| Surface | Requirement |
|---|---|
| Web panel | Session-based auth. Only `ACTIVE` users authenticate. Sessions invalidated immediately on user disable or department archive. Session library = OPEN DECISION. |
| Server Actions | Every action resolves and verifies the session before doing anything. No anonymous Server Action mutates state. |
| Worker REST | **Every** endpoint requires a Worker service credential (ADR-0004). No unauthenticated worker endpoint — ever. Mechanism = OPEN DECISION (default: hashed API key as Bearer token). |
| Telegram | Identity via phone-linked `User`. Webhook requests verified with Telegram's secret token. Unlinked / disabled users are refused. |
| Health endpoints | No sensitive data; may be unauthenticated but must expose nothing about domain state. |

## 2. Authorization

- Enforced **server-side in the application layer**, on every entry point, for every
  operation. See [../domain/authorization.md](../domain/authorization.md).
- **UI restrictions are not authorization.** Hiding a button, disabling a field, omitting
  a route — none of these are access control.
- **Department isolation** enforced in use cases and **defensively** in repositories/read
  functions (every scoped query filters by department unless ADMIN).
- **404 over 403** for cross-department access to specific resources (don't leak
  existence).
- The Worker principal has a **narrow capability set** (Worker API only) and no
  Department.
- Telegram users get the **identical** role + department checks as web users.

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

- Validate **both** the file extension **and** the sniffed content type against an
  allow-list. Reject on mismatch.
- Enforce a **maximum size** per kind (limits = OPEN DECISION).
- **Store under a system-generated name** (UUID + extension). The original filename is
  metadata only, never used for storage paths or shell commands.
- Store outside any web-served directory unless access is mediated by an authorized
  handler.
- Probe media metadata (dimensions/duration) in a sandboxed, resource-bounded way.
- Never trust `Content-Type` from the client as authoritative.

## 7. Shell command injection

- **Studio never calls `child_process.exec` with a constructed command string.**
- Media tooling (ffmpeg, ImageMagick) is invoked via `execFile` / `spawn` with an
  **argument array**, validated absolute input paths, an explicit timeout, and bounded
  CPU/memory where possible (ADR-0015).
- Any future need to shell out goes through one reviewed helper that **forbids** string
  commands by type.
- Legacy built `` exec(`convert ${filepath} ...`) `` with a user-influenced `filepath`
  and a sanitizer that only stripped non-ASCII — a real command-injection hole. Do not
  reproduce.

## 8. Path traversal / unsafe filenames

- No user-supplied string ever contributes to a filesystem path or storage key.
- Storage keys are generated; job/artifact directories are derived from validated IDs
  only.
- Reject filenames containing path separators or null bytes at the boundary (defense in
  depth even though they aren't used for paths).

## 9. Secret management

- Secrets (DB URL, Worker credential, Telegram bot token, YouTube OAuth client secret,
  session secret) come from **environment / a secret manager**, never the repo.
- `.env` files are git-ignored; only `.env.example` with **placeholder** values is
  committed.
- OAuth tokens for YouTube targets are **encrypted at rest**.
- The Worker API key is stored **hashed**; the plaintext is shown once at creation.
- No secret is logged. Log redaction for tokens/keys.
- **Do not copy any real secret out of the legacy repo** (the legacy `.env` contains live
  keys — treat them as compromised, do not reuse).

## 10. Rate limiting

- Worker API endpoints rate-limited per credential.
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
  connect/disconnect, Worker credential create/revoke.
- Audit entries record actor, target, action, before/after where meaningful, timestamp,
  department. Never deleted (retention window = OPEN DECISION).
- Job state transitions and delivery outcomes are themselves an audit trail (Jobs are
  never deleted).

## 15. Data protection

- Historical integrity (ADR-0009/0010) is also a security property: an audit record you
  can't trust to be complete is worthless.
- YouTube OAuth tokens, session secrets, Worker keys: encrypted / hashed as noted above.
- PII is minimal (name, email, phone). No user deletion → if legal erasure is ever
  required, design anonymization deliberately (OPEN DECISION).

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
