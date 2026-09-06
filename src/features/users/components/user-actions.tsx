"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Power, PowerOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  disableUserAction,
  enableUserAction,
} from "@/features/users/actions/set-user-active-status.action";
import { changeUserRoleAction } from "@/features/users/actions/change-user-role.action";
import { ROLES, type Role } from "@/lib/roles";
import type { UserStatus } from "@/features/users/domain/user";

/**
 * Disable/enable + (ADMIN-only) role change for one User row — only rendered
 * for a row the page has already decided the actor may manage
 * (`docs/domain/authorization.md`). A native `confirm()` is not used here
 * (unlike destructive Template/File deletes) since disabling a user is
 * reversible. The use case (`assertCanSetActiveStatus`/`assertCanChangeRole`)
 * re-checks everything independently — this is a rendering choice only.
 */
export function UserActions({
  userId,
  userName,
  status,
  role,
  canChangeRole,
}: {
  userId: string;
  userName: string;
  status: UserStatus;
  role: Role;
  /** Only ADMIN may change roles (docs/domain/authorization.md — OPEN
   * DECISION for MANAGER, conservative default enforced server-side
   * regardless of this prop). */
  canChangeRole: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggleStatus() {
    startTransition(async () => {
      const action = status === "ACTIVE" ? disableUserAction : enableUserAction;
      const result = await action({ userId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        status === "ACTIVE" ? `${userName} disabled.` : `${userName} enabled.`,
      );
      router.refresh();
    });
  }

  function handleRoleChange(nextRole: Role) {
    if (nextRole === role) return;
    startTransition(async () => {
      const result = await changeUserRoleAction({ userId, role: nextRole });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`${userName} is now ${nextRole}.`);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {canChangeRole ? (
        <select
          aria-label={`Change ${userName}'s role`}
          value={role}
          disabled={isPending}
          className="border-input h-8 rounded-md border bg-transparent px-2 text-sm shadow-xs"
          onChange={(event) => handleRoleChange(event.target.value as Role)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      ) : null}
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
    </div>
  );
}
