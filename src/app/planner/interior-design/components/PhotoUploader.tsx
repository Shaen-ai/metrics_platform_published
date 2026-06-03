"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, X, Image as ImageIcon, Star } from "lucide-react";
import { useInteriorDesignStore } from "../store";
import { compressImageFile } from "@/lib/compressImageBase64";

const MAX_IMAGES = 4;
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/avif,.avif";

export default function PhotoUploader() {
  const {
    uploadedImages,
    addUploadedImage,
    removeUploadedImage,
    setPrimaryImage,
    phase,
  } = useInteriorDesignStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      for (const file of arr) {
        if (useInteriorDesignStore.getState().uploadedImages.length >= MAX_IMAGES) break;
        void compressImageFile(file, { maxDimension: 1200, jpegQuality: 0.75 }).then((result) => {
          if (!result) return;
          if (useInteriorDesignStore.getState().uploadedImages.length >= MAX_IMAGES) return;
          addUploadedImage(result.base64, result.mimeType);
        });
      }
    },
    [addUploadedImage],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const busy = phase !== "idle" && phase !== "clarifying";
  const hasImages = uploadedImages.length > 0;
  const canAddMore = uploadedImages.length < MAX_IMAGES;

  if (hasImages) {
    return (
      <div className="id-photo-uploader id-photo-uploader--multi">
        <div className="id-photo-uploader__grid">
          {uploadedImages.map((img) => (
            <div
              key={img.id}
              className={`id-photo-uploader__thumb-wrap ${img.isPrimary ? "id-photo-uploader__thumb-wrap--primary" : ""}`}
            >
              <img
                src={`data:${img.mimeType};base64,${img.base64}`}
                alt="Room photo"
                className="id-photo-uploader__thumb-img"
                onClick={() => setPrimaryImage(img.id)}
                title={img.isPrimary ? "Primary photo (used for generation)" : "Click to set as primary"}
              />
              {img.isPrimary && (
                <span className="id-photo-uploader__primary-badge" title="Primary — used for image generation">
                  <Star className="h-3 w-3" />
                </span>
              )}
              <button
                className="id-photo-uploader__thumb-remove"
                onClick={() => removeUploadedImage(img.id)}
                disabled={busy}
                title="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {canAddMore && (
            <button
              className="id-photo-uploader__add-more"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              title="Add another angle"
            >
              <Upload className="h-5 w-5" />
              <span>Add</span>
            </button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
          disabled={busy}
        />

        <span className="id-photo-uploader__label">
          {uploadedImages.length} photo{uploadedImages.length !== 1 ? "s" : ""} uploaded
          {uploadedImages.length > 1 ? " — click a photo to set as primary" : ""}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`id-photo-uploader id-photo-uploader--empty ${dragOver ? "id-photo-uploader--drag" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
        disabled={busy}
      />
      <div className="id-photo-uploader__icon">
        {dragOver ? (
          <ImageIcon className="h-10 w-10 text-fuchsia-500" />
        ) : (
          <Upload className="h-10 w-10 text-gray-400" />
        )}
      </div>
      <p className="id-photo-uploader__text">
        {dragOver ? "Drop your photos here" : "Drag & drop room photos, or click to browse"}
      </p>
      <p className="id-photo-uploader__hint">Up to {MAX_IMAGES} photos (JPG, PNG, WebP, AVIF) — optional</p>
    </div>
  );
}
