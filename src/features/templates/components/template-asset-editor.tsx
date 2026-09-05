"use client";

import { useId } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  allowsFileReference,
  requiresImageRatio,
} from "@/features/templates/domain/template-asset-rules";
import type {
  TemplateAssetKind,
  TemplateImageRatio,
} from "@/features/templates/domain/template";

const KIND_OPTIONS: { value: TemplateAssetKind; label: string }[] = [
  { value: "DATA", label: "Data (literal text)" },
  { value: "IMAGE", label: "Image" },
  { value: "AUDIO", label: "Audio" },
  { value: "VIDEO", label: "Video" },
];

const IMAGE_RATIO_OPTIONS: { value: TemplateImageRatio; label: string }[] = [
  { value: "PORTRAIT_9_16", label: "Portrait (9:16)" },
  { value: "LANDSCAPE_16_9", label: "Landscape (16:9)" },
  { value: "SQUARE", label: "Square" },
  { value: "ANY", label: "Any" },
];

/** One asset row's editable state — a superset of the server's input shape,
 * with a stable client-only `rowId` for React keys across reorders and
 * empty-string sentinels for "not set" select values. */
export interface AssetRowState {
  rowId: string;
  key: string;
  kind: TemplateAssetKind;
  composition: string;
  layer: string;
  imageRatio: TemplateImageRatio | "";
  defaultFileId: string;
}

export function emptyAssetRow(rowId: string): AssetRowState {
  return {
    rowId,
    key: "",
    kind: "DATA",
    composition: "",
    layer: "",
    imageRatio: "",
    defaultFileId: "",
  };
}

export interface GalleryFileOption {
  id: string;
  originalName: string;
  kind: "IMAGE" | "AUDIO" | "VIDEO";
  departmentId: string;
}

export function TemplateAssetEditor({
  assets,
  onChange,
  galleryFiles,
  /** Only relevant when `galleryFiles` spans multiple departments (the
   * ADMIN cross-department picker) — narrows the file options to the
   * Template's actual target department. */
  departmentId,
  fieldErrors,
  disabled,
}: {
  assets: AssetRowState[];
  onChange: (assets: AssetRowState[]) => void;
  galleryFiles: GalleryFileOption[];
  departmentId?: string;
  fieldErrors?: Record<string, string[]>;
  disabled?: boolean;
}) {
  const idPrefix = useId();

  function updateRow(index: number, patch: Partial<AssetRowState>) {
    const next = assets.slice();
    const current = next[index];
    if (!current) return;
    next[index] = { ...current, ...patch };
    onChange(next);
  }

  function removeRow(index: number) {
    onChange(assets.filter((_, i) => i !== index));
  }

  function moveRow(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= assets.length) return;
    const next = assets.slice();
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    onChange(next);
  }

  function addRow() {
    onChange([
      ...assets,
      emptyAssetRow(`${idPrefix}-${assets.length}-${Date.now()}`),
    ]);
  }

  const assetsListError = fieldErrors?.assets;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Asset slots</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={disabled}
        >
          <Plus /> Add asset
        </Button>
      </div>

      {assetsListError?.map((message) => (
        <p key={message} className="text-destructive text-sm">
          {message}
        </p>
      ))}

      {assets.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No asset slots yet. A zero-asset template is valid (e.g. a fully
          static render) — add a slot only if this template needs a Job to
          supply something.
        </p>
      ) : null}

      <div className="space-y-3">
        {assets.map((asset, index) => {
          const rowErrors = (field: string) =>
            fieldErrors?.[`assets.${index}.${field}`];
          const availableFiles = galleryFiles.filter(
            (file) =>
              file.kind === asset.kind &&
              (!departmentId || file.departmentId === departmentId),
          );

          return (
            <Card key={asset.rowId}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground text-xs font-medium">
                    Slot {index + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Move up"
                      disabled={disabled || index === 0}
                      onClick={() => moveRow(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Move down"
                      disabled={disabled || index === assets.length - 1}
                      onClick={() => moveRow(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove asset"
                      disabled={disabled}
                      onClick={() => removeRow(index)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${idPrefix}-key-${index}`}>Slot key</Label>
                    <Input
                      id={`${idPrefix}-key-${index}`}
                      value={asset.key}
                      disabled={disabled}
                      placeholder="e.g. cover_image"
                      aria-invalid={rowErrors("key") ? true : undefined}
                      onChange={(e) =>
                        updateRow(index, { key: e.target.value })
                      }
                    />
                    {rowErrors("key")?.map((m) => (
                      <p key={m} className="text-destructive text-xs">
                        {m}
                      </p>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`${idPrefix}-kind-${index}`}>Kind</Label>
                    <select
                      id={`${idPrefix}-kind-${index}`}
                      value={asset.kind}
                      disabled={disabled}
                      className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                      onChange={(e) =>
                        updateRow(index, {
                          kind: e.target.value as TemplateAssetKind,
                          // Switching kind can invalidate the previous
                          // imageRatio/defaultFileId — clear rather than
                          // submit a now-inconsistent combination.
                          imageRatio: "",
                          defaultFileId: "",
                        })
                      }
                    >
                      {KIND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`${idPrefix}-composition-${index}`}>
                      Composition
                    </Label>
                    <Input
                      id={`${idPrefix}-composition-${index}`}
                      value={asset.composition}
                      disabled={disabled}
                      aria-invalid={rowErrors("composition") ? true : undefined}
                      onChange={(e) =>
                        updateRow(index, { composition: e.target.value })
                      }
                    />
                    {rowErrors("composition")?.map((m) => (
                      <p key={m} className="text-destructive text-xs">
                        {m}
                      </p>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`${idPrefix}-layer-${index}`}>
                      Layer (also the {"{{layer}}"} tag placeholder)
                    </Label>
                    <Input
                      id={`${idPrefix}-layer-${index}`}
                      value={asset.layer}
                      disabled={disabled}
                      aria-invalid={rowErrors("layer") ? true : undefined}
                      onChange={(e) =>
                        updateRow(index, { layer: e.target.value })
                      }
                    />
                    {rowErrors("layer")?.map((m) => (
                      <p key={m} className="text-destructive text-xs">
                        {m}
                      </p>
                    ))}
                  </div>

                  {requiresImageRatio(asset.kind) ? (
                    <div className="space-y-1.5">
                      <Label htmlFor={`${idPrefix}-ratio-${index}`}>
                        Aspect ratio
                      </Label>
                      <select
                        id={`${idPrefix}-ratio-${index}`}
                        value={asset.imageRatio}
                        disabled={disabled}
                        className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                        onChange={(e) =>
                          updateRow(index, {
                            imageRatio: e.target.value as TemplateImageRatio,
                          })
                        }
                      >
                        <option value="">Select…</option>
                        {IMAGE_RATIO_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {rowErrors("imageRatio")?.map((m) => (
                        <p key={m} className="text-destructive text-xs">
                          {m}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {allowsFileReference(asset.kind) ? (
                    <div className="space-y-1.5">
                      <Label htmlFor={`${idPrefix}-file-${index}`}>
                        Default file (optional)
                      </Label>
                      <select
                        id={`${idPrefix}-file-${index}`}
                        value={asset.defaultFileId}
                        disabled={disabled}
                        className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                        onChange={(e) =>
                          updateRow(index, { defaultFileId: e.target.value })
                        }
                      >
                        <option value="">None</option>
                        {availableFiles.map((file) => (
                          <option key={file.id} value={file.id}>
                            {file.originalName}
                          </option>
                        ))}
                      </select>
                      {rowErrors("defaultFileId")?.map((m) => (
                        <p key={m} className="text-destructive text-xs">
                          {m}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
