"use client";

import { createContext, useContext, type ReactNode } from "react";

export type WardrobeLegLayoutValue = {
  /** Physical carcass width for this wall run (cm); bays/doors scale proportionally in 3D + sheets. */
  frameWidthCm: number;
};

const WardrobeLegLayoutContext = createContext<WardrobeLegLayoutValue | null>(null);

export function WardrobeLegLayoutProvider({
  frameWidthCm,
  children,
}: {
  frameWidthCm: number;
  children: ReactNode;
}) {
  return (
    <WardrobeLegLayoutContext.Provider value={{ frameWidthCm }}>
      {children}
    </WardrobeLegLayoutContext.Provider>
  );
}

export function useWardrobeLegLayout(): WardrobeLegLayoutValue | null {
  return useContext(WardrobeLegLayoutContext);
}
