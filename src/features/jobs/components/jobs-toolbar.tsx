"use client";

import { useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JOB_STATES, type JobState } from "@/features/jobs/domain/job";

const STATE_OPTIONS: { label: string; value: JobState | "ALL" }[] = [
  { label: "All", value: "ALL" },
  ...JOB_STATES.map((state) => ({
    label: state.charAt(0) + state.slice(1).toLowerCase(),
    value: state,
  })),
];

/** Search + state filter. Mirrors `features/templates/components/templates-toolbar.tsx`. */
export function JobsToolbar({ activeState }: { activeState?: JobState }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    startTransition(() => {
      router.push(params.size ? `${pathname}?${params}` : pathname);
    });
  }

  function updateSearchDebounced(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParams({ q: value }), 350);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Input
        type="search"
        placeholder="Search jobs by title…"
        defaultValue={searchParams.get("q") ?? ""}
        className="sm:max-w-xs"
        disabled={isPending}
        onChange={(event) => updateSearchDebounced(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {STATE_OPTIONS.map((option) => {
          const isActive =
            option.value === "ALL"
              ? !activeState
              : activeState === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={isActive ? "secondary" : "outline"}
              disabled={isPending}
              onClick={() =>
                updateParams({
                  state: option.value === "ALL" ? null : option.value,
                })
              }
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
