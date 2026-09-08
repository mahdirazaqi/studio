"use server";

import { defineAction } from "@/server/actions";
import { searchGalleryFilesSchema } from "@/features/files/schemas/search-gallery-files.schema";
import { searchGalleryFiles } from "@/features/files/use-cases/search-gallery-files";

/** Read-only — the Job asset File Picker's live search/browse. */
export const searchGalleryFilesAction = defineAction({
  name: "files.searchGallery",
  input: searchGalleryFilesSchema,
  handler: async ({ input, actor }) => searchGalleryFiles(actor, input),
});
