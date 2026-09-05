"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { uploadFileAction } from "@/features/files/actions/upload-file.action";

/** Only rendered for ADMIN — see the page's use of `listDepartmentsForAdmin`. */
export interface DepartmentChoice {
  id: string;
  name: string;
}

export function UploadFileForm({
  departmentChoices,
}: {
  /** `undefined` for USER/MANAGER — they always upload into their own department. */
  departmentChoices?: DepartmentChoice[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const form = event.currentTarget;
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setFormError("Choose a file to upload.");
      return;
    }
    const departmentId = departmentChoices
      ? (new FormData(form).get("departmentId") as string)
      : undefined;

    startTransition(async () => {
      const result = await uploadFileAction({ file, departmentId });
      if (!result.ok) {
        setFieldErrors(result.error.fieldErrors ?? {});
        if (!result.error.fieldErrors) setFormError(result.error.message);
        return;
      }
      form.reset();
      toast.success(`"${result.data.file.originalName}" uploaded.`);
      if (result.data.duplicateOfFileId) {
        toast.message(
          "Note: a file with identical content already exists in this gallery.",
        );
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError ? (
            <p
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {formError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="file">Upload a file</Label>
              <input
                ref={inputRef}
                id="file"
                name="file"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.mp3,.mp4"
                disabled={isPending}
                aria-invalid={fieldErrors.file ? true : undefined}
                className="border-input file:text-foreground w-full min-w-0 rounded-md border bg-transparent text-sm shadow-xs file:mr-3 file:h-9 file:border-0 file:bg-transparent file:px-3 file:text-sm file:font-medium disabled:pointer-events-none disabled:opacity-50"
              />
              <p className="text-muted-foreground text-xs">
                JPG, PNG, WEBP, MP3, or MP4. Max 25MB for images, 100MB for
                audio, 500MB for video.
              </p>
              {fieldErrors.file?.map((message) => (
                <p key={message} className="text-destructive text-sm">
                  {message}
                </p>
              ))}
            </div>

            {departmentChoices ? (
              <div className="space-y-2">
                <Label htmlFor="departmentId">Department</Label>
                <select
                  id="departmentId"
                  name="departmentId"
                  disabled={isPending}
                  className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs sm:w-48"
                >
                  {departmentChoices.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <Button type="submit" disabled={isPending}>
              <UploadCloud />
              {isPending ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
