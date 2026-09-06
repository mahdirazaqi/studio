"use client";

import { useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";

/**
 * Search-only toolbar — mirrors `features/templates/components/
 * templates-toolbar.tsx` minus the status filter (Users have no equivalent
 * axis). Rewrites the URL's search params; the page itself re-queries
 * department-scoped data server-side. No client-side data fetching here.
 */
export function UsersToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateSearchDebounced(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("q", value);
      else params.delete("q");
      params.delete("page");
      startTransition(() => {
        router.push(params.size ? `${pathname}?${params}` : pathname);
      });
    }, 350);
  }

  return (
    <Input
      type="search"
      placeholder="Search users by name or email…"
      defaultValue={searchParams.get("q") ?? ""}
      className="sm:max-w-xs"
      disabled={isPending}
      onChange={(event) => updateSearchDebounced(event.target.value)}
    />
  );
}
