"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Power, PowerOff, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  disableTemplateAction,
  enableTemplateAction,
} from "@/features/templates/actions/set-template-status.action";
import { softDeleteTemplateAction } from "@/features/templates/actions/soft-delete-template.action";
import type { TemplateStatus } from "@/features/templates/domain/template";

/**
 * Enable/disable + soft-delete controls for one Template row — only rendered
 * when the page has already decided the actor may manage Templates
 * (MANAGER+, docs/domain/authorization.md). A native `confirm()` for delete
 * is the same deliberate simplification `DeleteFileButton` uses (see
 * docs/architecture/files.md "Deletion UI") — no AlertDialog component exists
 * in this codebase yet.
 */
export function TemplateStatusActions({
  templateId,
  templateName,
  status,
}: {
  templateId: string;
  templateName: string;
  status: TemplateStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggleStatus() {
    startTransition(async () => {
      const action =
        status === "ACTIVE" ? disableTemplateAction : enableTemplateAction;
      const result = await action({ templateId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        status === "ACTIVE"
          ? `"${templateName}" disabled.`
          : `"${templateName}" enabled.`,
      );
      router.refresh();
    });
  }

  function handleDelete() {
    if (
      !window.confirm(
        `Delete "${templateName}"? It will be hidden from lists everywhere but its record is kept permanently.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await softDeleteTemplateAction({ templateId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`"${templateName}" deleted.`);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={status === "ACTIVE" ? "Disable" : "Enable"}
        title={status === "ACTIVE" ? "Disable" : "Enable"}
        disabled={isPending}
        onClick={handleToggleStatus}
      >
        {status === "ACTIVE" ? <PowerOff /> : <Power />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete ${templateName}`}
        disabled={isPending}
        onClick={handleDelete}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
