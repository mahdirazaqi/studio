# Frontend Conventions

## 1. Nature of the app

- **Panel application only.** There is **no landing page**, no marketing site, no public
  content. Every route lives behind authentication (except the sign-in screen and
  health checks).
- Route groups: `(auth)` for sign-in; `(dashboard)` for the authenticated panel.

## 2. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js App Router |
| Language | TypeScript (strict) |
| UI | React — Server Components by default, Client Components only where interactivity requires |
| Styling | Tailwind CSS |
| Components | shadcn/ui (components copied into `src/components/ui`, owned by us) |
| Icons | lucide-react (ships with shadcn/ui) |
| Forms | React Hook Form + Zod resolver (Zod schema shared with the Server Action) |
| Data mutations | **Server Actions** (never client `fetch` to an internal API) |
| Data reads | Server Components calling read functions; `revalidate` / streaming for freshness |

## 3. Direction & language

- **LTR only.** No RTL support required. Layouts assume left-to-right.
- **English only.** All UI copy, labels, empty states, and **error messages** are in
  English. No i18n framework in scope.
- Dates/times: display in the user's locale/timezone where practical; store UTC.

## 4. Theming

- **Light**, **Dark**, and **System** (follow OS preference) — all three supported.
- Implement with Tailwind's `dark` class strategy + a theme provider that resolves
  `system` against `prefers-color-scheme` and persists the explicit choice.
- All colors via design tokens / CSS variables (shadcn/ui convention). No hard-coded hex
  in components.
- Every screen must be verified in both light and dark.

## 5. Responsive & mobile

- **Excellent mobile experience is a requirement**, not an afterthought. Operators use
  this on phones (consistent with the Telegram bot existing at all).
- Mobile-first Tailwind breakpoints. Design for ~360px width up.
- Touch targets ≥ 44px. No hover-only affordances.
- Tables → card/list layouts on small screens (job lists, file gallery, user lists).
- Long-running screens (job detail with live progress) must work with intermittent
  connectivity — show stale state clearly, don't block the UI.
- Desktop gets denser layouts, multi-column, keyboard shortcuts where useful.

## 6. Component & code conventions

- **Server Component by default.** Add `'use client'` only for a component that needs
  state, effects, event handlers, or browser APIs — and push it to the leaves.
- **No business logic in components.** Components render props and call Server Actions.
  Validation rules, authorization, derived business values → the server/use-case layer.
- **No direct data access in components.** Pages call read functions; components receive
  data as props.
- Co-locate a feature's UI under `features/<feature>/ui`; shared primitives in
  `components/`.
- Loading and error UI: use `loading.tsx` / `error.tsx` per route segment; skeletons for
  lists.
- Optimistic UI where it helps (cancel, retry), reconciled with the Server Action result.
- Accessibility: semantic HTML, labelled controls, focus management in dialogs, visible
  focus rings, `aria-live` for job-status updates.

## 7. Forms & errors

- One Zod schema per operation, imported by **both** the client form (RHF resolver) and
  the Server Action (server-side re-validation — the client check is UX only).
- Server Action returns a typed result: `{ ok: true, data }` or
  `{ ok: false, error, fieldErrors? }`. Components render `fieldErrors` inline.
- Error messages are user-facing English, actionable, and never leak internals
  (stack traces, SQL, ids of other departments).

## 8. Screens in scope (later phases — not Phase 0)

Jobs (list, detail with live state/progress, create wizard, cancel, retry), Templates
(list, create/edit, disable, delete), File Gallery (grid, upload, preview, delete),
Users (list, create, disable — MANAGER/ADMIN), Departments (ADMIN), sign-in, theme
toggle, notifications.

**Phase 0 builds none of these.** See [../development/workflow.md](../development/workflow.md).
