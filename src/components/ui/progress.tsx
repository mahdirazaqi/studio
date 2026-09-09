"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Standard Radix-backed progress bar — same convention as every other
 * primitive under `components/ui` (`Root` + a `data-slot`, `cn`-merged
 * `className`). Radix's `Root` sets `role="progressbar"` and
 * `aria-valuenow`/`aria-valuemin`/`aria-valuemax` itself from `value`/`max`,
 * so no extra accessibility wiring is needed at call sites.
 *
 * `indicatorClassName` is the one addition over shadcn's default — lets a
 * caller recolor the filled portion (e.g. `features/jobs/components/
 * job-render-progress.tsx` uses the same `--warning` token
 * `JobStatusBadge` already uses for the `RENDERING` state) without a second
 * progress-bar implementation.
 */
function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string;
}) {
  const clamped =
    value === null || value === undefined
      ? 0
      : Math.min(100, Math.max(0, value));

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={clamped}
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "bg-primary h-full w-full flex-1 transition-transform duration-500 ease-out motion-reduce:transition-none",
          indicatorClassName,
        )}
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
