# Server / Client Component Boundary

Next.js App Router. **Server Components are the default.** A component becomes a Client
Component (`"use client"`) only when it genuinely needs browser interactivity.

## Rules

1. **Default to Server Components.** Pages, layouts, and most presentational components
   are server components.
2. **`"use client"` only for:** state/effects, event handlers, browser APIs, or a
   client-only library (`next-themes`, Radix primitives via shadcn/ui).
3. **Push `"use client"` to the leaves.** A page stays a server component and renders a
   small interactive island, rather than making a whole subtree client-side.
4. **Never import `@/server/*` or `server-only` into a UI component.** Data is fetched in
   a Server Component (page/layout) or a Server Action and passed down as props.
   - Enforced by ESLint (`no-restricted-imports`) for
     `src/components/**`, `src/features/**/components/**`, `src/features/**/ui/**`.
5. **Server-only modules import `server-only`.** `env.ts`, `logger.ts`, `auth`, `authz`,
   `actions`, `api` all do — importing them from a client bundle is a build error.
6. **No secrets in client components.** Only `NEXT_PUBLIC_`-prefixed env values may reach
   the browser, and they must never be secrets (see [environment.md](environment.md)).
7. **Client-safe shared code** lives in `src/lib/*` and `src/types/*` and must not import
   server modules (e.g. `src/lib/roles.ts` holds the `Role` type so navigation can use it
   without pulling in the auth module).

## Data fetching

| Need                     | Do                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Page/list/detail data    | Server Component calls a `read/` function → repository. No client fetch.                                                                     |
| Mutation                 | Client component calls a **Server Action**; branches on `result.ok`.                                                                         |
| Freshness after mutation | `revalidatePath` / `revalidateTag` in the action, or router refresh.                                                                         |
| Incremental client data  | Prefer streaming / RSC re-render. A polling Route Handler is a last resort and is still session-authenticated, not part of the "public" API. |

**Do not** add React Query / SWR. The app is not API-dependent for its own UI. Introduce a
client cache only with a demonstrated need and an ADR.

## Current client components (Phase 1)

`theme-provider`, `theme-toggle`, `app-sidebar`, `app-header` (use `usePathname`), the
route `error.tsx` boundaries, `global-error.tsx`, and the shadcn/ui primitives that wrap
Radix. Everything else is a Server Component.
