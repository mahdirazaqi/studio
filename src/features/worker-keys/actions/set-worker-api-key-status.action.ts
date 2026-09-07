"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { workerApiKeyIdParamSchema } from "@/features/worker-keys/schemas/worker-api-key-input.schema";
import {
  reactivateWorkerApiKey,
  revokeWorkerApiKey,
} from "@/features/worker-keys/use-cases/set-worker-api-key-status";

export const revokeWorkerApiKeyAction = defineAction({
  name: "workerKeys.revoke",
  input: workerApiKeyIdParamSchema,
  handler: async ({ input, actor }) => {
    const key = await revokeWorkerApiKey(actor, input.keyId);
    revalidatePath("/worker-keys");
    return key;
  },
});

export const reactivateWorkerApiKeyAction = defineAction({
  name: "workerKeys.reactivate",
  input: workerApiKeyIdParamSchema,
  handler: async ({ input, actor }) => {
    const key = await reactivateWorkerApiKey(actor, input.keyId);
    revalidatePath("/worker-keys");
    return key;
  },
});
