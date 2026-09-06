import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ForbiddenPage } from "@/components/layout/forbidden-page";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { hasAtLeastRole } from "@/lib/roles";
import { YoutubeTargetsManager } from "@/features/youtube/components/youtube-targets-manager";
import { listYoutubeTargets } from "@/features/youtube/use-cases/list-youtube-targets";
import { listDepartmentsForAdmin } from "@/features/departments/read/list-departments-for-admin";

export const metadata: Metadata = { title: "YouTube" };

export default async function YoutubePage() {
  const user = await requireUser();
  const actor = toActor(user);

  // `youtube:manage` is MANAGER+ (docs/integrations/youtube.md) — direct URL
  // navigation is checked independently of the nav item's own `minRole`
  // filter (docs/architecture/authorization.md "Server Component
  // authorization").
  if (!hasAtLeastRole(actor.role, "MANAGER")) {
    return <ForbiddenPage />;
  }

  const isAdmin = actor.role === "ADMIN";
  const [targets, departmentChoices] = await Promise.all([
    listYoutubeTargets(actor),
    isAdmin ? listDepartmentsForAdmin(actor) : undefined,
  ]);

  return (
    <PageShell>
      <PageHeader
        title="YouTube"
        description="Connect the channels Templates may deliver rendered Jobs to."
      />
      <YoutubeTargetsManager
        targets={targets}
        departmentChoices={departmentChoices}
      />
    </PageShell>
  );
}
