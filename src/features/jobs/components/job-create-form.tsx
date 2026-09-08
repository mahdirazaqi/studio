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
import {
  FilePicker,
  type FilePickerFile,
} from "@/features/files/components/file-picker";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";

export interface TemplateChoice {
  id: string;
  name: string;
  departmentName?: string;
}

/**
 * Not a rendering/canvas editor (Phase 6 brief §35) — a plain form: pick a
 * Template, then fill in its asset slots (text, or a Gallery File per slot
 * via `FilePicker`, which browses/uploads live scoped to the Template's own
 * department — see `features/files/components/file-picker.tsx`). The
 * Template's full asset list is fetched on demand once one is chosen
 * (`getTemplateForJobFormAction`).
 */
export function JobCreateForm({
  templateChoices,
}: {
  templateChoices: TemplateChoice[];
}) {
  const router = useRouter();
  const formId = useId();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [templateId, setTemplateId] = useState("");
  const [template, setTemplate] = useState<SafeTemplateDetail | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fileValues, setFileValues] = useState<
    Record<string, FilePickerFile | undefined>
  >({});

  function handleTemplateChange(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    setTemplate(null);
    setValues({});
    setFileValues({});
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
                  <FilePicker
                    kind={slot.kind}
                    departmentId={template.departmentId}
                    selectedFile={fileValues[slot.key]}
                    disabled={isPending}
                    onChange={(fileId, file) => {
                      setValues((prev) => ({ ...prev, [slot.key]: fileId }));
                      setFileValues((prev) => ({ ...prev, [slot.key]: file }));
                    }}
                  />
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
