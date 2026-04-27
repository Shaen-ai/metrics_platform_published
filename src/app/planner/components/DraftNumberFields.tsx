"use client";

import { useEffect, useRef, useState } from "react";
import type { LengthUnit } from "../types";
import { displayToMeters, metersToInputValue } from "../utils/units";

export const LENGTH_INPUT_CLASS =
  "w-full px-3 py-2 border border-[#F0E6D8] rounded-xl focus:border-[#E8772E] focus:outline-none focus:ring-1 focus:ring-[#E8772E]";

/** Normalize typed text for parseFloat (comma decimals, trim). */
export function normalizeNumberText(s: string): string {
  return s.replace(/,/g, ".").trim();
}

function isIncompleteNumber(raw: string): boolean {
  return raw === "" || raw === "-" || raw === "." || raw === "-." || raw === "," || raw === "-,";
}

function tryParseLengthMeters(
  text: string,
  lengthUnit: LengthUnit,
  minM: number,
  maxM: number
): number | null {
  const raw = normalizeNumberText(text);
  if (isIncompleteNumber(raw)) return null;
  const v = parseFloat(raw);
  if (Number.isNaN(v)) return null;
  const m = displayToMeters(v, lengthUnit);
  return Math.min(maxM, Math.max(minM, m));
}

function tryParseScalar(text: string, min?: number, max?: number): number | null {
  const raw = normalizeNumberText(text);
  if (isIncompleteNumber(raw)) return null;
  let v = parseFloat(raw);
  if (Number.isNaN(v)) return null;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

type DraftLengthInputProps = {
  meters: number;
  lengthUnit: LengthUnit;
  minM: number;
  maxM: number;
  onCommit: (meters: number) => void;
  /** Fires while typing whenever the field parses to a valid length (clamped). */
  onLiveChange?: (meters: number) => void;
  className?: string;
  title?: string;
};

/**
 * Length in meters shown in cm/in; edits as free text while focused, commits on blur / Enter.
 */
export function DraftLengthInput({
  meters,
  lengthUnit,
  minM,
  maxM,
  onCommit,
  onLiveChange,
  className = LENGTH_INPUT_CLASS,
  title,
}: DraftLengthInputProps) {
  const [text, setText] = useState(() => String(metersToInputValue(meters, lengthUnit)));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setText(String(metersToInputValue(meters, lengthUnit)));
    }
  }, [meters, lengthUnit]);

  const commit = () => {
    const raw = normalizeNumberText(text);
    if (isIncompleteNumber(raw)) {
      setText(String(metersToInputValue(meters, lengthUnit)));
      return;
    }
    const v = parseFloat(raw);
    if (Number.isNaN(v)) {
      setText(String(metersToInputValue(meters, lengthUnit)));
      return;
    }
    const m = displayToMeters(v, lengthUnit);
    const clamped = Math.min(maxM, Math.max(minM, m));
    onCommit(clamped);
    setText(String(metersToInputValue(clamped, lengthUnit)));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      title={title}
      className={className}
      value={text}
      onFocus={() => {
        focusedRef.current = true;
        setText(String(metersToInputValue(meters, lengthUnit)));
      }}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        if (onLiveChange) {
          const m = tryParseLengthMeters(next, lengthUnit, minM, maxM);
          if (m !== null) onLiveChange(m);
        }
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

type DraftScalarInputProps = {
  value: number;
  onCommit: (n: number) => void;
  /** Fires while typing whenever the field parses to a valid number (clamped). */
  onLiveChange?: (n: number) => void;
  min?: number;
  max?: number;
  format?: (n: number) => string;
  className?: string;
  title?: string;
};

/**
 * Single numeric value (already in display units); free text while focused, commit on blur / Enter.
 */
export function DraftScalarInput({
  value,
  onCommit,
  onLiveChange,
  min,
  max,
  format = (n) => {
    if (Number.isInteger(n)) return String(n);
    const r = Math.round(n * 100) / 100;
    return String(r);
  },
  className = LENGTH_INPUT_CLASS,
  title,
}: DraftScalarInputProps) {
  const [text, setText] = useState(() => format(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setText(format(value));
    }
    // Intentionally sync only when committed `value` changes — not when `format` identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = () => {
    const raw = normalizeNumberText(text);
    if (isIncompleteNumber(raw)) {
      setText(format(value));
      return;
    }
    let v = parseFloat(raw);
    if (Number.isNaN(v)) {
      setText(format(value));
      return;
    }
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onCommit(v);
    setText(format(v));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      title={title}
      className={className}
      value={text}
      onFocus={() => {
        focusedRef.current = true;
        setText(format(value));
      }}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        if (onLiveChange) {
          const n = tryParseScalar(next, min, max);
          if (n !== null) onLiveChange(n);
        }
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

type DraftDimInputProps = {
  meters: number;
  lengthUnit: LengthUnit;
  minM?: number;
  maxM?: number;
  onCommitMeters: (m: number) => void;
  className?: string;
  title?: string;
};

/** Top bar / compact dimensions: small min floor, large max. */
export function DraftDimInput({
  meters,
  lengthUnit,
  minM = 0.05,
  maxM = 30,
  onCommitMeters,
  className,
  title,
}: DraftDimInputProps) {
  return (
    <DraftLengthInput
      meters={meters}
      lengthUnit={lengthUnit}
      minM={minM}
      maxM={maxM}
      onCommit={onCommitMeters}
      className={className}
      title={title}
    />
  );
}
