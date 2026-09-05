"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { uploadFileSchema } from "@/features/files/schemas/upload-file.schema";
import { uploadFile } from "@/features/files/use-cases/upload-file";

export const uploadFileAction = defineAction({
  name: "files.upload",
  input: uploadFileSchema,
  handler: async ({ input, actor }) => {
    const result = await uploadFile(actor, input);
    revalidatePath("/files");
    return result;
  },
});
