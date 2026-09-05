# Frontend Conventions

> **Phase 1 status.** The shell (root layout, `(auth)` + `(dashboard)` route groups,
> sidebar, header, breadcrumb, mobile nav), the theme system, error/loading/not-found
> boundaries, and shadcn/ui are implemented. Feature screens are placeholders. Details:
> [theme.md](theme.md), [../architecture/server-client-boundary.md](../architecture/server-client-boundary.md),
> [../architecture/error-handling.md](../architecture/error-handling.md).

## 1. Nature of the app

- **Panel application only.** There is **no landing page**, no marketing site, no public
  content. Every route lives behind authentication (except the sign-in screen and
  health checks).
- Route groups: `(auth)` for sign-in; `(dashboard)` for the authenticated panel.

## 2. Stack

| Concern        | Choice                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------- |
| Framework      | Next.js App Router                                                                        |
| Language       | TypeScript (strict)                                                                       |
| UI             | React — Server Components by default, Client Components only where interactivity requires |
| Styling        | Tailwind CSS                                                                              |
| Components     | shadcn/ui (components copied into `src/components/ui`, owned by us)                       |
| Icons          | lucide-react (ships with shadcn/ui)                                                       |
| Forms          | React Hook Form + Zod resolver (intended; added with the first real form)                 |
| Data mutations | **Server Actions** via `defineAction` (never client `fetch` to an internal API)           |
| Data reads     | Server Components calling `read/` functions; `revalidate` / streaming for freshness       |

## 3. Direction & language

- **LTR only.** No RTL support required. Layouts assume left-to-right.
- **English only.** All UI copy, labels, empty states, and **error messages** are in
  English. No i18n framework in scope.
- Dates/times: display in the user's locale/timezone where practical; store UTC.

## 4. Theming

Implemented with **next-themes** (`attribute="class"`, `defaultTheme="system"`). Light /
Dark / System all supported; System is the default and follows the OS until the user
chooses explicitly. All colors are design tokens defined on `:root` and `.dark` in
`src/app/globals.css` and mapped via Tailwind v4 `@theme inline` — **no hard-coded colors
in components**. Every screen is verified in both light and dark. Full detail:
[theme.md](theme.md).

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

- One Zod schema per operation (`features/<f>/schemas/`), imported by **both** the client
  form (RHF resolver) and the Server Action (server-side re-validation via `parseInput` —
  the client check is UX only).
- A Server Action returns `ActionResult<T>`: `{ ok: true, data }` or
  `{ ok: false, error }` where `error` is a `PublicError` carrying `fieldErrors?`.
  Components branch on `result.ok` and render `result.error.fieldErrors` inline.
- Error messages are user-facing English, actionable, and never leak internals
  (stack traces, SQL, ids of other departments).

## 8. App shell (implemented in Phase 1)

- **`src/app/layout.tsx`** — `<html lang="en" dir="ltr" suppressHydrationWarning>`, Geist
  fonts as `--font-sans` / `--font-mono`, `ThemeProvider`, `Toaster`.
- **`(dashboard)/layout.tsx`** — `SidebarProvider` (persists open state in a cookie) +
  `AppSidebar` + `SidebarInset` (`AppHeader` + `<main>`).
- **`components/layout/app-sidebar.tsx`** — collapsible icon sidebar, groups from
  `@/lib/navigation`, active-route highlighting, "Soon" badges on placeholder routes.
- **`components/layout/app-header.tsx`** — sidebar trigger, pathname breadcrumb, theme
  toggle. Sticky, backdrop-blur.
- **Mobile:** the shadcn sidebar switches to an off-canvas sheet below `md`; the trigger
  is always visible in the header.
- **`components/layout/page-shell.tsx`** — `PageShell` (max-width + padding) + `PageHeader`
  (title/description/actions) used by every page.
- **`components/layout/placeholder-page.tsx`** — the honest "not implemented yet" screen
  for feature routes.

## 9. Screens in scope (later phases)

Jobs (list, detail with live state/progress, create wizard, cancel, retry), Templates
(list, create/edit, disable, delete), File Gallery (grid, upload, preview, delete),
Users (list, create, disable — MANAGER/ADMIN), Departments (ADMIN), real sign-in,
notifications.

**Phase 1 builds none of these** — only the placeholder routes. See
[../development/workflow.md](../development/workflow.md).
