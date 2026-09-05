"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Dashboard-scoped error boundary. Keeps the sidebar/header shell intact and
 * offers a recovery action. Never renders error internals — Next.js already
 * strips messages from production `error` objects, and we don't echo them.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side visibility only; server logging happens where the error is thrown.
    console.error("Dashboard route error", error.digest ?? error.message);
  }, [error]);

  return (
    <PageShell>
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            This section failed to load. You can retry, or navigate elsewhere
            using the sidebar.
          </p>
          {error.digest ? (
            <p className="text-muted-foreground font-mono text-xs">
              Reference: {error.digest}
            </p>
          ) : null}
          <Button onClick={reset} variant="outline">
            <RotateCw className="size-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
