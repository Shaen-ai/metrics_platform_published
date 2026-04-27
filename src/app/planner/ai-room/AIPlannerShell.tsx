"use client";

import type { ReactNode } from "react";
import AIPlannerForm from "./AIPlannerForm";

export default function AIPlannerShell({ children }: { children: ReactNode }) {
  return (
    <div className="planner-layout-ai">
      {children}
      <aside className="planner-ai-form-panel">
        <AIPlannerForm />
      </aside>
    </div>
  );
}
