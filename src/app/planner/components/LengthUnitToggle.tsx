"use client";

import { usePlannerStore } from "../store/usePlannerStore";
import type { LengthUnit } from "../types";

export function LengthUnitToggleButtons({
  lengthUnit,
  onChange,
  className = "",
}: {
  lengthUnit: LengthUnit;
  onChange: (unit: LengthUnit) => void;
  className?: string;
}) {
  const btn = (unit: LengthUnit, label: string, extra = "") => (
    <button
      key={unit}
      type="button"
      onClick={() => onChange(unit)}
      className={`px-3 py-1.5 text-sm font-medium transition-colors ${extra} ${
        lengthUnit === unit
          ? "bg-[#E8772E] text-white"
          : "bg-white text-[#6B7280] hover:bg-[#FEF3E7]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className={`inline-flex rounded-xl border border-[#F0E6D8] overflow-hidden shadow-sm ${className}`}
      role="group"
      aria-label="Length unit: centimeters or inches"
    >
      {btn("cm", "cm")}
      {btn("in", "in", "border-l border-[#F0E6D8]")}
    </div>
  );
}

export default function LengthUnitToggle({ className = "" }: { className?: string }) {
  const lengthUnit = usePlannerStore((s) => s.ui.lengthUnit);
  const setLengthUnit = usePlannerStore((s) => s.setLengthUnit);

  return (
    <LengthUnitToggleButtons lengthUnit={lengthUnit} onChange={setLengthUnit} className={className} />
  );
}
