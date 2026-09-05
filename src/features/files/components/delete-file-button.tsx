"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteFileAction } from "@/features/files/actions/delete-file.action";

export function DeleteFileButton({
  fileId,
  fileName,
}: {
  fileId: string;
  fileName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    // A native confirm is a deliberate simplification for this phase — see
    // docs/architecture/files.md "Deletion UI".
    if (!window.confirm(`Delete "${fileName}"? This cannot be undone.`)) {
      return;
    }
    startTransition(async () => {
      const result = await deleteFileAction({ fileId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`"${fileName}" deleted.`);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Delete ${fileName}`}
      disabled={isPending}
      onClick={handleDelete}
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 />
    </Button>
  );
}
