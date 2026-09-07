import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ForbiddenPage } from "@/components/layout/forbidden-page";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { YoutubeTargetsManager } from "@/features/youtube/components/youtube-targets-manager";
import { listYoutubeTargets } from "@/features/youtube/use-cases/list-youtube-targets";
import { listDepartmentsForAdmin } from "@/features/departments/read/list-departments-for-admin";

export const metadata: Metadata = { title: "YouTube" };

export default async function YoutubePage() {
  const user = await requireUser();
  const actor = toActor(user);

  // `youtube:manage` is ADMIN-only (docs/integrations/youtube.md, ADR-0040)
  // — connecting a channel and choosing its Department scope is system-wide
  // infrastructure configuration. Direct URL navigation is checked
  // independently of the nav item's own `minRole` filter
  // (docs/architecture/authorization.md "Server Component authorization").
  if (actor.role !== "ADMIN") {
    return <ForbiddenPage />;
  }

  const [targets, departmentChoices] = await Promise.all([
    listYoutubeTargets(actor),
    listDepartmentsForAdmin(actor),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="YouTube"
        description="Connect the channels Templates may deliver rendered Jobs to, and choose which Departments may use each one."
      />
      <YoutubeTargetsManager
        targets={targets}
        departmentChoices={departmentChoices}
      />
    </PageShell>
  );
}
