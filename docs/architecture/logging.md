# Logging

## Mechanism

`src/server/logger.ts` — a minimal structured logger. Server-only. No external
dependency. This is a **foundation**, not an observability platform; a real transport
(OpenTelemetry, a shipper) can be added behind the same `Logger` interface later.

```ts
import { logger } from "@/server/logger";

logger.info("job claimed", { jobId, workerId });
const log = logger.child({ requestId }); // bound context on every entry
log.warn("retry rejected", { reason: "quota" });
```

## Behavior

- **Levels:** `debug` < `info` < `warn` < `error`; gated by `LOG_LEVEL` (`silent`
  disables all). Invalid/missing level falls back to `info`.
- **Format:** one JSON line per event in production; a readable line in development.
- **Context:** any structured fields are attached; `child(bindings)` merges persistent
  context (request id, action name, route name).
- **Severity routing:** `error` → `console.error`, `warn` → `console.warn`, else
  `console.log`.

## Redaction (required)

`redact()` runs on every context object before it is written. It recursively masks keys
whose name contains any of: `password`, `secret`, `token`, `apikey` / `api_key`,
`authorization`, `auth`, `cookie`, `session`, `credential`, `privatekey` / `private_key`,
`signature`, `otp`. `Error` objects are summarized (`name` + `message`; `stack` only
outside production). Depth is capped.

**Never log:** passwords, tokens, API keys, session identifiers, OAuth credentials, raw
uploaded file contents, or full PII payloads. If you must reference a user, log the id.

## Where logging happens

- `toPublicError` logs every handled error (`warn`) and every unexpected error (`error`)
  once, at the transport boundary. Use cases **throw**; they don't log-and-rethrow.
- Route Handlers bind `requestId` + `route` and pass `log` into the handler.
- Server Actions bind `action` name.
- Add domain-event logs (`job.state_changed`, `file.deleted`, …) in use cases where an
  operator or on-call would want the trail.
