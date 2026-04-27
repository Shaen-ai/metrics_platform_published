/** Same ids as kitchen HANDLES — fixed handle catalog for module templates. */
export type ModuleHandleId =
  | "bar-steel"
  | "bar-black"
  | "bar-brass"
  | "knob-steel"
  | "knob-black"
  | "recessed";

export interface ModuleHandleDef {
  id: ModuleHandleId;
  name: string;
  price: number;
}

export const MODULE_HANDLES: ModuleHandleDef[] = [
  { id: "bar-steel", name: "Bar — Brushed Nickel", price: 12 },
  { id: "bar-black", name: "Bar — Matte Black", price: 12 },
  { id: "bar-brass", name: "Bar — Brushed Brass", price: 18 },
  { id: "knob-steel", name: "Knob — Satin Chrome", price: 8 },
  { id: "knob-black", name: "Knob — Matte Black", price: 8 },
  { id: "recessed", name: "Recessed (push-open)", price: 22 },
];

export function getModuleHandlePrice(id: string | undefined | null): number {
  if (!id) return 0;
  return MODULE_HANDLES.find((h) => h.id === id)?.price ?? 0;
}
