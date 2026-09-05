import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Jobs" };

export default function JobsPage() {
  return (
    <PlaceholderPage
      title="Jobs"
      description="Render jobs, their state machine, progress, cancellation, and retry."
      phase="the Jobs phase"
    />
  );
}
