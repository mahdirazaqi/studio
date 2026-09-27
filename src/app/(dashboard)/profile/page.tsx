import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { ProfileForm } from "@/features/users/components/profile-form";
import { findUserInScope } from "@/features/users/repository/user-repository";

export const metadata: Metadata = { title: "Profile" };

/**
 * Self-service profile page — every authenticated User, `USER` role
 * included, can reach this and edit their own `fullName`/`phone`
 * (docs/domain/authorization.md "Edit own profile", Phase 20/ADR-0051).
 * There is no role/department/status/email editing here at all, for anyone,
 * including ADMIN — those are shown read-only; changing them (for another
 * user) is `/users/[userId]/edit`'s job, a completely different,
 * capability-gated page.
 *
 * `findUserInScope(actor, actor.userId)` — the same department-scoped
 * lookup every other feature uses — always resolves here (an actor's own
 * department, by construction, always matches their own row); `notFound()`
 * is purely defensive and should be unreachable in practice.
 */
export default async function ProfilePage() {
  const user = await requireUser();
  const actor = toActor(user);

  const profile = await findUserInScope(actor, actor.userId);
  if (!profile) notFound();

  return (
    <PageShell>
      <PageHeader
        title="Profile"
        description="Your account information. Contact an administrator to change your role or department."
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 py-6 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Email: </span>
              {profile.email}
            </div>
            <div>
              <span className="text-muted-foreground">Department: </span>
              {user.departmentName}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Role: </span>
              <Badge variant="outline">{profile.role}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status: </span>
              <Badge
                variant={profile.status === "ACTIVE" ? "default" : "secondary"}
              >
                {profile.status === "ACTIVE" ? "Active" : "Disabled"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <ProfileForm fullName={profile.fullName} phone={profile.phone} />
      </div>
    </PageShell>
  );
}
