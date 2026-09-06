import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UserActions } from "@/features/users/components/user-actions";
import type { SafeUser } from "@/features/users/domain/user";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

/** Server Component row — the only interactive piece is the client leaf
 * (`UserActions`), matching `TemplateListItem`'s own pattern. */
export function UserListItem({
  user,
  isSelf,
  canManage,
  isAdmin,
  departmentName,
}: {
  user: SafeUser;
  /** The signed-in actor's own row — actions are hidden entirely (the
   * self-lockout rule makes them no-ops anyway; hiding avoids a confusing
   * disabled-looking control). */
  isSelf: boolean;
  /** Whether the viewer may manage users at all (`user:manage`, MANAGER+). */
  canManage: boolean;
  isAdmin: boolean;
  /** Shown only for ADMIN, who sees Users across every department. */
  departmentName?: string;
}) {
  const canActOnThisRow =
    canManage && !isSelf && (isAdmin || user.role === "USER");

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{user.fullName}</span>
            <Badge variant="outline">{user.role}</Badge>
            <Badge variant={user.status === "ACTIVE" ? "default" : "secondary"}>
              {user.status === "ACTIVE" ? "Active" : "Disabled"}
            </Badge>
            {departmentName ? (
              <Badge variant="outline">{departmentName}</Badge>
            ) : null}
            {isSelf ? <Badge variant="secondary">You</Badge> : null}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="truncate">{user.email}</span>
            <span>Joined {formatDate(user.createdAt)}</span>
          </div>
        </div>

        {canActOnThisRow ? (
          <div className="shrink-0">
            <UserActions
              userId={user.id}
              userName={user.fullName}
              status={user.status}
              role={user.role}
              canChangeRole={isAdmin}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
