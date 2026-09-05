import Link from "next/link";
import { Layers, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SafeTemplate } from "@/features/templates/domain/template";
import { TemplateStatusActions } from "@/features/templates/components/template-status-actions";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

/** Server Component row — the only interactive pieces are client leaves. */
export function TemplateListItem({
  template,
  canManage,
  departmentName,
}: {
  template: SafeTemplate;
  canManage: boolean;
  /** Shown only for ADMIN, who sees Templates across every department. */
  departmentName?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/templates/${template.id}`}
              className="truncate font-medium hover:underline"
            >
              {template.name}
            </Link>
            <Badge
              variant={template.status === "ACTIVE" ? "default" : "secondary"}
            >
              {template.status === "ACTIVE" ? "Active" : "Disabled"}
            </Badge>
            {departmentName ? (
              <Badge variant="outline">{departmentName}</Badge>
            ) : null}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3" />
              {template.assetCount} asset{template.assetCount === 1 ? "" : "s"}
            </span>
            {template.createdByName ? (
              <span>Created by {template.createdByName}</span>
            ) : null}
            <span>{formatDate(template.createdAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/templates/${template.id}`}>
              <Pencil /> {canManage ? "Edit" : "View"}
            </Link>
          </Button>
          {canManage ? (
            <TemplateStatusActions
              templateId={template.id}
              templateName={template.name}
              status={template.status}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
