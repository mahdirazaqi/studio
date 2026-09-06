"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDepartmentAction } from "@/features/departments/actions/create-department.action";
import { renameDepartmentAction } from "@/features/departments/actions/rename-department.action";
import type { SafeDepartment } from "@/features/departments/domain/department";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

/**
 * Departments management (docs/domain/departments.md). ADMIN sees a create
 * form and every Department, each renamable inline; a USER/MANAGER sees only
 * their own Department, read-only. **No delete/archive action exists** —
 * Department deletion remains OD-07, an explicitly open decision
 * (docs/domain/departments.md "Department deletion") — do not add one here
 * without that being resolved first.
 */
export function DepartmentsManager({
  departments,
  isAdmin,
}: {
  departments: SafeDepartment[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await createDepartmentAction({ name });
      if (!result.ok) {
        setFormError(result.error.message);
        return;
      }
      toast.success(`"${result.data.name}" created.`);
      setName("");
      router.refresh();
    });
  }

  function startRename(department: SafeDepartment) {
    setRenamingId(department.id);
    setRenameValue(department.name);
  }

  function handleRename(departmentId: string) {
    startTransition(async () => {
      const result = await renameDepartmentAction({
        departmentId,
        name: renameValue,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Renamed to "${result.data.name}".`);
      setRenamingId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create a department</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleCreate}
              className="flex flex-col gap-3 sm:flex-row"
            >
              {formError ? (
                <p
                  role="alert"
                  className="border-destructive/30 bg-destructive/10 text-destructive w-full rounded-md border px-3 py-2 text-sm"
                >
                  {formError}
                </p>
              ) : null}
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={`${formId}-name`} className="sr-only">
                  Department name
                </Label>
                <Input
                  id={`${formId}-name`}
                  value={name}
                  disabled={isPending}
                  placeholder="e.g. Marketing"
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={isPending}>
                <Plus /> Create
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAdmin ? "All departments" : "Your department"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {departments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No departments yet.</p>
          ) : (
            departments.map((department) => (
              <div
                key={department.id}
                className="flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                {renamingId === department.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={renameValue}
                      disabled={isPending}
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleRename(department.id)}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => setRenamingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="text-muted-foreground size-4" />
                      <span className="font-medium">{department.name}</span>
                      <span className="text-muted-foreground text-xs">
                        Created {formatDate(department.createdAt)}
                      </span>
                    </div>
                    {isAdmin ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Rename ${department.name}`}
                        disabled={isPending}
                        onClick={() => startRename(department)}
                      >
                        <Pencil />
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
