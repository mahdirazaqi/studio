"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { createWorkerApiKeySchema } from "@/features/worker-keys/schemas/worker-api-key-input.schema";
import { createWorkerApiKey } from "@/features/worker-keys/use-cases/create-worker-api-key";

export const createWorkerApiKeyAction = defineAction({
  name: "workerKeys.create",
  input: createWorkerApiKeySchema,
  handler: async ({ input, actor }) => {
    const result = await createWorkerApiKey(actor, input);
    revalidatePath("/worker-keys");
    return result;
  },
});
