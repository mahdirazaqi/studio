import { Badge } from "@/components/ui/badge";
import type { JobState } from "@/features/jobs/domain/job";

const STATE_LABEL: Record<JobState, string> = {
  QUEUED: "Queued",
  CLAIMED: "Claimed",
  RENDERING: "Rendering",
  RENDERED: "Rendered",
  DELIVERING: "Delivering",
  UPLOADED: "Uploaded",
  ERROR: "Error",
  CANCELED: "Canceled",
};

const STATE_VARIANT: Record<
  JobState,
  "default" | "secondary" | "destructive" | "outline"
> = {
  QUEUED: "outline",
  CLAIMED: "outline",
  RENDERING: "secondary",
  RENDERED: "secondary",
  DELIVERING: "secondary",
  UPLOADED: "default",
  ERROR: "destructive",
  CANCELED: "outline",
};

export function JobStatusBadge({ state }: { state: JobState }) {
  return <Badge variant={STATE_VARIANT[state]}>{STATE_LABEL[state]}</Badge>;
}
