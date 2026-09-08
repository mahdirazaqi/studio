import type { SafeJobAsset, SafeJobDetail } from "@/features/jobs/domain/job";

/**
 * The Worker-facing Job payload (docs/integrations/worker-api.md "Fetch/claim
 * response"). Field names deliberately match legacy's `FetchJobOutput`
 * (`output`/`title`/`composition`/`template`/`assets[].{composition,layer,type,src,text}`)
 * so the Worker's existing parsing keeps working — the only breaking change is
 * authentication (ADR-0004). `state` is a genuinely new field (legacy never
 * returned it here); adding fields is compatible, renaming/removing existing
 * ones is not.
 *
 * Built entirely from the Job's immutable `snapshot`/`JobAsset` rows
 * (ADR-0028) — never from a live Template/File read — so a historical or
 * in-flight Job's payload can never silently change meaning underneath the
 * Worker (docs/domain/jobs.md "Historical integrity for Jobs").
 */
export interface WorkerJobAsset {
  key: string | null;
  composition: string | null;
  layer: string | null;
  type: string;
  src: string | null;
  text: string | null;
}

export interface WorkerJobPayload {
  id: string;
  state: string;
  output: string;
  title: string;
  composition: string;
  /** Legacy field name, kept verbatim — actually the Template's `source` (opaque). */
  template: string;
  assets: WorkerJobAsset[];
}

function toWorkerAsset(
  asset: SafeJobAsset,
  buildFileUrl: (fileId: string) => string,
): WorkerJobAsset {
  const type = asset.kind.toLowerCase();

  if (asset.kind === "SCRIPT") {
    // Legacy: `{ type: 'script', src: template.script }` — the script
    // reference travels in `src`, not `text`.
    return {
      key: asset.slotKey,
      composition: asset.composition,
      layer: asset.layer,
      type,
      src: asset.textValue,
      text: null,
    };
  }

  if (asset.kind === "DATA") {
    return {
      key: asset.slotKey,
      composition: asset.composition,
      layer: asset.layer,
      type,
      src: null,
      text: asset.textValue,
    };
  }

  // IMAGE | AUDIO | VIDEO — `src` is a relative path the Worker `GET`s to
  // download the bytes, not a raw filesystem path (Studio's storage is
  // behind `StorageAdapter`, ADR-0024 — there is no path to hand out). The
  // actual Worker's downloader sends **no credential at all** on this
  // request (`downloader.go`'s `downloadFile` is a plain `http.Get`) —
  // `/api/files/[fileId]` accommodates that (ADR-0043; see its own doc
  // comment). `null` when the source File has since been deleted; the
  // Worker cannot download it, but every other field here still reflects
  // what the Job was created with.
  return {
    key: asset.slotKey,
    composition: asset.composition,
    layer: asset.layer,
    type,
    src: asset.fileId ? buildFileUrl(asset.fileId) : null,
    text: null,
  };
}

/**
 * @param buildFileUrl Builds the Worker-fetchable **relative path** for a
 *   File id (`/api/files/[fileId]` — see `docs/architecture/files.md`
 *   "Access & preview: Worker access"). Deliberately relative, not absolute
 *   (ADR-0043) — the actual Worker's downloader only resolves correctly
 *   against a path joined onto its own configured base URL.
 */
export function buildWorkerJobPayload(
  job: SafeJobDetail,
  buildFileUrl: (fileId: string) => string,
): WorkerJobPayload {
  return {
    id: job.id,
    state: job.state,
    output: job.snapshot.outputPattern,
    title: job.title,
    composition: job.snapshot.composition,
    template: job.snapshot.source,
    assets: job.assets.map((asset) => toWorkerAsset(asset, buildFileUrl)),
  };
}
