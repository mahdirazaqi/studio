# REST Route Handlers

**`DECIDED`** — ADR-0004. REST exists **only** for external clients (the Render Worker;
later the Telegram webhook). Internal UI never uses REST. This page documents the
convention implemented in Phase 1.

## Helper

`src/server/api/index.ts` exports `defineRouteHandler` and `healthResponse`.

```ts
// src/app/api/worker/v1/jobs/next/route.ts   (NOT built in Phase 1 — illustration)
import { defineRouteHandler } from "@/server/api";
import { authenticateWorker } from "@/features/jobs/server/worker-auth";
import { claimNextJob } from "@/features/jobs/use-cases/claim-next-job";

export const POST = defineRouteHandler({
  name: "worker.jobs.next",
  authenticate: authenticateWorker, // throws unauthenticated/forbidden to reject
  handler: async ({ log }) => {
    const job = await claimNextJob();
    return job ?? null; // null -> 204 No Content
  },
});
```

## What `defineRouteHandler` guarantees

Flow: **request → authenticate → validate (params/query/body) → handler → JSON**

1. **`authenticate` is mandatory.** There is no unauthenticated external endpoint in
   Studio (legacy K1). It receives the `Request` and throws an `AppError` to reject.
2. **Validation.** Optional `params` / `query` / `body` Zod schemas are parsed with
   `parseInput`; failures become `422` with `error.fieldErrors`.
3. **Request id.** Reads or generates `x-request-id`, binds it to a child logger, and
   echoes it on every response (success and error).
4. **Error mapping.** Thrown `AppError` → its `httpStatus`; anything else → `500` with a
   generic body. Response shape on error: `{ error: PublicError, requestId }`.
5. **Success shape.** Handler return value is JSON with `successStatus` (default `200`).
   Returning `null`/`undefined` or setting `successStatus: 204` yields `204 No Content`.

## Rules

- Handlers are **thin**: authenticate, validate, delegate to a use case, map the result.
- The same use cases power Server Actions — no logic is duplicated in the handler.
- The Worker surface is **versioned** (`/api/worker/v1/...`) and deliberately minimal —
  only what the Worker needs (see [../integrations/worker-api.md](../integrations/worker-api.md)).
- Health/readiness (`/api/health`) is the only unauthenticated handler and exposes no
  domain data.

## Phase 1 status

Only `/api/health` exists. The Worker and Telegram endpoints are implemented in their
respective phases using this helper.
