"use client";

import { useCallback, useEffect, useRef } from "react";
import { Loader2, Sparkles, RotateCcw, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { useInteriorDesignStore } from "./store";
import PhotoUploader from "./components/PhotoUploader";
import ClarificationForm from "./components/ClarificationForm";
import ResultGallery from "./components/ResultGallery";
import DesignChat from "./components/DesignChat";
import { normalizeRoomAnalysisOpenings } from "@/lib/interiorDesignPrompts";
import "./interior-design.css";

const PHASE_LABELS: Record<string, string> = {
  uploading: "Uploading photo...",
  analyzing: "Analyzing your room...",
  clarifying: "Review detected details below...",
  generating: "Constructing design brief & generating image...",
  editing: "Applying your changes...",
  extracting: "Extracting furniture plan...",
};

export default function InteriorDesignLayout() {
  const router = useRouter();
  const admin = useResolvedAdmin();
  const adminSlug = admin?.slug || "demo";
  const analyzingRef = useRef(false);

  const {
    phase,
    error,
    uploadedImages,
    uploadedImageBase64,
    uploadedImageMimeType,
    textPrompt,
    roomAnalysis,
    clarifiedAnalysis,
    generatedImages,
    selectedImageIndex,
    setPhase,
    setError,
    setTextPrompt,
    setRoomAnalysis,
    setClarifiedAnalysis,
    setDesignBrief,
    setGeneratedImages,
    setSessionId,
    setCurrentPrompt,
    resetSession,
    preferredCatalogIdsForAi,
    setPreferredCatalogIdsForAi,
  } = useInteriorDesignStore();

  const busy = phase !== "idle" && phase !== "clarifying";
  const hasResults = generatedImages.length > 0;

  const handleAnalyze = useCallback(async () => {
    if (uploadedImages.length === 0 || analyzingRef.current) return;
    analyzingRef.current = true;

    try {
      setPhase("analyzing");

      const analyzeForm = new FormData();
      for (let i = 0; i < uploadedImages.length; i++) {
        const img = uploadedImages[i]!;
        const blob = await fetch(`data:${img.mimeType};base64,${img.base64}`).then((r) => r.blob());
        analyzeForm.append("roomImages", blob, `room-${i}.jpg`);
      }
      analyzeForm.set("adminSlug", adminSlug);

      const analyzeRes = await fetch("/api/interior-design/analyze", {
        method: "POST",
        body: analyzeForm,
      });
      const analyzeJson = await analyzeRes.json();
      if (analyzeRes.ok && analyzeJson.data) {
        const normalized = normalizeRoomAnalysisOpenings(analyzeJson.data);
        setRoomAnalysis(normalized);
        setClarifiedAnalysis(normalized);
        setPhase("clarifying");
      } else {
        throw new Error(analyzeJson.error || "Analysis failed.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
    } finally {
      analyzingRef.current = false;
    }
  }, [uploadedImages, adminSlug, setPhase, setError, setRoomAnalysis, setClarifiedAnalysis]);

  useEffect(() => {
    if (uploadedImages.length > 0 && !roomAnalysis && phase === "idle" && !analyzingRef.current) {
      handleAnalyze();
    }
  }, [uploadedImages.length, roomAnalysis, phase, handleAnalyze]);

  const handleGenerate = useCallback(async () => {
    if (!textPrompt.trim() || busy) return;

    try {
      const analysis = clarifiedAnalysis ?? roomAnalysis;

      setPhase("generating");

      const genForm = new FormData();
      genForm.set("textPrompt", textPrompt.trim());
      genForm.set("style", "modern");
      genForm.set("adminSlug", adminSlug);

      if (analysis) {
        genForm.set("roomAnalysis", JSON.stringify(analysis));
      }
      if (uploadedImageBase64) {
        const blob = await fetch(`data:${uploadedImageMimeType};base64,${uploadedImageBase64}`)
          .then((r) => r.blob());
        genForm.set("roomImage", blob, "room.jpg");
      }

      const pins = [...new Set(preferredCatalogIdsForAi)].filter(Boolean);
      if (pins.length > 0) {
        genForm.set("preferredCatalogIds", JSON.stringify(pins));
      }

      const genRes = await fetch("/api/interior-design/generate", {
        method: "POST",
        body: genForm,
      });
      const genJson = await genRes.json();

      if (!genRes.ok || genJson.error) {
        throw new Error(genJson.error || "Generation failed.");
      }

      setSessionId(genJson.data.sessionId);
      setDesignBrief(genJson.data.designBrief);
      setGeneratedImages(genJson.data.images);
      setCurrentPrompt(genJson.data.designBrief.fullPrompt);
      setPhase("idle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
    }
  }, [
    textPrompt,
    busy,
    roomAnalysis,
    clarifiedAnalysis,
    uploadedImageBase64,
    uploadedImageMimeType,
    adminSlug,
    preferredCatalogIdsForAi,
    setPhase,
    setError,
    setDesignBrief,
    setGeneratedImages,
    setSessionId,
    setCurrentPrompt,
  ]);

  const handleSendTo3D = useCallback(async () => {
    const current = generatedImages[selectedImageIndex];
    if (!current) return;

    setPhase("extracting");

    try {
      const res = await fetch("/api/interior-design/extract-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: current.base64,
          mimeType: current.mimeType,
          adminSlug,
        }),
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error || "Extraction failed.");
      }

      sessionStorage.setItem("interior-design-plan", JSON.stringify(json.data));
      setPhase("idle");
      router.push("/planners/room?fromInteriorDesign=1");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Extraction failed.";
      setError(msg);
    }
  }, [generatedImages, selectedImageIndex, adminSlug, setPhase, setError, router]);

  const canGenerate = Boolean(textPrompt.trim() && !busy);

  return (
    <div className="id-layout">
      {/* Header */}
      <header className="id-header">
        <div className="id-header__left">
          <Sparkles className="h-5 w-5 text-fuchsia-500" />
          <div>
            <h1 className="id-header__title">AI Interior Designer</h1>
            <p className="id-header__subtitle">
              Upload a room photo. AI restyles furnishings and finishes in place — same room shell — then refine in chat.
            </p>
          </div>
        </div>
        {hasResults && (
          <button className="id-header__reset" onClick={resetSession}>
            <RotateCcw className="h-4 w-4" />
            New Design
          </button>
        )}
      </header>

      <div className="id-body">
        {/* Left Panel: Input controls */}
        <aside className={`id-sidebar ${hasResults ? "id-sidebar--compact" : ""}`}>
          <PhotoUploader />

          {phase === "analyzing" && (
            <div className="id-analyzing-indicator">
              <Loader2 className="h-4 w-4 animate-spin text-fuchsia-500" />
              <span>Analyzing your room...</span>
            </div>
          )}

          <ClarificationForm />

          <div className="id-prompt-field">
            <label className="id-prompt-field__label">Describe your design</label>
            <textarea
              className="id-prompt-field__textarea"
              value={textPrompt}
              onChange={(e) => setTextPrompt(e.target.value)}
              placeholder="Describe the design you want—colors, style, materials, or any specific requirements."
              disabled={busy}
              rows={4}
            />
          </div>

          <div className="id-prompt-field">
            <label className="id-prompt-field__label">Prioritize catalog SKUs (optional)</label>
            <textarea
              className="id-prompt-field__textarea"
              value={preferredCatalogIdsForAi.join(", ")}
              onChange={(e) =>
                setPreferredCatalogIdsForAi(
                  e.target.value
                    .split(/[\s,;\n]+/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              placeholder="Comma-separated product IDs — listed first when AI picks visuals."
              disabled={busy}
              rows={2}
            />
          </div>

          <button
            className="id-generate-btn"
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            {phase === "generating" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {PHASE_LABELS[phase]}
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                {hasResults ? "Regenerate" : "Generate Design"}
              </>
            )}
          </button>

          {error && <div className="id-error">{error}</div>}
        </aside>

        {/* Right Panel: Results + Chat */}
        <main className="id-main">
          {!hasResults && !busy && (
            <div className="id-empty">
              <Sparkles className="h-16 w-16 text-gray-300" />
              <h2>Your design will appear here</h2>
              <p>
                Upload a room photo, review the detected details, describe the design you want below, then click
                Generate.
              </p>
            </div>
          )}

          {busy && !hasResults && phase !== "analyzing" && (
            <div className="id-loading">
              <Loader2 className="h-12 w-12 animate-spin text-fuchsia-500" />
              <h2>{PHASE_LABELS[phase] || "Processing..."}</h2>
              <p>This may take 10–20 seconds while your design brief and preview image are prepared.</p>
            </div>
          )}

          <ResultGallery onSendTo3D={handleSendTo3D} />
        </main>
      </div>

      {hasResults && <DesignChat />}
    </div>
  );
}
