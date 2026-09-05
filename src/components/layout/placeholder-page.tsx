import { Construction } from "lucide-react";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Placeholder used by dashboard routes whose feature is implemented in a later
 * phase. It exists to validate routing, layout, and responsiveness — not to
 * fake functionality.
 */
export function PlaceholderPage({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <PageShell>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
            <Construction className="size-6" />
          </div>
          <p className="text-sm font-medium">Not implemented yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            This screen is part of {phase}. The application foundation (layout,
            theming, routing, error handling) is in place; the feature itself is
            not built yet.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
