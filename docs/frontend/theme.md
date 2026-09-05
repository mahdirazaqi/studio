# Theme System

## Implementation

- **`next-themes`**, wrapped by `src/components/theme/theme-provider.tsx`
  (a Client Component, mounted once in the root layout inside `<body>`).
- Config: `attribute="class"`, `defaultTheme="system"`, `enableSystem`,
  `disableTransitionOnChange`.
- The toggle: `src/components/theme/theme-toggle.tsx` — a dropdown with **Light / Dark /
  System**, in the app header.

## How the three modes resolve

| Choice               | Effect                                                                               |
| -------------------- | ------------------------------------------------------------------------------------ |
| **System** (default) | Follows the OS `prefers-color-scheme`. No explicit choice stored.                    |
| **Light** / **Dark** | Explicit; `next-themes` stores it in `localStorage` and toggles `.dark` on `<html>`. |

The user's explicit choice wins until they switch back to System.

## Tokens

`src/app/globals.css` defines every color as a CSS variable on **both** `:root` (light)
and `.dark`, mapped into Tailwind v4 via `@theme inline`. Semantic tokens:
`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`,
`destructive`, `border`, `input`, `ring`, `success`, `warning`, `info`, and the
`sidebar-*` set.

**Components never hard-code colors** — always the token utilities (`bg-background`,
`text-muted-foreground`, `border-border`, …). This is what makes light/dark automatic.

## Flash-of-wrong-theme

Prevented by:

- `next-themes` injects a tiny blocking script that sets the class before first paint.
- `<html suppressHydrationWarning>` in the root layout (the class differs between server
  and client on first render by design).
- `<meta name="theme-color">` is set per `prefers-color-scheme` in the root layout
  `viewport` export.

## Correctness checklist (verified in Phase 1)

- [x] Works on desktop and mobile.
- [x] Survives navigation (provider is above the router).
- [x] Survives reload (explicit choice persisted; System re-resolved).
- [x] No color transition flash on switch (`disableTransitionOnChange`).
- [x] Every screen legible in both light and dark (token-driven).
