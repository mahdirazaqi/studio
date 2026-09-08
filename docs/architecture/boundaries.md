# Boundaries: Server Actions vs REST vs Telegram

**`DECIDED`** — see ADR-0003, ADR-0004.

Studio must **not** become a REST API for its own UI. Internal operations use Next.js
server primitives. REST exists only where an external system needs a stable HTTP contract.

## 1. Decision table

| Operation kind                                                                                                  | Mechanism                                                                                                                                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Internal UI read (page/list/detail)                                                                             | **Server Component** calling a use case / read model                                                                                                     | No client fetch, no API route.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Internal UI mutation/command (create job, edit template, disable user, cancel job, retry, upload to gallery, …) | **Server Action** → use case                                                                                                                             | Progressive-enhancement friendly; CSRF-protected by framework + same-origin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Client-side incremental data (search-as-you-type, polling job progress)                                         | **Server Action** or a React Server Component re-render / streaming; a Route Handler **only if** a genuine polling/streaming need can't be met otherwise | Prefer `revalidate`/streaming. If polling is required, it's still an _internal_ concern — keep it under `app/` and authenticated by session, not part of the "public" API surface.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Render Worker** communication                                                                                 | **Route Handler** under `app/api/worker/**`                                                                                                              | **Implemented, Phase 7; per-Worker Department-scoped API keys, Phase 11.** `app/api/v1/worker/jobs/{next,[jobId],[jobId]/state,progress,duration}`, each a thin `defineRouteHandler` over a Phase 6 use case, authenticated by `@/server/worker-auth` (a `WorkerApiKey` credential, Department-scoped, ADR-0040 — supersedes ADR-0032's single static key). See [worker-api.md](../integrations/worker-api.md).                                                                                                                                                                           |
| **Telegram** updates                                                                                            | **Route Handler**, `app/api/telegram/webhook`                                                                                                            | **Implemented, Phase 8.** Webhook mode (resolves OD-34, ADR-0035) — authenticated by Telegram's own secret-token header (`@/server/telegram-webhook-auth`), then delegates entirely to the Telegram Adapter (`features/telegram/bot/composer.ts`) → the same use cases the dashboard calls. See [telegram.md](../integrations/telegram.md).                                                                                                                                                                                                                                               |
| Binary asset delivery (a File's bytes to `<img>`/`<audio>`/`<video>` `src`)                                     | Route Handler, `app/api/files/[fileId]`                                                                                                                  | **Implemented, Phase 4; extended Phase 7.** Not an internal-REST exception in the usual sense — no business logic, just an authenticated read-and-stream. A browser media element fetches its `src` as a plain GET; there is no Server Component/Action equivalent. Session-authenticated for the panel, `Cache-Control: private, no-store`, never a public/signed URL; also accepts the Worker's shared credential (unscoped by department) so the Render Worker can download input Files — the two paths never fall through to each other. See [files.md](files.md) "Access & preview". |
| Health/readiness probes                                                                                         | Route Handler under `app/api/health`                                                                                                                     | Infra concern, no domain data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Webhooks from a future external integration (if ever needed)                                                    | Route Handler                                                                                                                                            | Not currently required — Studio has no such integration today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 2. Rules

1. **No internal REST endpoints for UI features.** If you are tempted to add
   `app/api/jobs/route.ts` for the panel, use a Server Action instead.
2. **Every entry point converges on the same use case.** A Server Action and a Route
   Handler for "create job" both call `createJob(...)`. Business rules, validation, and
   authorization live in the use case, not the transport.
3. **Route Handlers are thin.** Parse + authenticate + validate + call use case + map
   result to HTTP. No business logic.
4. **Server Actions are thin.** Authenticate (get session) + validate input (Zod) + call
   use case + return typed result. No business logic, no direct Prisma.
5. **Validate at the boundary regardless of transport.** Server Actions receive
   untrusted input just like HTTP endpoints — never trust arguments.
6. **The Worker API is versioned** — **Implemented, Phase 7:** a path segment,
   `/api/v1/worker/...` (resolves the OPEN DECISION on exact scheme). Internal Server
   Actions are not versioned; they evolve with the app.

## 3. Why

- Server Actions remove a whole class of hand-rolled endpoint code, DTO duplication, and
  client fetch wiring, and they keep authorization on the server by construction.
- A small, explicit REST surface for the Worker means the external contract is easy to
  document, test, secure, and keep stable — and it does not leak internal model changes.
- The legacy system exposed everything (GraphQL for internal + REST for worker) and the
  worker REST surface ended up unauthenticated and over-broad. Keeping the external
  surface deliberately small is a direct response to that.

## 4. CSRF / auth notes for Server Actions

- Server Actions are POST-only and same-origin; Next.js adds protections, but the use
  case must still **verify the session and the caller's role/department** every time.
- Never expose a Server Action that mutates state without an authorization check inside
  the use case it calls.
- Long-running work triggered by a Server Action (e.g. kicking off delivery) must be
  handed to a durable mechanism, not awaited inline past the response.
  (Durable-work mechanism = **OPEN DECISION**, see [data-flow.md](data-flow.md).)
