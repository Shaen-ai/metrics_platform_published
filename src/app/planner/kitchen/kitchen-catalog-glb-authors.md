# Kitchen catalog GLB — authoring guide

Models dropped from the admin **Module** catalog (or Module Planner) into **Kitchen Designer** are scaled to the module’s width × height × depth, then materials are applied from the kitchen’s **Frames** and **Doors & fronts** settings—unless the module record supplies per-module `cabinetMaterialId` / `doorMaterialId`.

The runtime uses **mesh/object names** (case-insensitive substrings) and **material properties** to decide what to recolor and what to leave alone. See `applyKitchenCatalogGlbMaterials` and related helpers in [`KitchenCabinets3D.tsx`](./KitchenCabinets3D.tsx).

## Meshes that keep their original materials (no override)

Any mesh whose name matches (regex):

`glass|mirror|chrome|handle|knob|hardware|hinge|rail|runner|wheel|sink|faucet|tap|metal`

…or that uses a **highly transparent** or **transmissive** standard/physical material (`opacity < 0.95` or `transmission > 0.5`) is **skipped** for carcass/door replacement. Use this for **glazing**, mirrors, metal handles baked into the mesh, and sinks/taps.

## Meshes that receive the kitchen door material

Names containing any of:

`door|drawer|front|facade|face|fasad|panel`

…get the **door / front** texture (global or per-module).

## Meshes that receive the kitchen carcass (body) material

Names containing any of:

`carcass|carcase|frame|body|cabinet|case|side|shelf|shelves|bottom|top|back`

…get the **cabinet body** texture.

## Unnamed or ambiguous meshes

If a mesh matches neither list, the code **splits triangles** by whether their center lies on the front third of the bounding box (depth-wise). If splitting fails, the whole mesh gets the **carcass** material.

**Tip:** Prefer **explicit names** (`Door_left`, `Carcass_shell`, `Glass_panel`) so behavior is stable after export.

## Procedural fallback (no GLB)

If no finished `modelUrl` is available, Kitchen Designer shows a **built-in box**. For “glass door” presets from the module list, use **`doorPreset: glassInset`** (see `KitchenModule` types) to get a framed glass insert on the procedural front—without a GLB.

## Export checklist

1. **Z-forward** door faces: after scaling, the planner assumes the cabinet’s **front faces +Z** (see fit/apply logic in code).
2. Separate materials for **opaque MDF / laminate** vs **glass** (named or transmission-based) so glass is not overwritten by wood textures.
3. Keep **hardware** that should stay metallic in the skip list by naming or material.
