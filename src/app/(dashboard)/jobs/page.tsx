import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ListVideo, Plus } from "lucide-react";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import {
  firstSearchParamValue,
  PageLink,
} from "@/components/layout/pagination-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { safeParseInput } from "@/server/validation";
import { listJobsSchema } from "@/features/jobs/schemas/list-jobs.schema";
import { listDepartmentJobs } from "@/features/jobs/use-cases/list-jobs";
import { JobListItem } from "@/features/jobs/components/job-list-item";
import { JobsToolbar } from "@/features/jobs/components/jobs-toolbar";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const actor = toActor(user);

  const rawParams = await searchParams;
  const parsed = safeParseInput(listJobsSchema, {
    q: firstSearchParamValue(rawParams.q),
    state: firstSearchParamValue(rawParams.state),
    page: firstSearchParamValue(rawParams.page),
    pageSize: firstSearchParamValue(rawParams.pageSize),
  });
  const filters = parsed.ok ? parsed.data : listJobsSchema.parse({});

  const { items, page, pageSize, total } = await listDepartmentJobs(
    actor,
    filters,
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <PageShell>
      <PageHeader
        title="Jobs"
        description="Render jobs, their state, progress, cancellation, and retry."
        actions={
          <Button asChild>
            <Link href="/jobs/new">
              <Plus /> New job
            </Link>
          </Button>
        }
      />

      <div className="space-y-6">
        <JobsToolbar activeState={filters.state} />

        {items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                <ListVideo className="size-6" />
              </div>
              <p className="text-sm font-medium">No jobs yet</p>
              <p className="text-muted-foreground max-w-sm text-sm">
                {filters.q || filters.state
                  ? "No jobs match your search/filter."
                  : "Create a job from a template to get started."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((job) => (
              <JobListItem key={job.id} job={job} />
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-center gap-2">
            <PageLink
              href="/jobs"
              page={page - 1}
              disabled={page <= 1}
              searchParams={rawParams}
            >
              <ChevronLeft /> Previous
            </PageLink>
            <span className="text-muted-foreground text-sm">
              Page {page} of {totalPages}
            </span>
            <PageLink
              href="/jobs"
              page={page + 1}
              disabled={page >= totalPages}
              searchParams={rawParams}
            >
              Next <ChevronRight />
            </PageLink>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
