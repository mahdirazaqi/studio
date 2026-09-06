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
import type { SafeYouTubeTarget } from "@/features/youtube/domain/youtube-target";

export interface DepartmentChoice {
  id: string;
  name: string;
}

/**
 * Connect/list/disconnect YouTube Targets (docs/integrations/youtube.md).
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
  /** ADMIN only — USER/MANAGER always connect to their own department. */
  departmentChoices?: DepartmentChoice[];
}) {
  const router = useRouter();
  const formId = useId();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [departmentId, setDepartmentId] = useState(
    departmentChoices?.[0]?.id ?? "",
  );
  const [formError, setFormError] = useState<string | null>(null);

  function handleConnect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await connectYoutubeTargetAction({
        ...(departmentChoices ? { departmentId } : {}),
        name,
        refreshToken,
      });
      if (!result.ok) {
        setFormError(result.error.message);
        return;
      }
      toast.success(`Connected "${result.data.name}".`);
      setName("");
      setRefreshToken("");
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
              {departmentChoices ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-department`}>Department</Label>
                  <select
                    id={`${formId}-department`}
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
              ) : null}
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
            </div>
            <Button type="submit" disabled={isPending}>
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
                className="flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-2 text-sm">
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
                </div>
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
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
