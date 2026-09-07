"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkerApiKeyAction } from "@/features/worker-keys/actions/create-worker-api-key.action";
import {
  reactivateWorkerApiKeyAction,
  revokeWorkerApiKeyAction,
} from "@/features/worker-keys/actions/set-worker-api-key-status.action";
import { updateWorkerApiKeyDepartmentsAction } from "@/features/worker-keys/actions/update-worker-api-key-departments.action";
import type { SafeWorkerApiKey } from "@/features/worker-keys/domain/worker-api-key";

export interface DepartmentChoice {
  id: string;
  name: string;
}

function formatDate(date: Date | null): string {
  if (!date) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function DepartmentCheckboxes({
  formIdPrefix,
  departments,
  selected,
  disabled,
  onChange,
}: {
  formIdPrefix: string;
  departments: DepartmentChoice[];
  selected: Set<string>;
  disabled: boolean;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {departments.map((department) => (
        <label
          key={department.id}
          htmlFor={`${formIdPrefix}-${department.id}`}
          className="flex items-center gap-1.5 text-sm"
        >
          <input
            id={`${formIdPrefix}-${department.id}`}
            type="checkbox"
            checked={selected.has(department.id)}
            disabled={disabled}
            className="size-4"
            onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(department.id);
              else next.delete(department.id);
              onChange(next);
            }}
          />
          {department.name}
        </label>
      ))}
    </div>
  );
}

/**
 * Worker API Key management (docs/integrations/worker-api.md "Worker API
 * Keys", ADR-0040). The raw secret is shown **exactly once**, right after
 * creation, in the banner below the form — it is never stored anywhere
 * retrievable and never appears again after this component unmounts/re-
 * renders past that point.
 */
export function WorkerApiKeysManager({
  keys,
  departments,
}: {
  keys: SafeWorkerApiKey[];
  departments: DepartmentChoice[];
}) {
  const router = useRouter();
  const formId = useId();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [createDepartmentIds, setCreateDepartmentIds] = useState<Set<string>>(
    new Set(),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [justCreatedSecret, setJustCreatedSecret] = useState<{
    name: string;
    secret: string;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDepartmentIds, setEditDepartmentIds] = useState<Set<string>>(
    new Set(),
  );

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setJustCreatedSecret(null);
    startTransition(async () => {
      const result = await createWorkerApiKeyAction({
        name,
        departmentIds: [...createDepartmentIds],
      });
      if (!result.ok) {
        setFormError(result.error.message);
        return;
      }
      setJustCreatedSecret({
        name: result.data.key.name,
        secret: result.data.secret,
      });
      setName("");
      setCreateDepartmentIds(new Set());
      router.refresh();
    });
  }

  function handleToggleStatus(key: SafeWorkerApiKey) {
    startTransition(async () => {
      const action =
        key.status === "ACTIVE"
          ? revokeWorkerApiKeyAction
          : reactivateWorkerApiKeyAction;
      const result = await action({ keyId: key.id });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        key.status === "ACTIVE"
          ? `"${key.name}" revoked.`
          : `"${key.name}" reactivated.`,
      );
      router.refresh();
    });
  }

  function startEdit(key: SafeWorkerApiKey) {
    setEditingId(key.id);
    setEditDepartmentIds(new Set(key.departmentIds));
  }

  function handleSaveDepartments(keyId: string) {
    startTransition(async () => {
      const result = await updateWorkerApiKeyDepartmentsAction({
        keyId,
        departmentIds: [...editDepartmentIds],
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Department scope updated.");
      setEditingId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a Worker API Key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {justCreatedSecret ? (
            <div className="border-primary/30 bg-primary/5 space-y-2 rounded-md border px-3 py-3">
              <p className="text-sm font-medium">
                &quot;{justCreatedSecret.name}&quot; created. Copy this secret
                now — it will never be shown again.
              </p>
              <Input
                readOnly
                value={justCreatedSecret.secret}
                onFocus={(e) => e.target.select()}
                className="font-mono text-xs"
              />
            </div>
          ) : null}

          <form onSubmit={handleCreate} className="space-y-4">
            {formError ? (
              <p
                role="alert"
                className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
              >
                {formError}
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-name`}>Name</Label>
              <Input
                id={`${formId}-name`}
                value={name}
                disabled={isPending}
                placeholder="e.g. Production Render Worker"
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Departments</Label>
              <DepartmentCheckboxes
                formIdPrefix={`${formId}-create`}
                departments={departments}
                selected={createDepartmentIds}
                disabled={isPending}
                onChange={setCreateDepartmentIds}
              />
            </div>
            <Button
              type="submit"
              disabled={isPending || createDepartmentIds.size === 0}
            >
              <Plus /> Create key
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Worker API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {keys.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No Worker API Keys yet.
            </p>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className="flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <KeyRound className="text-muted-foreground size-4" />
                  <span className="font-medium">{key.name}</span>
                  <Badge
                    variant={key.status === "ACTIVE" ? "default" : "secondary"}
                  >
                    {key.status}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    Last used: {formatDate(key.lastUsedAt)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleToggleStatus(key)}
                  >
                    {key.status === "ACTIVE" ? "Revoke" : "Reactivate"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      editingId === key.id ? setEditingId(null) : startEdit(key)
                    }
                  >
                    {editingId === key.id ? "Cancel" : "Edit departments"}
                  </Button>
                </div>

                {editingId === key.id ? (
                  <div className="bg-muted/40 space-y-2 rounded-md p-3">
                    <DepartmentCheckboxes
                      formIdPrefix={`${formId}-edit-${key.id}`}
                      departments={departments}
                      selected={editDepartmentIds}
                      disabled={isPending}
                      onChange={setEditDepartmentIds}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPending || editDepartmentIds.size === 0}
                      onClick={() => handleSaveDepartments(key.id)}
                    >
                      Save
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {key.departmentIds.map((id) => (
                      <Badge key={id} variant="outline">
                        {departments.find((d) => d.id === id)?.name ?? id}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
