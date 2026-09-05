import { ShieldAlert } from "lucide-react";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Rendered by a protected page when the signed-in user is authenticated but
 * not authorized to view it (e.g. a USER navigating directly to `/users`).
 *
 * This is a rendering choice, not the authorization boundary itself — the
 * page still performs the real check server-side before choosing to render
 * this instead of its real content (docs/architecture/authorization.md
 * "Server Component authorization"). Never render this speculatively "just
 * in case"; only after an explicit `authorize()`/role check has failed.
 */
export function ForbiddenPage() {
  return (
    <PageShell>
      <PageHeader title="Forbidden" />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
            <ShieldAlert className="size-6" />
          </div>
          <p className="text-sm font-medium">
            You do not have permission to access this page.
          </p>
          <p className="text-muted-foreground max-w-sm text-sm">
            If you believe this is a mistake, contact your department manager or
            an administrator.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
