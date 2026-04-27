"use client";

import { createContext, useContext } from "react";
import type { PlannerConfig } from "../planners/config";

const PlannerTypeContext = createContext<PlannerConfig | null>(null);

export function PlannerTypeProvider({
  config,
  children,
}: {
  config: PlannerConfig;
  children: React.ReactNode;
}) {
  return (
    <PlannerTypeContext.Provider value={config}>
      {children}
    </PlannerTypeContext.Provider>
  );
}

export function usePlannerType(): PlannerConfig | null {
  return useContext(PlannerTypeContext);
}
