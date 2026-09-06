import { businessRuleError } from "@/server/errors/app-error";
import { findGalleryFilesByIdsInDepartment } from "@/features/files/repository/file-repository";
import type { SafeTemplateAsset } from "@/features/templates/domain/template";
import { buildJobTitle } from "@/features/jobs/domain/build-job-title";
import type { JobAssetData } from "@/features/jobs/repository/job-repository";
import type { JobAssetInput } from "@/features/jobs/schemas/job-asset-input.schema";

export interface ResolveJobAssetsInput {
  /** Always the Template's own department — never the actor's (ADMIN case). */
  departmentId: string;
  templateAssets: readonly SafeTemplateAsset[];
  scriptRef: string;
  inputAssets: readonly JobAssetInput[];
}

export interface ResolvedJobAssets {
  /** The injected `SCRIPT` row first, then one row per Template slot, in order. */
  jobAssets: JobAssetData[];
  title: string;
}

/**
 * Validates and resolves a Job's asset values against its Template
 * (docs/domain/jobs.md "Creation" steps 3–4; Phase 6 brief §9–11). Every
 * Template asset slot must have exactly one matching input; every file
 * reference is resolved **server-side**, scoped to the Template's own
 * Department — a client-supplied `fileId` is never trusted as pointing at a
 * real, in-scope, kind-matching File until this function says so.
 */
export async function resolveJobAssets(
  input: ResolveJobAssetsInput,
): Promise<ResolvedJobAssets> {
  const inputBySlotKey = new Map(
    input.inputAssets.map((asset) => [asset.slotKey, asset]),
  );

  const knownSlotKeys = new Set(input.templateAssets.map((slot) => slot.key));
  const unknownSlotKey = input.inputAssets.find(
    (asset) => !knownSlotKeys.has(asset.slotKey),
  );
  if (unknownSlotKey) {
    throw businessRuleError(
      `"${unknownSlotKey.slotKey}" is not a slot on this template.`,
    );
  }

  const fileIdsNeeded = [
    ...new Set(
      input.inputAssets
        .map((asset) => asset.fileId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const filesById = new Map(
    (
      await findGalleryFilesByIdsInDepartment(input.departmentId, fileIdsNeeded)
    ).map((file) => [file.id, file]),
  );

  const dataValues: string[] = [];
  const jobAssets: JobAssetData[] = [
    {
      slotKey: null,
      kind: "SCRIPT",
      composition: null,
      layer: null,
      textValue: input.scriptRef,
      fileId: null,
      fileOriginalName: null,
      fileMimeType: null,
      fileSizeBytes: null,
      fileWidth: null,
      fileHeight: null,
    },
  ];

  for (const slot of input.templateAssets) {
    const value = inputBySlotKey.get(slot.key);
    if (!value) {
      throw businessRuleError(
        `A value is required for the "${slot.key}" slot.`,
      );
    }

    if (slot.kind === "DATA") {
      if (!value.text) {
        throw businessRuleError(
          `The "${slot.key}" slot requires a text value.`,
        );
      }
      dataValues.push(value.text);
      jobAssets.push({
        slotKey: slot.key,
        kind: "DATA",
        composition: slot.composition,
        layer: slot.layer,
        textValue: value.text,
        fileId: null,
        fileOriginalName: null,
        fileMimeType: null,
        fileSizeBytes: null,
        fileWidth: null,
        fileHeight: null,
      });
      continue;
    }

    if (!value.fileId) {
      throw businessRuleError(`The "${slot.key}" slot requires a file.`);
    }
    const file = filesById.get(value.fileId);
    if (!file) {
      throw businessRuleError(
        `The file selected for "${slot.key}" could not be found in this department's gallery.`,
      );
    }
    if (file.kind !== slot.kind) {
      throw businessRuleError(
        `The "${slot.key}" slot requires a ${slot.kind.toLowerCase()} file.`,
      );
    }

    jobAssets.push({
      slotKey: slot.key,
      kind: slot.kind,
      composition: slot.composition,
      layer: slot.layer,
      textValue: null,
      fileId: file.id,
      fileOriginalName: file.originalName,
      fileMimeType: file.mimeType,
      fileSizeBytes: file.sizeBytes,
      fileWidth: file.width,
      fileHeight: file.height,
    });
  }

  return { jobAssets, title: buildJobTitle(dataValues) };
}
