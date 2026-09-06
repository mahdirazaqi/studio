"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTemplateAction } from "@/features/templates/actions/create-template.action";
import { updateTemplateAction } from "@/features/templates/actions/update-template.action";
import {
  TemplateAssetEditor,
  type AssetRowState,
  type GalleryFileOption,
} from "@/features/templates/components/template-asset-editor";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";
import type { SafeYouTubeTarget } from "@/features/youtube/domain/youtube-target";

export interface DepartmentChoice {
  id: string;
  name: string;
}

function toAssetRows(
  assets: SafeTemplateDetail["assets"],
  seed: string,
): AssetRowState[] {
  return assets.map((asset, index) => ({
    rowId: `${seed}-${index}`,
    key: asset.key,
    kind: asset.kind,
    composition: asset.composition,
    layer: asset.layer,
    imageRatio: asset.imageRatio ?? "",
    defaultFileId: asset.defaultFileId ?? "",
  }));
}

/**
 * Create/edit form for a Template's full configuration — one shared
 * component for both, since the field set and validation are identical
 * (docs/domain/templates.md "Creation & editing"). Not a visual/canvas
 * editor: composition/source/script/output are opaque strings passed through
 * to the Render Worker, edited as plain text (Phase 5 brief §21).
 */
export function TemplateForm({
  mode,
  template,
  departmentChoices,
  galleryFiles,
  youtubeTargets,
  readOnly = false,
}: {
  mode: "create" | "edit";
  /** Required for `mode: "edit"`. */
  template?: SafeTemplateDetail;
  /** ADMIN only, `mode: "create"` only — USER/MANAGER always use their own department. */
  departmentChoices?: DepartmentChoice[];
  /** Already scoped by the page: the actor's own department for USER/MANAGER,
   * or a capped cross-department list for ADMIN. */
  galleryFiles: GalleryFileOption[];
  /** `CONNECTED` YouTube Targets available to pick from — same scoping as
   * `galleryFiles` (Phase 9, docs/domain/templates.md "Template ↔ Target"). */
  youtubeTargets: SafeYouTubeTarget[];
  /** USER can view a Template (`template:view`) but not author it
   * (docs/domain/authorization.md) — renders every field disabled and drops
   * the Save action rather than letting a submit round-trip to a 403. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [isPending, startTransition] = useTransition();
  const fieldsDisabled = isPending || readOnly;
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState(template?.name ?? "");
  const [composition, setComposition] = useState(template?.composition ?? "");
  const [source, setSource] = useState(template?.source ?? "");
  const [scriptRef, setScriptRef] = useState(template?.scriptRef ?? "");
  const [outputPattern, setOutputPattern] = useState(
    template?.outputPattern ?? "",
  );
  const [description, setDescription] = useState(template?.description ?? "");
  const [tagsText, setTagsText] = useState((template?.tags ?? []).join(", "));
  const [youtubeTargetId, setYoutubeTargetId] = useState(
    template?.youtubeTargetId ?? "",
  );
  const [departmentId, setDepartmentId] = useState(
    departmentChoices?.[0]?.id ?? "",
  );
  const [assets, setAssets] = useState<AssetRowState[]>(
    template ? toAssetRows(template.assets, formId) : [],
  );

  // ADMIN picking a department in create mode narrows the file picker to
  // that department; every other case (edit, or a non-ADMIN actor) has one
  // fixed, known department to filter by.
  const effectiveDepartmentId =
    mode === "edit"
      ? template?.departmentId
      : departmentChoices
        ? departmentId
        : undefined;

  const youtubeTargetOptions = effectiveDepartmentId
    ? youtubeTargets.filter(
        (target) => target.departmentId === effectiveDepartmentId,
      )
    : youtubeTargets;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const tags = tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const body = {
      ...(mode === "create" && departmentChoices ? { departmentId } : {}),
      name,
      composition,
      source,
      scriptRef,
      outputPattern,
      description: description.trim() === "" ? undefined : description,
      tags,
      youtubeTargetId: youtubeTargetId === "" ? undefined : youtubeTargetId,
      assets: assets.map((asset) => ({
        key: asset.key,
        kind: asset.kind,
        composition: asset.composition,
        layer: asset.layer,
        imageRatio: asset.imageRatio === "" ? undefined : asset.imageRatio,
        defaultFileId:
          asset.defaultFileId === "" ? undefined : asset.defaultFileId,
      })),
    };

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createTemplateAction(body)
          : await updateTemplateAction({ ...body, templateId: template!.id });

      if (!result.ok) {
        setFieldErrors(result.error.fieldErrors ?? {});
        if (!result.error.fieldErrors) setFormError(result.error.message);
        return;
      }

      toast.success(
        mode === "create"
          ? `"${result.data.name}" created.`
          : `"${result.data.name}" saved.`,
      );
      router.push(`/templates/${result.data.id}`);
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${formId}-name`}>Name</Label>
              <Input
                id={`${formId}-name`}
                value={name}
                disabled={fieldsDisabled}
                aria-invalid={fieldErrors.name ? true : undefined}
                onChange={(e) => setName(e.target.value)}
                required
              />
              {fieldErrors.name?.map((m) => (
                <p key={m} className="text-destructive text-sm">
                  {m}
                </p>
              ))}
            </div>

            {mode === "create" && departmentChoices ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-department`}>Department</Label>
                <select
                  id={`${formId}-department`}
                  value={departmentId}
                  disabled={fieldsDisabled}
                  className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  {departmentChoices.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-composition`}>Composition</Label>
              <Input
                id={`${formId}-composition`}
                value={composition}
                disabled={fieldsDisabled}
                aria-invalid={fieldErrors.composition ? true : undefined}
                onChange={(e) => setComposition(e.target.value)}
                required
              />
              {fieldErrors.composition?.map((m) => (
                <p key={m} className="text-destructive text-sm">
                  {m}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-source`}>Source</Label>
              <Input
                id={`${formId}-source`}
                value={source}
                disabled={fieldsDisabled}
                aria-invalid={fieldErrors.source ? true : undefined}
                onChange={(e) => setSource(e.target.value)}
                required
              />
              {fieldErrors.source?.map((m) => (
                <p key={m} className="text-destructive text-sm">
                  {m}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-script`}>Script reference</Label>
              <Input
                id={`${formId}-script`}
                value={scriptRef}
                disabled={fieldsDisabled}
                aria-invalid={fieldErrors.scriptRef ? true : undefined}
                onChange={(e) => setScriptRef(e.target.value)}
                required
              />
              {fieldErrors.scriptRef?.map((m) => (
                <p key={m} className="text-destructive text-sm">
                  {m}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-output`}>Output pattern</Label>
              <Input
                id={`${formId}-output`}
                value={outputPattern}
                disabled={fieldsDisabled}
                aria-invalid={fieldErrors.outputPattern ? true : undefined}
                onChange={(e) => setOutputPattern(e.target.value)}
                required
              />
              {fieldErrors.outputPattern?.map((m) => (
                <p key={m} className="text-destructive text-sm">
                  {m}
                </p>
              ))}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${formId}-description`}>
                Description (YouTube description on delivery)
              </Label>
              <Textarea
                id={`${formId}-description`}
                value={description}
                disabled={fieldsDisabled}
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
              />
              {fieldErrors.description?.map((m) => (
                <p key={m} className="text-destructive text-sm">
                  {m}
                </p>
              ))}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${formId}-tags`}>
                Tags (comma-separated; {"{{layer}}"} is substituted on delivery)
              </Label>
              <Input
                id={`${formId}-tags`}
                value={tagsText}
                disabled={fieldsDisabled}
                placeholder="e.g. highlights, {{layer}}, weekly"
                onChange={(e) => setTagsText(e.target.value)}
              />
              {fieldErrors.tags?.map((m) => (
                <p key={m} className="text-destructive text-sm">
                  {m}
                </p>
              ))}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${formId}-youtube-target`}>
                YouTube channel (optional)
              </Label>
              <select
                id={`${formId}-youtube-target`}
                value={youtubeTargetId}
                disabled={fieldsDisabled}
                className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                onChange={(e) => setYoutubeTargetId(e.target.value)}
              >
                <option value="">None — jobs cannot deliver to YouTube</option>
                {youtubeTargetOptions.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
              {fieldErrors.youtubeTargetId?.map((m) => (
                <p key={m} className="text-destructive text-sm">
                  {m}
                </p>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <TemplateAssetEditor
        assets={assets}
        onChange={setAssets}
        galleryFiles={galleryFiles}
        departmentId={effectiveDepartmentId}
        fieldErrors={fieldErrors}
        disabled={fieldsDisabled}
      />

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => router.back()}
        >
          {readOnly ? "Back" : "Cancel"}
        </Button>
        {readOnly ? null : (
          <Button type="submit" disabled={isPending}>
            <Save /> {isPending ? "Saving…" : "Save template"}
          </Button>
        )}
      </div>
    </form>
  );
}
