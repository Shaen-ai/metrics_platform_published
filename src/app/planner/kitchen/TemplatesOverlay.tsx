"use client";

import { X } from "lucide-react";
import { useKitchenStore } from "./store";
import { KITCHEN_TEMPLATES } from "./data";

export default function KitchenTemplatesOverlay() {
  const showTemplates = useKitchenStore((s) => s.ui.showTemplates);
  const setShowTemplates = useKitchenStore((s) => s.setShowTemplates);
  const applyTemplate = useKitchenStore((s) => s.applyTemplate);

  if (!showTemplates) return null;

  return (
    <div className="templates-overlay">
      <div className="templates-panel">
        <div className="templates-header">
          <h2 className="templates-title">Kitchen Templates</h2>
          <button
            className="templates-close"
            onClick={() => setShowTemplates(false)}
            aria-label="Close templates"
          >
            <X size={20} />
          </button>
        </div>

        <p className="templates-subtitle">
          Choose a starting point — you can customise everything afterwards.
        </p>

        <div className="templates-grid">
          {KITCHEN_TEMPLATES.map((tpl) => {
            const totalWidth = tpl.config.baseModules.reduce((s, m) => s + m.width, 0);
            return (
              <button
                key={tpl.id}
                className="template-card"
                onClick={() => applyTemplate(tpl.config)}
              >
                <div className="template-icon">{tpl.icon}</div>
                <div className="template-info">
                  <span className="template-name">{tpl.name}</span>
                  <span className="template-desc">{tpl.description}</span>
                  <span className="template-meta">
                    {totalWidth} cm · {tpl.config.baseModules.length} base modules
                    {tpl.config.hasWallCabinets
                      ? ` · ${tpl.config.wallModules.length} wall modules`
                      : " · no wall cabinets"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
