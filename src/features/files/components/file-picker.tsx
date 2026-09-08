"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { FileAudio, FileVideo, Search, UploadCloud, X } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { searchGalleryFilesAction } from "@/features/files/actions/search-gallery-files.action";
import { uploadFileAction } from "@/features/files/actions/upload-file.action";
import { FILE_KIND_RULES } from "@/features/files/domain/file-types";
import type { SafeFile, FileKind } from "@/features/files/domain/file";

export interface FilePickerFile {
  id: string;
  originalName: string;
  kind: FileKind;
  departmentId: string;
}

function acceptFor(kind: FileKind): string {
  const rule = FILE_KIND_RULES.find((r) => r.kind === kind);
  return rule ? rule.extensions.map((ext) => `.${ext}`).join(",") : "";
}

function Thumbnail({ file }: { file: { id: string; kind: FileKind } }) {
  const contentUrl = `/api/files/${file.id}`;
  if (file.kind === "IMAGE") {
    return (
      // Authenticated route only — see docs/architecture/files.md.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={contentUrl} alt="" className="size-full object-cover" />
    );
  }
  if (file.kind === "AUDIO") {
    return (
      <div className="flex size-full items-center justify-center">
        <FileAudio className="text-muted-foreground size-8" />
      </div>
    );
  }
  return (
    <div className="flex size-full items-center justify-center">
      <FileVideo className="text-muted-foreground size-8" />
    </div>
  );
}

/**
 * Visual picker for a Job asset File slot — replaces a plain `<select>` of
 * filenames with thumbnails, inline search, and inline upload
 * (docs/domain/files.md "Job asset selection"). Reuses the existing File
 * Gallery/upload architecture end to end: `searchGalleryFilesAction`
 * (department-scoped `file:manage` read) for browsing, `uploadFileAction`
 * (the same one the `/files` page uses) for uploading — no second storage
 * path, no duplicate validation.
 *
 * **Not a security boundary by itself.** `departmentId` here only narrows
 * what's *offered*; the actual selection is re-validated server-side against
 * the Template's department when the Job is created
 * (`features/jobs/use-cases/resolve-job-assets.ts`) — a crafted `fileId`
 * that doesn't belong there is rejected there regardless of what this
 * component ever displayed.
 */
export function FilePicker({
  kind,
  departmentId,
  selectedFile,
  onChange,
  disabled = false,
}: {
  kind: FileKind;
  /** The Template's department — narrows the browse/upload target. `undefined`
   * until a Template is chosen, in which case the picker stays closed. */
  departmentId?: string;
  /** The currently selected file's details (id, name, kind), if any — the
   * parent owns the selected `fileId` itself (via `onChange`); this is only
   * what the picker needs to render a thumbnail without a round trip. */
  selectedFile?: FilePickerFile;
  onChange: (fileId: string, file?: FilePickerFile) => void;
  disabled?: boolean;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<SafeFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isUploading, startUpload] = useTransition();
  const [current, setCurrent] = useState<FilePickerFile | undefined>(
    selectedFile,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrent(selectedFile);
  }, [selectedFile]);

  function runSearch(q: string) {
    if (!departmentId) return;
    setError(null);
    startSearch(async () => {
      const result = await searchGalleryFilesAction({
        q: q || undefined,
        kind,
        departmentId,
        page: 1,
        pageSize: 48,
      });
      if (!result.ok) {
        setError(result.error.message);
        setFiles([]);
        return;
      }
      setFiles(result.data.items);
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setFiles(null);
      setError(null);
      runSearch("");
    }
  }

  function handleSelect(file: SafeFile) {
    setCurrent({
      id: file.id,
      originalName: file.originalName,
      kind: file.kind,
      departmentId: file.departmentId,
    });
    onChange(file.id, {
      id: file.id,
      originalName: file.originalName,
      kind: file.kind,
      departmentId: file.departmentId,
    });
    setOpen(false);
  }

  function handleClear() {
    setCurrent(undefined);
    onChange("");
  }

  function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const file = inputRef.current?.files?.[0];
    if (!file || !departmentId) return;

    startUpload(async () => {
      const result = await uploadFileAction({ file, departmentId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      // The freshly uploaded file becomes immediately selectable — auto-select it.
      handleSelect(result.data.file);
      runSearch(query);
    });
  }

  return (
    <div className="space-y-2">
      {current ? (
        <div className="border-input flex items-center gap-3 rounded-md border p-2">
          <div className="bg-muted size-12 shrink-0 overflow-hidden rounded">
            <Thumbnail file={current} />
          </div>
          <p
            className="min-w-0 flex-1 truncate text-sm"
            title={current.originalName}
          >
            {current.originalName}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={handleClear}
            aria-label="Clear selection"
          >
            <X />
          </Button>
        </div>
      ) : null}

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !departmentId}
          onClick={() => handleOpenChange(true)}
        >
          <UploadCloud />
          {current ? "Change file" : "Choose file"}
        </Button>
        {!departmentId ? (
          <p className="text-muted-foreground text-xs">
            Choose a template first.
          </p>
        ) : null}

        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Select a {kind.toLowerCase()} file</SheetTitle>
            <SheetDescription>
              Browse this department&apos;s gallery, or upload a new file.
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <form onSubmit={handleUpload} className="space-y-2">
              <Label htmlFor={`${formId}-upload`}>Upload new</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  id={`${formId}-upload`}
                  type="file"
                  accept={acceptFor(kind)}
                  disabled={isUploading}
                  className="border-input file:text-foreground min-w-0 flex-1 rounded-md border bg-transparent text-sm shadow-xs file:mr-3 file:h-9 file:border-0 file:bg-transparent file:px-3 file:text-sm file:font-medium disabled:pointer-events-none disabled:opacity-50"
                />
                <Button type="submit" size="sm" disabled={isUploading}>
                  {isUploading ? "Uploading…" : "Upload"}
                </Button>
              </div>
            </form>

            <div className="space-y-2">
              <Label htmlFor={`${formId}-search`}>Search</Label>
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  id={`${formId}-search`}
                  value={query}
                  placeholder="Filename…"
                  className="pl-8"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    runSearch(e.target.value);
                  }}
                />
              </div>
            </div>

            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}

            {isSearching && files === null ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Loading…
              </p>
            ) : files && files.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No {kind.toLowerCase()} files found.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {(files ?? []).map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => handleSelect(file)}
                    className={cn(
                      "hover:border-primary focus-visible:ring-ring group overflow-hidden rounded-md border text-left focus-visible:ring-2 focus-visible:outline-hidden",
                      file.id === current?.id
                        ? "border-primary ring-primary ring-1"
                        : "border-input",
                    )}
                  >
                    <div className="bg-muted aspect-square overflow-hidden">
                      <Thumbnail file={file} />
                    </div>
                    <p
                      className="truncate p-1 text-xs"
                      title={file.originalName}
                    >
                      {file.originalName}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
