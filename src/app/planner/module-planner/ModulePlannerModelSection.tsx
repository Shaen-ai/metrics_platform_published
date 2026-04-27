"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  Box,
  CheckCircle,
  Download,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";

const ModelPreview = dynamic(() => import("@/components/ModelPreview"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[var(--muted-foreground)]">
      <Loader2 className="w-8 h-8 animate-spin" />
      <span className="text-xs">Loading preview…</span>
    </div>
  ),
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type MeshyUiStatus = "idle" | "uploading" | "queued" | "processing" | "done" | "failed";

interface ModulePlannerModelSectionProps {
  onPendingGlbChange: (buffer: ArrayBuffer | null) => void;
  onBusyChange: (busy: boolean) => void;
}

export default function ModulePlannerModelSection({
  onPendingGlbChange,
  onBusyChange,
}: ModulePlannerModelSectionProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [texturePrompt, setTexturePrompt] = useState("");
  const [meshyStatus, setMeshyStatus] = useState<MeshyUiStatus>("idle");
  const [meshyError, setMeshyError] = useState<string | undefined>();
  const [jobId, setJobId] = useState<string | null>(null);

  const glbRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingBufferRef = useRef<ArrayBuffer | null>(null);

  const commitGlbBuffer = useCallback(
    (buf: ArrayBuffer | null) => {
      pendingBufferRef.current = buf;
      onPendingGlbChange(buf);
      if (!buf) {
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        return;
      }
      const blob = new Blob([buf], { type: "model/gltf-binary" });
      const u = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return u;
      });
    },
    [onPendingGlbChange],
  );

  useEffect(() => {
    return () => {
      imagePreviews.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [imagePreviews]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const clearAiImages = useCallback(() => {
    imagePreviews.forEach((u) => URL.revokeObjectURL(u));
    setPendingImages([]);
    setImagePreviews([]);
    setTexturePrompt("");
    if (imgRef.current) imgRef.current.value = "";
  }, [imagePreviews]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const busy =
    meshyStatus === "uploading" ||
    meshyStatus === "queued" ||
    meshyStatus === "processing";

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (!jobId || (meshyStatus !== "queued" && meshyStatus !== "processing")) {
      stopPolling();
      return;
    }

    const tick = async () => {
      try {
        const res = await fetch(`/api/meshy/status/${jobId}`);
        const data = await res.json();
        if (!res.ok) {
          setMeshyStatus("failed");
          setMeshyError(data.error || "Status check failed");
          stopPolling();
          return;
        }

        if (data.status === "done" && data.glbUrl) {
          const r = await fetch("/api/meshy/fetch-glb", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: data.glbUrl }),
          });
          if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            setMeshyStatus("failed");
            setMeshyError(err.error || "Failed to download GLB");
            stopPolling();
            return;
          }
          const buf = await r.arrayBuffer();
          commitGlbBuffer(buf);
          setMeshyStatus("done");
          stopPolling();
          return;
        }

        if (data.status === "failed") {
          setMeshyStatus("failed");
          setMeshyError(data.error || "3D generation failed");
          stopPolling();
          return;
        }

        if (data.status === "queued" || data.status === "processing") {
          setMeshyStatus(data.status);
        }
      } catch {
        /* keep polling */
      }
    };

    pollingRef.current = setInterval(tick, 5000);
    void tick();

    return stopPolling;
  }, [jobId, meshyStatus, commitGlbBuffer, stopPolling]);

  const handleGlbFile = async (file: File) => {
    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      setMeshyError("GLB must be under 50 MB");
      setMeshyStatus("failed");
      return;
    }
    setMeshyError(undefined);
    clearAiImages();
    setJobId(null);
    setMeshyStatus("idle");
    const buf = await file.arrayBuffer();
    commitGlbBuffer(buf);
  };

  const handleImageSelect = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/")).slice(0, 4);
    if (imgs.length === 0) return;
    imagePreviews.forEach((u) => URL.revokeObjectURL(u));
    setPendingImages(imgs);
    setImagePreviews(imgs.map((f) => URL.createObjectURL(f)));
    commitGlbBuffer(null);
    setJobId(null);
    setMeshyStatus("idle");
    setMeshyError(undefined);
    setTexturePrompt("");
    if (imgRef.current) imgRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const glbs = files.filter((f) => f.name.endsWith(".glb") || f.name.endsWith(".gltf"));
    const imgs = files.filter((f) => f.type.startsWith("image/")).slice(0, 4);
    if (glbs.length > 0) {
      void handleGlbFile(glbs[0]);
    } else if (imgs.length > 0) {
      handleImageSelect(imgs);
    }
  };

  const handleGenerate = async () => {
    if (pendingImages.length === 0) return;
    setMeshyError(undefined);
    setMeshyStatus("uploading");

    try {
      const file = pendingImages[0];
      const base64 = await fileToBase64(file);
      const mimeType =
        file.type === "image/png"
          ? "image/png"
          : file.type === "image/webp"
            ? "image/webp"
            : "image/jpeg";

      const res = await fetch("/api/meshy/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          texturePrompt: texturePrompt.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.jobId) {
        throw new Error(data.error || "Failed to start 3D generation");
      }

      setJobId(data.jobId);
      setMeshyStatus("queued");
      clearAiImages();
    } catch (err) {
      setMeshyStatus("failed");
      setMeshyError(err instanceof Error ? err.message : "Generation failed");
    }
  };

  const handleClearModel = () => {
    stopPolling();
    setJobId(null);
    setMeshyStatus("idle");
    setMeshyError(undefined);
    commitGlbBuffer(null);
    clearAiImages();
    if (glbRef.current) glbRef.current.value = "";
  };

  const handleDownload = () => {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = "module.glb";
    a.click();
  };

  const isProcessing = busy;

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]">
        <Box className="w-4 h-4" aria-hidden />
        3D model (optional)
      </label>
      <p className="text-xs text-[var(--muted-foreground)]">
        Upload a .glb / .gltf file, or use images to generate a model in the background (Meshy). Models are stored on this device only.
      </p>

      {isProcessing && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-200 bg-blue-50">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-800">
              {meshyStatus === "uploading"
                ? "Uploading image…"
                : meshyStatus === "queued"
                  ? "Queued for 3D generation"
                  : "Generating 3D model…"}
            </p>
            <p className="text-xs text-blue-600 mt-0.5">This may take a few minutes</p>
          </div>
        </div>
      )}

      {meshyStatus === "failed" && meshyError && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-red-200 bg-red-50">
          <div className="flex items-center gap-3 min-w-0">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-800 break-words">{meshyError}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setMeshyStatus("idle");
              setMeshyError(undefined);
            }}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-red-800 border border-red-300 rounded-lg px-2 py-1 hover:bg-red-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Dismiss
          </button>
        </div>
      )}

      {previewUrl && meshyStatus !== "failed" && (
        <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--muted)]">
          <div className="h-52 w-full">
            <ModelPreview modelUrl={previewUrl} className="w-full h-full" />
          </div>
          <div className="px-3 py-2 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-800">
              <CheckCircle className="w-4 h-4 shrink-0" />
              3D model ready
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                Download GLB
              </button>
              <button
                type="button"
                onClick={handleClearModel}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted-foreground)] hover:underline"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {!isProcessing && !previewUrl && (
        <div
          className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
            dragOver
              ? "border-[var(--primary)] bg-[var(--primary)]/5"
              : "border-[var(--border)] hover:border-[var(--primary)]/40"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {imagePreviews.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {imagePreviews.map((src, i) => (
                  <img key={i} src={src} alt="" className="w-full h-16 object-cover rounded-md border border-[var(--border)]" />
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                  Describe the object (optional)
                </label>
                <textarea
                  value={texturePrompt}
                  onChange={(e) => setTexturePrompt(e.target.value)}
                  placeholder="e.g. matte white cabinet, smooth panels"
                  rows={2}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-[var(--border)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    clearAiImages();
                  }}
                  className="flex-1 inline-flex justify-center items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--muted)]"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  className="flex-1 inline-flex justify-center items-center gap-1 rounded-lg bg-[var(--primary)] text-white px-3 py-2 text-sm font-medium hover:opacity-90"
                >
                  <Box className="w-4 h-4" />
                  Generate 3D
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-center py-2 mb-3">
                <Box className="w-8 h-8 mx-auto text-[var(--muted-foreground)] mb-1" />
                <p className="text-xs text-[var(--muted-foreground)]">
                  Drop a GLB here or use the buttons below
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={glbRef}
                  type="file"
                  accept=".glb,.gltf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleGlbFile(f);
                    if (glbRef.current) glbRef.current.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => glbRef.current?.click()}
                  className="flex-1 min-w-[120px] inline-flex justify-center items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--muted)]"
                >
                  <Upload className="w-4 h-4" />
                  Upload GLB
                </button>
                <input
                  ref={imgRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => handleImageSelect(Array.from(e.target.files ?? []))}
                />
                <button
                  type="button"
                  onClick={() => imgRef.current?.click()}
                  className="flex-1 min-w-[120px] inline-flex justify-center items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--muted)]"
                >
                  <ImageIcon className="w-4 h-4" />
                  AI from image
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
