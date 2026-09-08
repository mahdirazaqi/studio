"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { transferTemplateDepartmentAction } from "@/features/templates/actions/transfer-template-department.action";
import type { DepartmentChoice } from "@/features/templates/components/template-form";

/**
 * ADMIN-only "Transfer Department" control — genuinely separate from
 * `TemplateForm`'s edit flow (docs/domain/templates.md "Department
 * transfer"). Template Edit can never change a Template's department, in
 * this UI or on the server; this is the one dedicated surface that can,
 * calling `transferTemplateDepartmentAction` rather than the ordinary update
 * action.
 */
export function TransferTemplateDepartmentForm({
  templateId,
  currentDepartmentId,
  departmentChoices,
}: {
  templateId: string;
  currentDepartmentId: string;
  departmentChoices: DepartmentChoice[];
}) {
  const router = useRouter();
  const formId = useId();
  const [isPending, startTransition] = useTransition();
  const [departmentId, setDepartmentId] = useState(currentDepartmentId);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await transferTemplateDepartmentAction({
        templateId,
        departmentId,
      });

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      const targetName =
        departmentChoices.find((d) => d.id === result.data.departmentId)
          ?.name ?? result.data.departmentId;
      toast.success(`Template transferred to "${targetName}".`);
      router.refresh();
    });
  }

  const unchanged = departmentId === currentDepartmentId;

  return (
    <Card>
      <CardContent className="space-y-3 py-6">
        <div>
          <h2 className="text-sm font-medium">Transfer department</h2>
          <p className="text-muted-foreground text-xs">
            Move this template to a different department. Its asset selections
            must remain valid for the new department, or the transfer will be
            rejected.
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={`${formId}-transfer-department`}>
              Target department
            </Label>
            <select
              id={`${formId}-transfer-department`}
              value={departmentId}
              disabled={isPending}
              className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              {departmentChoices.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={isPending || unchanged}
          >
            <ArrowRightLeft />
            {isPending ? "Transferring…" : "Transfer"}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
