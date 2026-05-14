"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, ArrowLeft, ArrowRight, Box, X, ZoomIn, ZoomOut } from "lucide-react";
import { useInteriorDesignStore } from "../store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import SendPlannerDesignToAdminDialog from "@/app/planner/components/SendPlannerDesignToAdminDialog";
import { compressForPlannerInquiryPreview } from "@/lib/compressImageBase64";

interface ResultGalleryProps {
  onSendTo3D?: () => void;
}

export default function ResultGallery({ onSendTo3D }: ResultGalleryProps) {
  const admin = useResolvedAdmin();
  const {
    generatedImages,
    selectedImageIndex,
    setSelectedImageIndex,
    uploadedImageBase64,
    uploadedImageMimeType,
    designBrief,
    phase,
  } = useInteriorDesignStore();

  const buildInteriorDesignInquiry = useCallback(async () => {
    const st = useInteriorDesignStore.getState();
    const current = st.generatedImages[st.selectedImageIndex];
    if (!current) {
      throw new Error("No generated image selected.");
    }
    const compressed = await compressForPlannerInquiryPreview(current.base64, current.mimeType);
    const brief = st.designBrief;
    const analysis = st.clarifiedAnalysis ?? st.roomAnalysis;

    const chatTranscript = st.chatMessages.slice(-16).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 4000),
    }));

    return {
      variant: "interior-design",
      plannerDisplayName: "AI Interior Designer",
      sessionId: st.sessionId,
      textPrompt: st.textPrompt.trim(),
      preferredCatalogIdsForAi: [...new Set(st.preferredCatalogIdsForAi ?? [])],
      roomAnalysis: analysis,
      designBrief: brief
        ? {
            subject: brief.subject,
            arrangement: brief.arrangement,
            context: brief.context,
            composition: brief.composition,
            style: brief.style,
            selectedCatalogIds: brief.selectedCatalogIds ?? [],
            fullPrompt: brief.fullPrompt,
          }
        : null,
      renderPromptUsed: st.currentPrompt,
      selectedGeneratedImageId: current.id,
      chatTranscript,
      previewImageBase64: compressed.base64,
      previewImageMimeType: compressed.mimeType,
    };
  }, []);

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const closeLightbox = useCallback(() => {
    setLightboxSrc(null);
    setZoom(1);
  }, []);

  useEffect(() => {
    if (!lightboxSrc) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.25, 5));
      if (e.key === "-") setZoom((z) => Math.max(z - 0.25, 0.5));
      if (e.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxSrc, closeLightbox]);

  if (generatedImages.length === 0) return null;

  const current = generatedImages[selectedImageIndex];
  if (!current) return null;

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = `data:${current.mimeType};base64,${current.base64}`;
    link.download = `interior-design-${current.id}.png`;
    link.click();
  };

  const hasPrev = selectedImageIndex > 0;
  const hasNext = selectedImageIndex < generatedImages.length - 1;

  return (
    <div className="id-result-gallery">
      <div className="id-result-gallery__header">
        <h3>
          Generated Design{generatedImages.length > 1 ? `s (${selectedImageIndex + 1}/${generatedImages.length})` : ""}
        </h3>
        <div className="id-result-gallery__actions">
          {generatedImages.length > 1 && (
            <>
              <button
                className="id-result-gallery__nav"
                onClick={() => setSelectedImageIndex(selectedImageIndex - 1)}
                disabled={!hasPrev}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                className="id-result-gallery__nav"
                onClick={() => setSelectedImageIndex(selectedImageIndex + 1)}
                disabled={!hasNext}
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
          <button className="id-result-gallery__btn" onClick={handleDownload} title="Download image">
            <Download className="h-4 w-4" />
            Download
          </button>
          <SendPlannerDesignToAdminDialog
            adminSlug={admin?.slug}
            plannerType="interior-design"
            plannerLabel="AI Interior Designer"
            buildDesign={buildInteriorDesignInquiry}
            iconTrigger={false}
            className="id-result-gallery__btn"
          />
          {onSendTo3D && (
            <button
              className="id-result-gallery__btn id-result-gallery__btn--primary"
              onClick={onSendTo3D}
              disabled={phase === "extracting"}
              title="Extract furniture and open in 3D Room Planner"
            >
              <Box className="h-4 w-4" />
              Send to 3D Planner
            </button>
          )}
        </div>
      </div>

      <div className="id-result-gallery__viewer">
        {uploadedImageBase64 && (
          <div className="id-result-gallery__compare">
            <div className="id-result-gallery__compare-item">
              <span className="id-result-gallery__compare-label">Before</span>
              <img
                src={`data:${uploadedImageMimeType};base64,${uploadedImageBase64}`}
                alt="Original room"
                className="id-result-gallery__clickable"
                onClick={() => setLightboxSrc(`data:${uploadedImageMimeType};base64,${uploadedImageBase64}`)}
              />
            </div>
            <div className="id-result-gallery__compare-item">
              <span className="id-result-gallery__compare-label">After</span>
              <img
                src={`data:${current.mimeType};base64,${current.base64}`}
                alt="Redesigned room"
                className="id-result-gallery__clickable"
                onClick={() => setLightboxSrc(`data:${current.mimeType};base64,${current.base64}`)}
              />
            </div>
          </div>
        )}

        {!uploadedImageBase64 && (
          <img
            className="id-result-gallery__image id-result-gallery__clickable"
            src={`data:${current.mimeType};base64,${current.base64}`}
            alt="Generated interior design"
            onClick={() => setLightboxSrc(`data:${current.mimeType};base64,${current.base64}`)}
          />
        )}
      </div>

      {designBrief && (
        <details className="id-result-gallery__brief">
          <summary>Design Brief</summary>
          <div className="id-result-gallery__brief-content">
            <p><strong>Subject:</strong> {designBrief.subject}</p>
            <p><strong>Arrangement:</strong> {designBrief.arrangement}</p>
            <p><strong>Context:</strong> {designBrief.context}</p>
            <p><strong>Composition:</strong> {designBrief.composition}</p>
            <p><strong>Style:</strong> {designBrief.style}</p>
            {designBrief.selectedCatalogIds?.length ? (
              <p>
                <strong>Catalog SKU anchors:</strong> {designBrief.selectedCatalogIds.join(", ")}
              </p>
            ) : null}
          </div>
        </details>
      )}

      {generatedImages.length > 1 && (
        <div className="id-result-gallery__thumbs">
          {generatedImages.map((img, i) => (
            <button
              key={img.id}
              className={`id-result-gallery__thumb ${i === selectedImageIndex ? "id-result-gallery__thumb--active" : ""}`}
              onClick={() => setSelectedImageIndex(i)}
            >
              <img src={`data:${img.mimeType};base64,${img.base64}`} alt={`Variation ${i + 1}`} />
            </button>
          ))}
        </div>
      )}

      {lightboxSrc && (
        <div className="id-lightbox" onClick={closeLightbox}>
          <div className="id-lightbox__toolbar" onClick={(e) => e.stopPropagation()}>
            <button
              className="id-lightbox__btn"
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
              title="Zoom out (–)"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            <span className="id-lightbox__zoom-label">{Math.round(zoom * 100)}%</span>
            <button
              className="id-lightbox__btn"
              onClick={() => setZoom((z) => Math.min(z + 0.25, 5))}
              title="Zoom in (+)"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
            <button
              className="id-lightbox__btn"
              onClick={() => setZoom(1)}
              title="Reset zoom (0)"
            >
              Fit
            </button>
            <button className="id-lightbox__btn id-lightbox__btn--close" onClick={closeLightbox} title="Close (Esc)">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="id-lightbox__scroll" onClick={closeLightbox}>
            <img
              src={lightboxSrc}
              alt="Full-size preview"
              className="id-lightbox__image"
              style={{ transform: `scale(${zoom})` }}
              draggable={false}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
