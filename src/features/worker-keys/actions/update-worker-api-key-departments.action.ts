"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { updateWorkerApiKeyDepartmentsSchema } from "@/features/worker-keys/schemas/worker-api-key-input.schema";
import { updateWorkerApiKeyDepartments } from "@/features/worker-keys/use-cases/update-worker-api-key-departments";

export const updateWorkerApiKeyDepartmentsAction = defineAction({
  name: "workerKeys.updateDepartments",
  input: updateWorkerApiKeyDepartmentsSchema,
  handler: async ({ input, actor }) => {
    const key = await updateWorkerApiKeyDepartments(
      actor,
      input.keyId,
      input.departmentIds,
    );
    revalidatePath("/worker-keys");
    return key;
  },
});
