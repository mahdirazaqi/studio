"use client";

import { useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FileKind } from "@/features/files/domain/file-types";

const KIND_OPTIONS: { label: string; value: FileKind | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Images", value: "IMAGE" },
  { label: "Audio", value: "AUDIO" },
  { label: "Video", value: "VIDEO" },
];

/**
 * Search + kind filter. Both just rewrite the URL's search params — the page
 * itself is a Server Component that reads them and re-queries
 * department-scoped data server-side. No client-side data fetching here.
 */
export function FilesToolbar({ activeKind }: { activeKind?: FileKind }) {
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
    params.delete("page"); // any filter change starts back at page 1
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
        placeholder="Search files by name…"
        defaultValue={searchParams.get("q") ?? ""}
        className="sm:max-w-xs"
        disabled={isPending}
        onChange={(event) => updateSearchDebounced(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {KIND_OPTIONS.map((option) => {
          const isActive =
            option.value === "ALL" ? !activeKind : activeKind === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={isActive ? "secondary" : "outline"}
              disabled={isPending}
              onClick={() =>
                updateParams({
                  kind: option.value === "ALL" ? null : option.value,
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
