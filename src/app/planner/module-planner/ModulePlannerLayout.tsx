"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Blocks, ChefHat, Home, Trash2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { filterMaterialsForPlanner } from "@/lib/plannerMaterials";
import type { Admin, CatalogItem, Material, Module, ModuleTemplateSelection } from "@/lib/types";
import {
  computeModuleTemplatePrice,
  defaultSelectionFromModule,
} from "@/lib/moduleTemplatePricing";
import { MODULE_HANDLES } from "@/lib/moduleHandles";
import "../planner.css";

const defaultConnectionPoints: Module["connectionPoints"] = {
  top: false,
  bottom: false,
  left: false,
  right: false,
  front: false,
  back: false,
};

function materialSwatchBackground(m: Material): string {
  const c = m.colorCode?.trim() || m.color?.trim();
  return c || "#e5e5e5";
}

function MaterialPicker({
  materials,
  value,
  onChange,
  idPrefix,
}: {
  materials: Material[];
  value: string;
  onChange: (id: string) => void;
  idPrefix: string;
}) {
  return (
    <div
      className="grid grid-cols-3 sm:grid-cols-4 gap-2"
      role="group"
      aria-label="Material options"
    >
      <button
        type="button"
        id={`${idPrefix}-none`}
        onClick={() => onChange("")}
        className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border text-center transition-colors ${
          value === ""
            ? "border-[var(--primary)] bg-[var(--primary)]/5 ring-2 ring-[var(--primary)]/20"
            : "border-[var(--border)] bg-white hover:border-[var(--muted-foreground)]/40"
        }`}
      >
        <span
          className="w-9 h-9 rounded-full border border-dashed border-[var(--border)] bg-[var(--muted)] flex items-center justify-center text-xs text-[var(--muted-foreground)]"
          aria-hidden
        >
          —
        </span>
        <span className="text-[10px] font-medium text-[var(--muted-foreground)] leading-tight line-clamp-2">
          None
        </span>
      </button>
      {materials.map((m) => {
        const selected = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            id={`${idPrefix}-${m.id}`}
            onClick={() => onChange(m.id)}
            title={m.name}
            className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border text-center transition-colors ${
              selected
                ? "border-[var(--primary)] bg-[var(--primary)]/5 ring-2 ring-[var(--primary)]/20"
                : "border-[var(--border)] bg-white hover:border-[var(--muted-foreground)]/40"
            }`}
          >
            {m.imageUrl ? (
              <img
                src={m.imageUrl}
                alt={m.name}
                className="w-9 h-9 rounded-full object-cover border border-black/10 shrink-0"
              />
            ) : (
              <span
                className="w-9 h-9 rounded-full border border-black/10 shrink-0"
                style={{ background: materialSwatchBackground(m) }}
                aria-hidden
              />
            )}
            <span className="text-[10px] font-semibold text-[var(--foreground)] leading-tight line-clamp-2 max-w-full">
              {m.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SavedModuleMaterialLine({
  materialId,
  role,
  materials,
}: {
  materialId: string;
  role: "Body" | "Door";
  materials: Material[];
}) {
  const m = materials.find((x) => x.id === materialId);
  const label = m?.name ?? "—";
  return (
    <div className="flex items-center gap-2 min-w-0">
      {m?.imageUrl ? (
        <img
          src={m.imageUrl}
          alt=""
          className="w-6 h-6 rounded-full object-cover border border-[var(--border)] shrink-0"
        />
      ) : m ? (
        <span
          className="w-6 h-6 rounded-full border border-black/10 shrink-0"
          style={{ background: materialSwatchBackground(m) }}
          aria-hidden
        />
      ) : null}
      <span className="min-w-0">
        {role}: <span className="text-[var(--foreground)]">{label}</span>
      </span>
    </div>
  );
}

function buildPlannerModule(input: {
  admin: Admin | null;
  materials: Material[];
  catalogItems: CatalogItem[];
  name: string;
  description: string;
  width: number;
  height: number;
  depth: number;
  unit: string;
  placementType: "floor" | "wall";
  price: number;
  currency: string;
  cabinetMaterialId?: string;
  doorMaterialId?: string;
  id?: string;
}): Module {
  const subModeId =
    input.materials.find((m) => m.subModeId)?.subModeId ??
    input.catalogItems[0]?.subModeId ??
    "";
  const id = input.id ?? uuidv4();
  return {
    id,
    adminId: input.admin?.id ?? "",
    name: input.name.trim(),
    description: input.description.trim() || " ",
    price: input.price,
    currency: input.currency,
    dimensions: {
      width: input.width,
      height: input.height,
      depth: input.depth,
      unit: input.unit,
    },
    connectionPoints: { ...defaultConnectionPoints },
    compatibleWith: [],
    subModeId,
    placementType: input.placementType,
    source: "planner",
    ...(input.cabinetMaterialId ? { cabinetMaterialId: input.cabinetMaterialId } : {}),
    ...(input.doorMaterialId ? { doorMaterialId: input.doorMaterialId } : {}),
  };
}

export default function ModulePlannerLayout() {
  const initializeStore = useStore((s) => s.initializeStore);
  const admin = useResolvedAdmin();
  const rawMaterials = useStore((s) => s.materials);
  const materials = useMemo(
    () => filterMaterialsForPlanner(rawMaterials, admin?.plannerMaterialIds),
    [rawMaterials, admin?.plannerMaterialIds],
  );
  const modulesFromApi = useStore((s) => s.modules);
  const catalogItems = useStore((s) => s.catalogItems);
  const initialized = useStore((s) => s.initialized);
  const plannerCustomModules = useStore((s) => s.plannerCustomModules);
  const addPlannerCustomModule = useStore((s) => s.addPlannerCustomModule);
  const removePlannerCustomModule = useStore((s) => s.removePlannerCustomModule);
  const addModulePlannerToCart = useStore((s) => s.addModulePlannerToCart);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [width, setWidth] = useState(60);
  const [height, setHeight] = useState(80);
  const [depth, setDepth] = useState(60);
  const [unit, setUnit] = useState("cm");
  const [placementType, setPlacementType] = useState<"floor" | "wall">("floor");
  const [price, setPrice] = useState(0);
  const [cabinetMaterialId, setCabinetMaterialId] = useState("");
  const [doorMaterialId, setDoorMaterialId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const configurableTemplates = useMemo(
    () => modulesFromApi.filter((m) => m.isConfigurableTemplate && m.source !== "planner"),
    [modulesFromApi],
  );
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [templateSelection, setTemplateSelection] = useState<ModuleTemplateSelection | null>(null);

  const activeTemplate = useMemo(
    () => configurableTemplates.find((m) => m.id === activeTemplateId) ?? null,
    [configurableTemplates, activeTemplateId],
  );

  useEffect(() => {
    const t = configurableTemplates.find((m) => m.id === activeTemplateId);
    if (t) setTemplateSelection(defaultSelectionFromModule(t));
    else setTemplateSelection(null);
  }, [activeTemplateId, configurableTemplates]);

  const templatePrice = useMemo(() => {
    if (!activeTemplate || !templateSelection) return null;
    return computeModuleTemplatePrice(activeTemplate, materials, templateSelection);
  }, [activeTemplate, materials, templateSelection]);

  const handleChoices = useMemo(() => {
    const ids = activeTemplate?.allowedHandleIds;
    if (!ids?.length) return MODULE_HANDLES;
    const filtered = MODULE_HANDLES.filter((h) => ids.includes(h.id));
    return filtered.length > 0 ? filtered : MODULE_HANDLES;
  }, [activeTemplate]);

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const currency = admin?.currency ?? "USD";

  const materialOptions = useMemo(
    () => materials.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [materials],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Module name is required.");
      return;
    }
    const moduleId = uuidv4();
    const mod = buildPlannerModule({
      admin,
      materials,
      catalogItems,
      name: name.trim(),
      description: description.trim(),
      width: Number(width),
      height: Number(height),
      depth: Number(depth),
      unit,
      placementType,
      price: Math.max(0, Number(price) || 0),
      currency,
      cabinetMaterialId: cabinetMaterialId || undefined,
      doorMaterialId: doorMaterialId || undefined,
      id: moduleId,
    });
    addPlannerCustomModule(mod);
    setName("");
    setDescription("");
    setWidth(60);
    setHeight(80);
    setDepth(60);
    setPlacementType("floor");
    setPrice(0);
    setCabinetMaterialId("");
    setDoorMaterialId("");
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/planners"
              className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors shrink-0"
              aria-label="Back to planners"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-teal-500/15 flex items-center justify-center text-teal-600 shrink-0">
                <Blocks className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold truncate">Module Planner</h1>
                <p className="text-xs text-[var(--muted-foreground)] truncate">
                  Templates from admin or local modules — use in Kitchen Designer
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/planners/kitchen-design"
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
            >
              <ChefHat className="w-4 h-4" />
              Kitchen Designer
            </Link>
            <Link
              href="/"
              className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors"
              aria-label="Home"
            >
              <Home className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 pb-20">
        {!initialized && (
          <p className="text-sm text-[var(--muted-foreground)] mb-6">Loading catalog…</p>
        )}

        {initialized && configurableTemplates.length > 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm mb-10">
            <h2 className="text-base font-semibold mb-1">Module templates</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              Choose a template from your catalog. Adjust materials, handle, and options — price updates from your base
              price and material rates.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Template</label>
              <select
                value={activeTemplateId ?? ""}
                onChange={(e) => setActiveTemplateId(e.target.value || null)}
                className="w-full max-w-md rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              >
                <option value="">— Select —</option>
                {configurableTemplates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {currency} {m.price.toLocaleString()} (base)
                  </option>
                ))}
              </select>
            </div>

            {activeTemplate && templateSelection && (
              <div className="space-y-5 border-t border-[var(--border)] pt-5">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 min-w-0 text-sm space-y-1">
                    <div className="font-medium">{activeTemplate.name}</div>
                    <div className="text-[var(--muted-foreground)]">
                      {activeTemplate.dimensions.width}×{activeTemplate.dimensions.height}×{activeTemplate.dimensions.depth}{" "}
                      {activeTemplate.dimensions.unit} · {activeTemplate.placementType === "floor" ? "Floor" : "Wall"}
                    </div>
                    {templatePrice && (
                      <div className="text-lg font-semibold text-[var(--primary)] pt-2">
                        {currency} {templatePrice.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                </div>

                {materialOptions.length > 0 && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">
                        Frame / carcass material
                      </label>
                      <MaterialPicker
                        materials={materialOptions}
                        value={templateSelection.cabinetMaterialId}
                        onChange={(id) =>
                          setTemplateSelection((s) => (s ? { ...s, cabinetMaterialId: id } : s))
                        }
                        idPrefix="tpl-cabinet"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">
                        Door &amp; drawer front
                      </label>
                      <MaterialPicker
                        materials={materialOptions}
                        value={templateSelection.doorMaterialId}
                        onChange={(id) =>
                          setTemplateSelection((s) => (s ? { ...s, doorMaterialId: id } : s))
                        }
                        idPrefix="tpl-door"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Handle</label>
                  <div className="flex flex-wrap gap-2">
                    {handleChoices.map((h) => {
                      const sel = templateSelection.handleId === h.id;
                      return (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() =>
                            setTemplateSelection((s) => (s ? { ...s, handleId: h.id } : s))
                          }
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                            sel
                              ? "border-[var(--primary)] bg-[var(--primary)]/5 ring-2 ring-[var(--primary)]/20"
                              : "border-[var(--border)] bg-white hover:border-[var(--muted-foreground)]/40"
                          }`}
                        >
                          {h.name}
                          <span className="text-[var(--muted-foreground)] ml-1">
                            (+{currency}
                            {h.price})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(activeTemplate.templateOptions ?? []).length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">
                      Options
                    </label>
                    <ul className="space-y-2">
                      {(activeTemplate.templateOptions ?? []).map((opt) => (
                        <li key={opt.id}>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={templateSelection.extraOptions[opt.id] ?? opt.defaultSelected ?? false}
                              onChange={(e) =>
                                setTemplateSelection((s) =>
                                  s
                                    ? {
                                        ...s,
                                        extraOptions: {
                                          ...s.extraOptions,
                                          [opt.id]: e.target.checked,
                                        },
                                      }
                                    : s,
                                )
                              }
                              className="rounded border-[var(--border)]"
                            />
                            <span>
                              {opt.label}
                              {opt.priceDelta !== 0 && (
                                <span className="text-[var(--muted-foreground)] ml-1">
                                  ({opt.priceDelta > 0 ? "+" : ""}
                                  {currency}{opt.priceDelta})
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!templatePrice}
                  onClick={() => {
                    if (!activeTemplate || !templateSelection || !templatePrice) return;
                    addModulePlannerToCart({
                      name: activeTemplate.name,
                      price: templatePrice.total,
                      module: activeTemplate,
                      selection: templateSelection,
                      breakdown: templatePrice.breakdown,
                    });
                  }}
                  className="inline-flex justify-center rounded-lg bg-[var(--primary)] text-white font-medium px-5 py-2.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:pointer-events-none"
                >
                  Add configured module to cart
                </button>
              </div>
            )}
          </div>
        )}

        {initialized && configurableTemplates.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)] mb-6 rounded-xl border border-dashed border-[var(--border)] p-4">
            No configurable templates yet. Enable &quot;Configurable template&quot; on a module in the admin and set default
            materials and base price.
          </p>
        )}

        <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm mb-10">
          <h2 className="text-base font-semibold mb-1">Create local module (advanced)</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-6">
            Name your module, set size and placement, and pick body or door materials for reference. Saved only on this
            device. Kitchen Designer uses global material pickers unless you change them there.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Base cabinet 60 drawer"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional notes"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-y min-h-[64px]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["Width", width, setWidth],
                  ["Height", height, setHeight],
                  ["Depth", depth, setDepth],
                ] as const
              ).map(([label, val, setVal]) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                    {label}
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={val}
                    onChange={(e) => setVal(Number(e.target.value))}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                  Unit
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  <option value="cm">cm</option>
                  <option value="in">in</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                  Placement
                </label>
                <select
                  value={placementType}
                  onChange={(e) => setPlacementType(e.target.value as "floor" | "wall")}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  <option value="floor">Floor (base run)</option>
                  <option value="wall">Wall</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                Price ({currency})
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full max-w-[200px] rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>

            {materialOptions.length > 0 && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">
                    Frame / carcass material (optional)
                  </label>
                  <MaterialPicker
                    materials={materialOptions}
                    value={cabinetMaterialId}
                    onChange={setCabinetMaterialId}
                    idPrefix="cabinet-mat"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">
                    Door &amp; drawer front (optional)
                  </label>
                  <MaterialPicker
                    materials={materialOptions}
                    value={doorMaterialId}
                    onChange={setDoorMaterialId}
                    idPrefix="door-mat"
                  />
                </div>
              </>
            )}

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <button
              type="submit"
              className="w-full sm:w-auto inline-flex justify-center rounded-lg bg-[var(--primary)] text-white font-medium px-5 py-2.5 text-sm hover:opacity-90 transition-opacity"
            >
              Save module
            </button>
          </form>
        </div>

        <div>
          <h2 className="text-base font-semibold mb-2">Your modules ({plannerCustomModules.length})</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            These appear under <strong>Your modules</strong> in Kitchen Designer — together with catalog modules from
            the admin.
          </p>
          {plannerCustomModules.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-xl p-8 text-center">
              No saved modules yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {plannerCustomModules.map((m) => (
                <li
                  key={m.id}
                  className="flex gap-3 items-start rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{m.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)] mt-1">
                      {m.placementType === "floor" ? "Floor" : "Wall"} · {m.dimensions.width}×{m.dimensions.height}×
                      {m.dimensions.depth} {m.dimensions.unit} · {m.currency} {m.price.toLocaleString()}
                    </div>
                    {(m.cabinetMaterialId || m.doorMaterialId) && (
                      <div className="text-xs text-[var(--muted-foreground)] mt-2 space-y-1">
                        {m.cabinetMaterialId && (
                          <SavedModuleMaterialLine
                            materialId={m.cabinetMaterialId}
                            role="Body"
                            materials={materialOptions}
                          />
                        )}
                        {m.doorMaterialId && (
                          <SavedModuleMaterialLine
                            materialId={m.doorMaterialId}
                            role="Door"
                            materials={materialOptions}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        addModulePlannerToCart({
                          name: m.name,
                          price: Math.max(0, m.price),
                          module: m,
                        })
                      }
                      className="text-xs font-medium px-2 py-1.5 rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity whitespace-nowrap"
                    >
                      Add to cart
                    </button>
                    <button
                      type="button"
                      onClick={() => removePlannerCustomModule(m.id)}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-500/10 transition-colors"
                      aria-label={`Remove ${m.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
