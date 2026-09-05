"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * App theme provider. Wraps `next-themes`.
 *
 * - Supports Light / Dark / System.
 * - `defaultTheme="system"` + `enableSystem` — the OS preference wins until the
 *   user makes an explicit choice (docs/frontend/conventions.md).
 * - `attribute="class"` toggles `.dark` on <html>, matching the Tailwind v4
 *   `@custom-variant dark` in globals.css.
 * - `disableTransitionOnChange` avoids color transitions flashing on switch.
 * - Flash-of-wrong-theme is prevented by next-themes' inline script + the
 *   `suppressHydrationWarning` on <html> in the root layout.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
