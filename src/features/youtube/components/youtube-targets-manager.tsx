"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Youtube } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectYoutubeTargetAction } from "@/features/youtube/actions/connect-youtube-target.action";
import { disconnectYoutubeTargetAction } from "@/features/youtube/actions/disconnect-youtube-target.action";
import { updateYoutubeTargetDepartmentsAction } from "@/features/youtube/actions/update-youtube-target-departments.action";
import type { SafeYouTubeTarget } from "@/features/youtube/domain/youtube-target";

export interface DepartmentChoice {
  id: string;
  name: string;
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
 * Connect/list/disconnect YouTube Targets — **ADMIN-only**
 * (docs/integrations/youtube.md, ADR-0040): connecting a channel and
 * choosing which Departments may use it is system-wide infrastructure
 * configuration, not a per-department operation. Non-admins never reach
 * this page (`/youtube` gates on `hasAtLeastRole(actor.role, "ADMIN")`) —
 * they only ever *select* an already-connected channel from a Template
 * form, filtered to their own Department.
 *
 * Connecting takes a refresh token obtained out-of-band, not a "Sign in with
 * Google" button — see `connect-youtube-target.ts`'s doc comment for why a
 * full OAuth consent screen is a deliberate future enhancement, not built
 * this phase.
 */
export function YoutubeTargetsManager({
  targets,
  departmentChoices,
}: {
  targets: SafeYouTubeTarget[];
  departmentChoices: DepartmentChoice[];
}) {
  const router = useRouter();
  const formId = useId();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [connectDepartmentIds, setConnectDepartmentIds] = useState<Set<string>>(
    new Set(),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDepartmentIds, setEditDepartmentIds] = useState<Set<string>>(
    new Set(),
  );

  function handleConnect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await connectYoutubeTargetAction({
        name,
        refreshToken,
        departmentIds: [...connectDepartmentIds],
      });
      if (!result.ok) {
        setFormError(result.error.message);
        return;
      }
      toast.success(`Connected "${result.data.name}".`);
      setName("");
      setRefreshToken("");
      setConnectDepartmentIds(new Set());
      router.refresh();
    });
  }

  function handleDisconnect(targetId: string, targetName: string) {
    if (!window.confirm(`Disconnect "${targetName}"?`)) return;
    startTransition(async () => {
      const result = await disconnectYoutubeTargetAction({ targetId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Disconnected "${targetName}".`);
      router.refresh();
    });
  }

  function startEdit(target: SafeYouTubeTarget) {
    setEditingId(target.id);
    setEditDepartmentIds(new Set(target.departmentIds));
  }

  function handleSaveDepartments(targetId: string) {
    startTransition(async () => {
      const result = await updateYoutubeTargetDepartmentsAction({
        targetId,
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
          <CardTitle className="text-base">Connect a channel</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleConnect} className="space-y-4">
            {formError ? (
              <p
                role="alert"
                className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
              >
                {formError}
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-name`}>Display name</Label>
                <Input
                  id={`${formId}-name`}
                  value={name}
                  disabled={isPending}
                  placeholder="e.g. Main Channel"
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${formId}-token`}>Refresh token</Label>
                <Input
                  id={`${formId}-token`}
                  type="password"
                  value={refreshToken}
                  disabled={isPending}
                  placeholder="Obtained out-of-band via Google OAuth"
                  onChange={(e) => setRefreshToken(e.target.value)}
                  required
                />
                <p className="text-muted-foreground text-xs">
                  Studio verifies this immediately against the YouTube API and
                  stores it encrypted. It is never displayed again.
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Departments</Label>
                <DepartmentCheckboxes
                  formIdPrefix={`${formId}-connect`}
                  departments={departmentChoices}
                  selected={connectDepartmentIds}
                  disabled={isPending}
                  onChange={setConnectDepartmentIds}
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={isPending || connectDepartmentIds.size === 0}
            >
              <Plus /> {isPending ? "Connecting…" : "Connect channel"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {targets.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No YouTube channels connected yet.
            </p>
          ) : (
            targets.map((target) => (
              <div
                key={target.id}
                className="flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Youtube className="text-muted-foreground size-4" />
                  <span className="font-medium">{target.name}</span>
                  <Badge
                    variant={
                      target.status === "CONNECTED" ? "secondary" : "outline"
                    }
                  >
                    {target.status}
                  </Badge>
                  {target.lastErrorReason ? (
                    <span className="text-destructive text-xs">
                      {target.lastErrorReason}
                    </span>
                  ) : null}
                  {target.status !== "DISCONNECTED" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleDisconnect(target.id, target.name)}
                    >
                      Disconnect
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      editingId === target.id
                        ? setEditingId(null)
                        : startEdit(target)
                    }
                  >
                    {editingId === target.id ? "Cancel" : "Edit departments"}
                  </Button>
                </div>

                {editingId === target.id ? (
                  <div className="bg-muted/40 space-y-2 rounded-md p-3">
                    <DepartmentCheckboxes
                      formIdPrefix={`${formId}-edit-${target.id}`}
                      departments={departmentChoices}
                      selected={editDepartmentIds}
                      disabled={isPending}
                      onChange={setEditDepartmentIds}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPending || editDepartmentIds.size === 0}
                      onClick={() => handleSaveDepartments(target.id)}
                    >
                      Save
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {target.departmentIds.map((id) => (
                      <Badge key={id} variant="outline">
                        {departmentChoices.find((d) => d.id === id)?.name ?? id}
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
