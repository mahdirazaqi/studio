"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { cancelJobSchema } from "@/features/jobs/schemas/cancel-job.schema";
import { cancelJob } from "@/features/jobs/use-cases/cancel-job";

export const cancelJobAction = defineAction({
  name: "jobs.cancel",
  input: cancelJobSchema,
  handler: async ({ input, actor }) => {
    const job = await cancelJob(actor, input.jobId, input.reason);
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${input.jobId}`);
    return job;
  },
});
