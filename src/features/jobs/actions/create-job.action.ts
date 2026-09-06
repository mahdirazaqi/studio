"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { createJobSchema } from "@/features/jobs/schemas/create-job.schema";
import { createJob } from "@/features/jobs/use-cases/create-job";

export const createJobAction = defineAction({
  name: "jobs.create",
  input: createJobSchema,
  handler: async ({ input, actor }) => {
    const job = await createJob(actor, input);
    revalidatePath("/jobs");
    return job;
  },
});
