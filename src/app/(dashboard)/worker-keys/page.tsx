import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ForbiddenPage } from "@/components/layout/forbidden-page";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { WorkerApiKeysManager } from "@/features/worker-keys/components/worker-api-keys-manager";
import { listWorkerApiKeys } from "@/features/worker-keys/use-cases/list-worker-api-keys";
import { listDepartmentsForAdmin } from "@/features/departments/read/list-departments-for-admin";

export const metadata: Metadata = { title: "Worker API Keys" };

export default async function WorkerApiKeysPage() {
  const user = await requireUser();
  const actor = toActor(user);

  // `worker_key:manage` is ADMIN-only (docs/integrations/worker-api.md,
  // ADR-0040) — direct URL navigation is checked independently of the nav
  // item's own `minRole` filter, same as every other management page.
  if (actor.role !== "ADMIN") {
    return <ForbiddenPage />;
  }

  const [keys, departments] = await Promise.all([
    listWorkerApiKeys(actor),
    listDepartmentsForAdmin(actor),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Worker API Keys"
        description="Machine credentials the Render Worker uses to claim and update Jobs, each scoped to one or more Departments."
      />
      <WorkerApiKeysManager keys={keys} departments={departments} />
    </PageShell>
  );
}
