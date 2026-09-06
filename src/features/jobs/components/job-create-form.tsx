"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createJobAction } from "@/features/jobs/actions/create-job.action";
import { getTemplateForJobFormAction } from "@/features/jobs/actions/get-template-for-job-form.action";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";

export interface TemplateChoice {
  id: string;
  name: string;
  departmentName?: string;
}

export interface JobGalleryFileOption {
  id: string;
  originalName: string;
  kind: "IMAGE" | "AUDIO" | "VIDEO";
  departmentId: string;
}

/**
 * Not a rendering/canvas editor (Phase 6 brief §35) — a plain form: pick a
 * Template, then fill in its asset slots (text or a Gallery File per slot).
 * The Template's full asset list is fetched on demand once one is chosen
 * (`getTemplateForJobFormAction`), so the department-scoped Gallery File list
 * doesn't need to be pre-joined against every Template up front.
 */
export function JobCreateForm({
  templateChoices,
  galleryFiles,
}: {
  templateChoices: TemplateChoice[];
  /** Already scoped by the page: the actor's own department for USER/MANAGER,
   * or a capped cross-department list for ADMIN. */
  galleryFiles: JobGalleryFileOption[];
}) {
  const router = useRouter();
  const formId = useId();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [templateId, setTemplateId] = useState("");
  const [template, setTemplate] = useState<SafeTemplateDetail | null>(null);
  const [deliverToYouTube, setDeliverToYouTube] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  function handleTemplateChange(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    setTemplate(null);
    setValues({});
    setFormError(null);
    if (!nextTemplateId) return;

    startTransition(async () => {
      const result = await getTemplateForJobFormAction({
        templateId: nextTemplateId,
      });
      if (!result.ok) {
        setFormError(result.error.message);
        return;
      }
      setTemplate(result.data);
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    if (!template) {
      setFormError("Choose a template first.");
      return;
    }

    const assets = template.assets.map((slot) => {
      const value = values[slot.key] ?? "";
      return slot.kind === "DATA"
        ? { slotKey: slot.key, text: value }
        : { slotKey: slot.key, fileId: value || undefined };
    });

    startTransition(async () => {
      const result = await createJobAction({
        templateId: template.id,
        deliverToYouTube,
        assets,
      });
      if (!result.ok) {
        setFieldErrors(result.error.fieldErrors ?? {});
        if (!result.error.fieldErrors) setFormError(result.error.message);
        return;
      }
      toast.success(`Job "${result.data.title}" created.`);
      router.push(`/jobs/${result.data.id}`);
      router.refresh();
    });
  }

  const availableFilesForSlot = (kind: "IMAGE" | "AUDIO" | "VIDEO") =>
    galleryFiles.filter(
      (file) =>
        file.kind === kind &&
        (!template || file.departmentId === template.departmentId),
    );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formError ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {formError}
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-template`}>Template</Label>
            <select
              id={`${formId}-template`}
              value={templateId}
              disabled={isPending}
              className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
              onChange={(e) => handleTemplateChange(e.target.value)}
            >
              <option value="">Select a template…</option>
              {templateChoices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name}
                  {choice.departmentName ? ` — ${choice.departmentName}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              id={`${formId}-upload`}
              type="checkbox"
              checked={deliverToYouTube}
              disabled={isPending}
              onChange={(e) => setDeliverToYouTube(e.target.checked)}
              className="size-4"
            />
            <Label htmlFor={`${formId}-upload`} className="font-normal">
              Deliver to YouTube when rendering completes
            </Label>
          </div>
        </CardContent>
      </Card>

      {template ? (
        <Card>
          <CardContent className="space-y-4 py-6">
            <p className="text-sm font-medium">Asset values</p>
            {template.assets.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                This template has no asset slots — it renders as-is.
              </p>
            ) : null}
            {template.assets.map((slot) => (
              <div key={slot.id} className="space-y-1.5">
                <Label htmlFor={`${formId}-slot-${slot.key}`}>
                  {slot.key} ({slot.kind.toLowerCase()})
                </Label>
                {slot.kind === "DATA" ? (
                  <Textarea
                    id={`${formId}-slot-${slot.key}`}
                    value={values[slot.key] ?? ""}
                    disabled={isPending}
                    rows={2}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [slot.key]: e.target.value,
                      }))
                    }
                  />
                ) : (
                  <select
                    id={`${formId}-slot-${slot.key}`}
                    value={values[slot.key] ?? ""}
                    disabled={isPending}
                    className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [slot.key]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select a file…</option>
                    {availableFilesForSlot(slot.kind).map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.originalName}
                      </option>
                    ))}
                  </select>
                )}
                {fieldErrors[
                  `assets.${template.assets.indexOf(slot)}.text`
                ]?.map((m) => (
                  <p key={m} className="text-destructive text-xs">
                    {m}
                  </p>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {fieldErrors.assets?.map((m) => (
        <p key={m} className="text-destructive text-sm">
          {m}
        </p>
      ))}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !template}>
          <Send /> {isPending ? "Creating…" : "Create job"}
        </Button>
      </div>
    </form>
  );
}
