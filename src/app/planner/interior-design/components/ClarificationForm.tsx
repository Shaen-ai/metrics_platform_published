"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { ROOM_TYPES, normalizeRoomAnalysisOpenings, type RoomAnalysis, type Confidence } from "@/lib/interiorDesignPrompts";
import { useInteriorDesignStore } from "../store";

function ConfidenceBadge({ level }: { level: Confidence }) {
  if (level === "high") return null;
  return (
    <span
      className={`id-cf__confidence id-cf__confidence--${level}`}
      title={level === "low" ? "AI is uncertain — please verify" : "AI is moderately confident"}
    >
      <AlertCircle className="h-3 w-3" />
      {level === "low" ? "Please verify" : "Check"}
    </span>
  );
}

export default function ClarificationForm() {
  const {
    roomAnalysis,
    clarifiedAnalysis,
    setClarifiedAnalysis,
    phase,
  } = useInteriorDesignStore();

  const [showDetails, setShowDetails] = useState(false);

  const updateWindowCount = useCallback(
    (n: number) => {
      const base = clarifiedAnalysis ?? roomAnalysis;
      if (!base) return;
      const wc = Math.max(0, Math.min(20, parseInt(String(n), 10) || 0));
      setClarifiedAnalysis(normalizeRoomAnalysisOpenings({ ...base, window_count: wc }));
    },
    [clarifiedAnalysis, roomAnalysis, setClarifiedAnalysis],
  );

  const updateDoorCount = useCallback(
    (n: number) => {
      const base = clarifiedAnalysis ?? roomAnalysis;
      if (!base) return;
      const dc = Math.max(0, Math.min(20, parseInt(String(n), 10) || 0));
      setClarifiedAnalysis(normalizeRoomAnalysisOpenings({ ...base, door_count: dc }));
    },
    [clarifiedAnalysis, roomAnalysis, setClarifiedAnalysis],
  );

  const updateField = useCallback(
    <K extends keyof RoomAnalysis>(key: K, value: RoomAnalysis[K]) => {
      const base = clarifiedAnalysis ?? roomAnalysis;
      if (!base) return;
      setClarifiedAnalysis({ ...base, [key]: value });
    },
    [clarifiedAnalysis, roomAnalysis, setClarifiedAnalysis],
  );

  const updateDimension = useCallback(
    (field: "width" | "depth" | "height", value: number) => {
      const base = clarifiedAnalysis ?? roomAnalysis;
      if (!base) return;
      setClarifiedAnalysis({
        ...base,
        estimated_dimensions: { ...base.estimated_dimensions, [field]: value },
      });
    },
    [clarifiedAnalysis, roomAnalysis, setClarifiedAnalysis],
  );

  useEffect(() => {
    if (roomAnalysis && !clarifiedAnalysis) {
      setClarifiedAnalysis({ ...roomAnalysis });
    }
  }, [roomAnalysis, clarifiedAnalysis, setClarifiedAnalysis]);

  const analysis = clarifiedAnalysis ?? roomAnalysis;
  if (!analysis || phase === "analyzing") return null;

  const confidence = analysis.confidence ?? {
    room_type: "medium" as Confidence,
    dimensions: "medium" as Confidence,
    style: "medium" as Confidence,
    window_count: "high" as Confidence,
    door_count: "high" as Confidence,
  };

  const hasLowConfidence = Object.values(confidence).some((v) => v === "low");
  const busy = phase !== "idle" && phase !== "clarifying";

  return (
    <div className="id-cf">
      {/* Detection summary */}
      <div className="id-cf__summary">
        <CheckCircle className="h-4 w-4 text-green-500" />
        <span className="id-cf__summary-text">
          Room analyzed: {analysis.room_type}, {analysis.room_shape}
          {analysis.window_count > 0 && `, ${analysis.window_count} window${analysis.window_count > 1 ? "s" : ""}`}
          {analysis.door_count > 0 && `, ${analysis.door_count} door${analysis.door_count > 1 ? "s" : ""}`}
        </span>
      </div>

      {hasLowConfidence && (
        <p className="id-cf__hint">
          Some detections are uncertain. Please review the highlighted fields.
        </p>
      )}

      {/* Room Type */}
      <div className={`id-cf__field ${confidence.room_type !== "high" ? "id-cf__field--uncertain" : ""}`}>
        <label className="id-cf__label">
          Room Type
          <ConfidenceBadge level={confidence.room_type} />
        </label>
        <select
          className="id-cf__select"
          value={analysis.room_type}
          onChange={(e) => updateField("room_type", e.target.value)}
          disabled={busy}
        >
          {ROOM_TYPES.map((rt) => (
            <option key={rt} value={rt}>{rt}</option>
          ))}
          {!ROOM_TYPES.includes(analysis.room_type as any) && (
            <option value={analysis.room_type}>{analysis.room_type}</option>
          )}
        </select>
      </div>

      {/* Dimensions */}
      <div className={`id-cf__field ${confidence.dimensions !== "high" ? "id-cf__field--uncertain" : ""}`}>
        <label className="id-cf__label">
          Room Dimensions (meters)
          <ConfidenceBadge level={confidence.dimensions} />
        </label>
        <div className="id-cf__dims">
          <label className="id-cf__dim-item">
            <span>W</span>
            <input
              type="number"
              step="0.1"
              min="1"
              max="30"
              className="id-cf__dim-input"
              value={analysis.estimated_dimensions.width}
              onChange={(e) => updateDimension("width", parseFloat(e.target.value) || 0)}
              disabled={busy}
            />
          </label>
          <span className="id-cf__dim-sep">×</span>
          <label className="id-cf__dim-item">
            <span>D</span>
            <input
              type="number"
              step="0.1"
              min="1"
              max="30"
              className="id-cf__dim-input"
              value={analysis.estimated_dimensions.depth}
              onChange={(e) => updateDimension("depth", parseFloat(e.target.value) || 0)}
              disabled={busy}
            />
          </label>
          <span className="id-cf__dim-sep">×</span>
          <label className="id-cf__dim-item">
            <span>H</span>
            <input
              type="number"
              step="0.1"
              min="1.5"
              max="10"
              className="id-cf__dim-input"
              value={analysis.estimated_dimensions.height}
              onChange={(e) => updateDimension("height", parseFloat(e.target.value) || 0)}
              disabled={busy}
            />
          </label>
        </div>
      </div>

      {/* Window / Door counts */}
      <div className="id-cf__row">
        <div className={`id-cf__field id-cf__field--half ${confidence.window_count !== "high" ? "id-cf__field--uncertain" : ""}`}>
          <label className="id-cf__label">
            Windows
            <ConfidenceBadge level={confidence.window_count} />
          </label>
          <input
            type="number"
            min="0"
            max="20"
            className="id-cf__count-input"
            value={analysis.window_count}
            onChange={(e) => updateWindowCount(parseInt(e.target.value) || 0)}
            disabled={busy}
          />
        </div>
        <div className={`id-cf__field id-cf__field--half ${confidence.door_count !== "high" ? "id-cf__field--uncertain" : ""}`}>
          <label className="id-cf__label">
            Doors
            <ConfidenceBadge level={confidence.door_count} />
          </label>
          <input
            type="number"
            min="0"
            max="20"
            className="id-cf__count-input"
            value={analysis.door_count}
            onChange={(e) => updateDoorCount(parseInt(e.target.value) || 0)}
            disabled={busy}
          />
        </div>
      </div>

      {/* Expandable details */}
      <button
        className="id-cf__toggle"
        onClick={() => setShowDetails((v) => !v)}
        type="button"
      >
        {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {showDetails ? "Hide details" : "More details"}
      </button>

      {showDetails && (
        <div className="id-cf__details">
          <div className="id-cf__detail-row">
            <span className="id-cf__detail-label">Camera angle</span>
            <span className="id-cf__detail-value">{analysis.camera_angle}</span>
          </div>
          <div className="id-cf__detail-row">
            <span className="id-cf__detail-label">Ceiling</span>
            <span className="id-cf__detail-value">{analysis.ceiling_type}</span>
          </div>
          <div className="id-cf__detail-row">
            <span className="id-cf__detail-label">Current style</span>
            <span className="id-cf__detail-value">{analysis.current_style}</span>
          </div>
          {analysis.structural_elements.length > 0 && (
            <div className="id-cf__detail-row">
              <span className="id-cf__detail-label">Structure</span>
              <span className="id-cf__detail-value">{analysis.structural_elements.join(", ")}</span>
            </div>
          )}
          {analysis.has_staircase && (
            <div className="id-cf__detail-row">
              <span className="id-cf__detail-label">Staircase</span>
              <span className="id-cf__detail-value">{analysis.staircase_description ?? "Present"}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
