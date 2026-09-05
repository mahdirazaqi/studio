import Link from "next/link";

/**
 * A page-N link that preserves every other current search param. Shared by
 * any Server Component list page with `?page=` pagination (Files, Templates)
 * — factored out once a second feature needed the exact same query-string
 * bookkeeping `features/files/*` originally inlined.
 */
export function PageLink({
  href,
  page,
  disabled,
  searchParams,
  children,
}: {
  /** The page's own pathname, e.g. `/files` or `/templates`. */
  href: string;
  page: number;
  disabled: boolean;
  searchParams: Record<string, string | string[] | undefined>;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="text-muted-foreground/50 inline-flex items-center gap-1 px-3 py-2 text-sm">
        {children}
      </span>
    );
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page") continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v) params.set(key, v);
  }
  params.set("page", String(page));
  return (
    <Link
      href={`${href}?${params}`}
      className="hover:bg-muted inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm"
    >
      {children}
    </Link>
  );
}

/** Extract the first value from a Next.js `searchParams` entry. */
export function firstSearchParamValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
