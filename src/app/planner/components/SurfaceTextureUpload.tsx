"use client";

import { useRef, useState, useCallback } from "react";
import Image from "next/image";
import { Upload, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { isSurfaceFileOverLimit, MAX_SURFACE_UPLOAD_LABEL } from "@/lib/uploadLimits";

type Props = {
  adminSlug: string | undefined;
  textureUrl?: string;
  onUploaded: (url: string) => void;
  onRemove: () => void;
};

export function SurfaceTextureUpload({ adminSlug, textureUrl, onUploaded, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!adminSlug) {
      setError("Store not loaded yet.");
      return;
    }
    if (isSurfaceFileOverLimit(file)) {
      setError(`File exceeds ${MAX_SURFACE_UPLOAD_LABEL}.`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const { url } = await api.uploadPlannerSurfaceImage(adminSlug, file);
      onUploaded(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, [adminSlug, onUploaded]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  if (textureUrl) {
    return (
      <div className="relative rounded-md border border-[var(--border)] overflow-hidden">
        <span className="relative block aspect-[4/3] w-full bg-[var(--muted)]">
          <Image src={textureUrl} alt="Uploaded texture" fill sizes="200px" className="object-cover" unoptimized />
        </span>
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="truncate text-[11px] text-[var(--muted-foreground)]">Your texture</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : "Replace"}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rounded px-1 py-0.5 text-[10px] text-red-500 hover:bg-red-500/10 transition"
            >
              <X size={12} />
            </button>
          </div>
        </div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFileChange} />
        {error && <p className="px-2 pb-1.5 text-[10px] text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--border)] px-2 py-2.5 text-[11px] text-[var(--muted-foreground)] transition hover:border-[var(--primary)]/50 hover:text-[var(--foreground)]"
      >
        {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        {uploading ? "Uploading..." : "Upload your texture"}
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFileChange} />
      {error && <p className="mt-1 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}
