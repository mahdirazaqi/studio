"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { retryJobDeliverySchema } from "@/features/delivery/schemas/retry-job-delivery.schema";
import { retryJobDelivery } from "@/features/delivery/use-cases/retry-job-delivery";

export const retryJobDeliveryAction = defineAction({
  name: "delivery.retryJob",
  input: retryJobDeliverySchema,
  handler: async ({ input, actor }) => {
    const job = await retryJobDelivery(actor, input.jobId);
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${input.jobId}`);
    return job;
  },
});
