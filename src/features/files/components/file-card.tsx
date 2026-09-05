import { FileAudio } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { SafeFile } from "@/features/files/domain/file";
import { DeleteFileButton } from "@/features/files/components/delete-file-button";

const KIND_LABEL: Record<SafeFile["kind"], string> = {
  IMAGE: "Image",
  AUDIO: "Audio",
  VIDEO: "Video",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date);
}

/** Server Component — the only interactive piece is the delete button leaf. */
export function FileCard({
  file,
  canDelete,
}: {
  file: SafeFile;
  canDelete: boolean;
}) {
  const contentUrl = `/api/files/${file.id}`;

  return (
    <Card className="overflow-hidden py-0">
      <div className="bg-muted flex aspect-video items-center justify-center overflow-hidden">
        {file.kind === "IMAGE" ? (
          // Served only through the authenticated route above, never a
          // public/static URL — see docs/architecture/files.md.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={contentUrl}
            alt={file.originalName}
            className="size-full object-cover"
          />
        ) : file.kind === "AUDIO" ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-4">
            <FileAudio className="text-muted-foreground size-8" />
            <audio controls src={contentUrl} className="w-full">
              <track kind="captions" />
            </audio>
          </div>
        ) : (
          <video controls src={contentUrl} className="size-full object-contain">
            <track kind="captions" />
          </video>
        )}
      </div>

      <CardContent className="space-y-1 px-4 pt-3">
        <p className="truncate text-sm font-medium" title={file.originalName}>
          {file.originalName}
        </p>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <Badge variant="secondary">{KIND_LABEL[file.kind]}</Badge>
          <span>{formatSize(file.sizeBytes)}</span>
          {file.width && file.height ? (
            <span>
              {file.width}×{file.height}
            </span>
          ) : null}
          <span>{formatDate(file.createdAt)}</span>
        </div>
        {file.uploadedByName ? (
          <p className="text-muted-foreground truncate text-xs">
            Uploaded by {file.uploadedByName}
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="justify-end px-2 pb-2">
        {canDelete ? (
          <DeleteFileButton fileId={file.id} fileName={file.originalName} />
        ) : null}
      </CardFooter>
    </Card>
  );
}
