"use client";

import { useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TemplateStatus } from "@/features/templates/domain/template";

const STATUS_OPTIONS: { label: string; value: TemplateStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Disabled", value: "DISABLED" },
];

/**
 * Search + status filter. Mirrors `features/files/components/files-toolbar.tsx`
 * exactly: both just rewrite the URL's search params — the page itself is a
 * Server Component that reads them and re-queries department-scoped data
 * server-side. No client-side data fetching here.
 */
export function TemplatesToolbar({
  activeStatus,
}: {
  activeStatus?: TemplateStatus;
}) {
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
        placeholder="Search templates by name…"
        defaultValue={searchParams.get("q") ?? ""}
        className="sm:max-w-xs"
        disabled={isPending}
        onChange={(event) => updateSearchDebounced(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => {
          const isActive =
            option.value === "ALL"
              ? !activeStatus
              : activeStatus === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={isActive ? "secondary" : "outline"}
              disabled={isPending}
              onClick={() =>
                updateParams({
                  status: option.value === "ALL" ? null : option.value,
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
