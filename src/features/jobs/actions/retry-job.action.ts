"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { retryJobSchema } from "@/features/jobs/schemas/retry-job.schema";
import { retryJob } from "@/features/jobs/use-cases/retry-job";

export const retryJobAction = defineAction({
  name: "jobs.retry",
  input: retryJobSchema,
  handler: async ({ input, actor }) => {
    const job = await retryJob(actor, input.jobId, input.reason);
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${input.jobId}`);
    return job;
  },
});
