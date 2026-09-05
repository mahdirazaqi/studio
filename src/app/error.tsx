"use client";

/**
 * Root error boundary — catches errors from route segments that don't have a
 * closer boundary (e.g. the (auth) group). The (dashboard) group has its own
 * error.tsx that preserves the app shell.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        Please try again. If the problem persists, contact an administrator.
      </p>
      {error.digest ? (
        <p className="text-muted-foreground font-mono text-xs">
          Reference: {error.digest}
        </p>
      ) : null}
      <button
        onClick={reset}
        className="border-input hover:bg-accent rounded-md border px-4 py-2 text-sm"
      >
        Try again
      </button>
    </div>
  );
}
