import type {
  Material,
  Module,
  ModuleTemplatePriceBreakdown,
  ModuleTemplateSelection,
} from "@/lib/types";
import { getModuleHandlePrice, MODULE_HANDLES } from "@/lib/moduleHandles";

export const MODULE_TEMPLATE_PRICING_VERSION = 1;

function pu(m: Material | undefined): number {
  return m?.pricePerUnit ?? 0;
}

export function computeModuleTemplatePrice(
  module: Module,
  materials: Material[],
  selection: ModuleTemplateSelection,
): { total: number; breakdown: ModuleTemplatePriceBreakdown } {
  const byId = (id: string | undefined) => materials.find((x) => x.id === id);

  const P0 = module.price;
  const wBody = module.pricingBodyWeight ?? 1;
  const wDoor = module.pricingDoorWeight ?? 1;

  const defCab = module.defaultCabinetMaterialId;
  const defDoor = module.defaultDoorMaterialId;

  const bodyDelta =
    wBody * (pu(byId(selection.cabinetMaterialId)) - pu(byId(defCab)));
  const doorDelta = wDoor * (pu(byId(selection.doorMaterialId)) - pu(byId(defDoor)));

  const defHandle = module.defaultHandleId ?? "";
  const handleDelta =
    getModuleHandlePrice(selection.handleId) - getModuleHandlePrice(defHandle);

  let extrasTotal = 0;
  const opts = module.templateOptions ?? [];
  for (const opt of opts) {
    const on =
      selection.extraOptions[opt.id] ?? opt.defaultSelected ?? false;
    if (on) extrasTotal += opt.priceDelta;
  }

  const raw = P0 + bodyDelta + doorDelta + handleDelta + extrasTotal;
  const total = Math.max(0, Math.round(raw * 100) / 100);

  return {
    total,
    breakdown: {
      basePrice: P0,
      bodyDelta,
      doorDelta,
      handleDelta,
      extrasTotal,
      total,
      pricingVersion: MODULE_TEMPLATE_PRICING_VERSION,
    },
  };
}

/** Default selection from template metadata (for first load). */
export function defaultSelectionFromModule(module: Module): ModuleTemplateSelection {
  const extraOptions: Record<string, boolean> = {};
  for (const opt of module.templateOptions ?? []) {
    extraOptions[opt.id] = opt.defaultSelected ?? false;
  }

  const allowed =
    module.allowedHandleIds && module.allowedHandleIds.length > 0
      ? MODULE_HANDLES.filter((h) => module.allowedHandleIds!.includes(h.id))
      : MODULE_HANDLES;
  const def = module.defaultHandleId;
  const handleId =
    def && allowed.some((h) => h.id === def)
      ? def
      : allowed[0]?.id ?? "bar-steel";

  return {
    cabinetMaterialId: module.defaultCabinetMaterialId ?? "",
    doorMaterialId: module.defaultDoorMaterialId ?? "",
    handleId,
    extraOptions,
  };
}
