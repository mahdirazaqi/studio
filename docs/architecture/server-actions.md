# Server Actions

**`DECIDED`** — ADR-0003. Internal mutations use Server Actions. This page documents the
convention implemented in Phase 1.

## Helper

`src/server/actions/index.ts` exports `defineAction` and the `ActionResult<T>` type.

```ts
// src/features/<feature>/actions/create-thing.action.ts
"use server";

import { defineAction } from "@/server/actions";
import { createThingSchema } from "@/features/things/schemas";
import * as useCases from "@/features/things/use-cases";

export const createThing = defineAction({
  name: "things.create",
  input: createThingSchema, // optional Zod schema
  auth: "required", // "required" (default) | "public"
  handler: async ({ input, actor }) => useCases.createThing(actor, input),
});
```

## What `defineAction` guarantees

Flow: **input → validate (Zod) → authenticate → handler (use case authorizes) → result**

1. **Validation.** If `input` schema is given, the raw argument is parsed with
   `parseInput`. A failure returns `{ ok: false, error }` with `error.fieldErrors`.
2. **Authentication.** `auth: "required"` (default) resolves the session via
   `requireUser()` and passes an `Actor` to the handler. `auth: "public"` passes
   `Actor | null`.
3. **Delegation.** The handler calls a use case. The use case — not the action — performs
   authorization (`authorize(actor, capability, { departmentId })`) and all business
   rules.
4. **Never throws to the client.** Any thrown `AppError` or unknown error is converted by
   `toPublicError` into `{ ok: false, error }`. Internal errors are logged with full
   detail and returned as a generic message.

## Return type

```ts
type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: PublicError };
```

`PublicError` = `{ kind, code, message, fieldErrors?, details? }` — always safe to render.

## Rules

- Actions are **thin**. No business logic, no Prisma, no cross-feature calls.
- One action = one use case (or a small orchestration of the same feature's use cases).
- The `"use server"` file exports only actions.
- Client components call actions and branch on `result.ok`; they render
  `result.error.fieldErrors` inline on forms.
- Long-running work is handed to the durable-work mechanism (OPEN DECISION OD-40), not
  awaited past the response.
- CSRF: Server Actions are POST + same-origin; the use case still re-checks the session
  and authorization every time.
