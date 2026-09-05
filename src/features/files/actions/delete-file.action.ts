"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { defineAction } from "@/server/actions";
import { commonSchemas } from "@/server/validation";
import { deleteFile } from "@/features/files/use-cases/delete-file";

export const deleteFileAction = defineAction({
  name: "files.delete",
  input: z.object({ fileId: commonSchemas.id }),
  handler: async ({ input, actor }) => {
    await deleteFile(actor, input.fileId);
    revalidatePath("/files");
    return { deleted: true };
  },
});
