"use client";

import { X, Plus, Layout, Columns3, Maximize2, Archive } from "lucide-react";
import { useWardrobeStore } from "./store";
import { WARDROBE_TEMPLATES } from "./data";
import type { WardrobeTemplate } from "./data";

const ICON_MAP: Record<string, React.ReactNode> = {
  plus: <Plus size={28} />,
  layout: <Layout size={28} />,
  columns: <Columns3 size={28} />,
  maximize: <Maximize2 size={28} />,
  archive: <Archive size={28} />,
};

function TemplateCard({ template }: { template: WardrobeTemplate }) {
  const applyTemplate = useWardrobeStore((s) => s.applyTemplate);

  const sectionCount = template.config.sections.length;
  const componentCount = template.config.sections.reduce(
    (sum, s) => sum + s.components.length,
    0,
  );

  return (
    <button
      className="template-card"
      onClick={() => applyTemplate(template.config)}
    >
      <div className="template-icon">
        {ICON_MAP[template.icon] ?? <Plus size={28} />}
      </div>
      <div className="template-info">
        <h3 className="template-name">{template.name}</h3>
        <p className="template-desc">{template.description}</p>
        <div className="template-meta">
          <span>{template.config.frame.width} × {template.config.frame.height} cm</span>
          <span>{sectionCount} {sectionCount === 1 ? "section" : "sections"}</span>
          {componentCount > 0 && (
            <span>{componentCount} components</span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function TemplatesOverlay() {
  const showTemplates = useWardrobeStore((s) => s.ui.showTemplates);
  const setShowTemplates = useWardrobeStore((s) => s.setShowTemplates);

  if (!showTemplates) return null;

  return (
    <div className="templates-overlay" onClick={() => setShowTemplates(false)}>
      <div className="templates-modal" onClick={(e) => e.stopPropagation()}>
        <div className="templates-header">
          <div>
            <h2 className="templates-title">Choose a Template</h2>
            <p className="templates-subtitle">
              Start with a preset or create your own from scratch
            </p>
          </div>
          <button
            className="templates-close"
            onClick={() => setShowTemplates(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="templates-grid">
          {WARDROBE_TEMPLATES.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
