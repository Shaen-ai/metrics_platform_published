/**
 * Interior design prompt engineering utilities (structured brief + edit interpretation).
 */

export const DESIGN_STYLES = [
  { id: "modern", label: "Modern", keywords: "clean lines, open spaces, neutral palette with bold accents, glass, steel, minimal ornament" },
  { id: "scandinavian", label: "Scandinavian", keywords: "light wood, white walls, hygge warmth, functional furniture, natural textiles, soft curves" },
  { id: "industrial", label: "Industrial", keywords: "exposed brick, metal pipes, raw concrete, Edison bulbs, reclaimed wood, loft aesthetic" },
  { id: "bohemian", label: "Bohemian", keywords: "layered textiles, macramé, warm earth tones, plants, eclectic patterns, rattan, global influence" },
  { id: "mid-century", label: "Mid-Century Modern", keywords: "tapered legs, organic curves, walnut wood, teal and mustard accents, retro optimism" },
  { id: "minimalist", label: "Minimalist", keywords: "monochrome palette, hidden storage, negative space, essential furniture only, Zen simplicity" },
  { id: "traditional", label: "Traditional", keywords: "rich wood tones, crown molding, classic patterns, symmetry, upholstered seating, warm lighting" },
  { id: "coastal", label: "Coastal", keywords: "ocean blues, sandy neutrals, driftwood textures, linen, wicker, airy open layout" },
  { id: "japandi", label: "Japandi", keywords: "Japanese wabi-sabi meets Scandinavian simplicity, natural materials, muted earth tones, craft" },
  { id: "art-deco", label: "Art Deco", keywords: "geometric patterns, gold accents, velvet, lacquer, glamour, bold symmetry, jewel tones" },
  { id: "rustic", label: "Rustic", keywords: "reclaimed wood beams, stone fireplace, cozy textiles, warm amber lighting, cabin aesthetic" },
  { id: "contemporary", label: "Contemporary", keywords: "current trends, mixed materials, statement lighting, neutral base with curated accents" },
] as const;

export type DesignStyleId = (typeof DESIGN_STYLES)[number]["id"];

export const ROOM_TYPES = [
  "living room", "bedroom", "kitchen", "bathroom", "dining room",
  "home office", "children's room", "hallway", "outdoor patio", "studio apartment",
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

export type Confidence = "high" | "medium" | "low";

export interface RoomAnalysisConfidence {
  room_type: Confidence;
  dimensions: Confidence;
  style: Confidence;
  window_count: Confidence;
  door_count: Confidence;
}

export interface RoomFurnitureItem {
  name: string;
  position: string;
  approximate_size: string;
}

export interface RoomAnalysis {
  room_type: string;
  room_shape: string;
  estimated_dimensions: { width: number; depth: number; height: number };
  existing_furniture: RoomFurnitureItem[];
  architectural_features: string[];
  lighting_sources: string[];
  current_style: string;
  color_palette: string[];
  suggestions: string[];
  window_count: number;
  door_count: number;
  window_positions: string[];
  door_positions: string[];
  camera_angle: string;
  ceiling_type: string;
  structural_elements: string[];
  has_staircase: boolean;
  staircase_description: string | null;
  confidence?: RoomAnalysisConfidence;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asFiniteNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function asNonEmptyString(v: unknown, fallback: string): string {
  if (typeof v === "string" && v.trim()) return v;
  return fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function asConfidence(v: unknown): Confidence | undefined {
  if (v === "high" || v === "medium" || v === "low") return v;
  return undefined;
}

function syncOpeningPositions(positions: string[], count: number): string[] {
  const c = Math.max(0, Math.min(20, Math.floor(count)));
  const next = positions.slice(0, c);
  while (next.length < c) next.push("unspecified");
  return next;
}

/** Normalize API / legacy analysis JSON and keep window/door counts aligned with position lists. */
export function normalizeRoomAnalysisOpenings(raw: unknown): RoomAnalysis {
  const o = isRecord(raw) ? raw : {};

  const legacyDims = isRecord(o.estimatedDimensions) ? o.estimatedDimensions : null;
  const dims = isRecord(o.estimated_dimensions) ? o.estimated_dimensions : legacyDims;
  const width = asFiniteNumber(dims?.width, 4);
  const depth = asFiniteNumber(dims?.depth, 4);
  const height = asFiniteNumber(dims?.height, 2.7);

  const furnRaw = Array.isArray(o.existing_furniture)
    ? o.existing_furniture
    : Array.isArray(o.existingFurniture)
      ? o.existingFurniture
      : [];
  const existing_furniture: RoomFurnitureItem[] = furnRaw.map((item) => {
    const fi = isRecord(item) ? item : {};
    return {
      name: asNonEmptyString(fi.name, "item"),
      position: asNonEmptyString(
        fi.position ?? fi.pos,
        "unspecified",
      ),
      approximate_size: asNonEmptyString(
        fi.approximate_size ?? fi.approximateSize,
        "unknown",
      ),
    };
  });

  let window_count = Math.floor(
    asFiniteNumber(o.window_count ?? o.windowCount, 0),
  );
  let door_count = Math.floor(asFiniteNumber(o.door_count ?? o.doorCount, 0));
  window_count = Math.max(0, Math.min(20, window_count));
  door_count = Math.max(0, Math.min(20, door_count));

  const window_positions = syncOpeningPositions(
    asStringArray(o.window_positions ?? o.windowPositions),
    window_count,
  );
  const door_positions = syncOpeningPositions(
    asStringArray(o.door_positions ?? o.doorPositions),
    door_count,
  );

  const confRaw = isRecord(o.confidence) ? o.confidence : null;
  const confidence: RoomAnalysisConfidence | undefined = confRaw
    ? {
        room_type: asConfidence(confRaw.room_type) ?? "medium",
        dimensions: asConfidence(confRaw.dimensions) ?? "medium",
        style: asConfidence(confRaw.style) ?? "medium",
        window_count: asConfidence(confRaw.window_count) ?? "high",
        door_count: asConfidence(confRaw.door_count) ?? "high",
      }
    : undefined;

  return {
    room_type: asNonEmptyString(o.room_type ?? o.roomType, "living room"),
    room_shape: asNonEmptyString(o.room_shape ?? o.roomShape, "unknown"),
    estimated_dimensions: { width, depth, height },
    existing_furniture,
    architectural_features: asStringArray(o.architectural_features ?? o.architecturalFeatures),
    lighting_sources: asStringArray(o.lighting_sources ?? o.lightingSources),
    current_style: asNonEmptyString(o.current_style ?? o.currentStyle, "unknown"),
    color_palette: asStringArray(o.color_palette ?? o.colorPalette),
    suggestions: asStringArray(o.suggestions),
    window_count,
    door_count,
    window_positions,
    door_positions,
    camera_angle: asNonEmptyString(o.camera_angle ?? o.cameraAngle, "unknown"),
    ceiling_type: asNonEmptyString(o.ceiling_type ?? o.ceilingType, "unknown"),
    structural_elements: asStringArray(o.structural_elements ?? o.structuralElements),
    has_staircase: Boolean(o.has_staircase ?? o.hasStaircase),
    staircase_description:
      typeof o.staircase_description === "string"
        ? o.staircase_description
        : typeof o.staircaseDescription === "string"
          ? o.staircaseDescription
          : null,
    confidence,
  };
}

export interface DesignBrief {
  subject: string;
  arrangement: string;
  context: string;
  composition: string;
  style: string;
  fullPrompt: string;
  /** Exactly the catalog SKU ids that appear visibly in the composition — required when catalog surfaced. */
  selectedCatalogIds: string[];
}

function asCatalogIdArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string" && x.trim()) out.push(x.trim());
  }
  return out;
}

export function normalizeParsedDesignBrief(raw: unknown): DesignBrief {
  const o = isRecord(raw) ? raw : {};
  const snake = asCatalogIdArray(o.selected_catalog_ids);
  const camel = asCatalogIdArray(o.selectedCatalogIds);

  const selectedCatalogIds = snake.length ? snake : camel;

  return {
    subject: typeof o.subject === "string" ? o.subject : "",
    arrangement: typeof o.arrangement === "string" ? o.arrangement : "",
    context: typeof o.context === "string" ? o.context : "",
    composition: typeof o.composition === "string" ? o.composition : "",
    style: typeof o.style === "string" ? o.style : "",
    fullPrompt: typeof o.fullPrompt === "string" ? o.fullPrompt : "",
    selectedCatalogIds,
  };
}

export function buildAnalysisSystemPrompt(multiImage = false): string {
  const multiImageInstructions = multiImage
    ? `

You are provided with MULTIPLE PHOTOS of the SAME room taken from different angles.
Cross-reference all images to build one comprehensive analysis:
- Use different angles to improve dimension accuracy (triangulate wall lengths, room depth, ceiling height).
- Identify ALL furniture visible across every photo — do not miss items hidden in one angle but visible in another.
- Merge architectural features, lighting sources, and color observations from all views into unified lists.
- If photos show conflicting details, use the most complete/clear view as the primary reference.`
    : "";

  return `You are an expert interior designer and spatial analyst. Analyze the room photo${multiImage ? "s" : ""} provided and return a structured JSON response.
${multiImageInstructions}
Respond ONLY with valid JSON matching this schema:
{
  "room_type": "string (e.g. living room, bedroom, kitchen)",
  "room_shape": "string (e.g. rectangular, L-shaped, open plan)",
  "estimated_dimensions": { "width": number_meters, "depth": number_meters, "height": number_meters },
  "existing_furniture": [{ "name": "string", "position": "string (e.g. center, left wall)", "approximate_size": "string (e.g. 2m x 0.8m)" }],
  "architectural_features": ["string (e.g. bay window, crown molding, exposed beam)"],
  "lighting_sources": ["string (e.g. large south-facing window, recessed ceiling lights)"],
  "current_style": "string (closest design style)",
  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4"],
  "suggestions": ["string (improvement suggestions)"],
  "window_count": number,
  "door_count": number,
  "window_positions": ["string (e.g. back wall left, right of camera — one per window, in order)"],
  "door_positions": ["string (e.g. left wall near corner — one per door, in order)"],
  "camera_angle": "string (brief description of viewpoint)",
  "ceiling_type": "string (flat, vaulted, beamed, etc.)",
  "structural_elements": ["string (columns, hearth, etc.)"],
  "has_staircase": boolean,
  "staircase_description": "string or null",
  "confidence": {
    "room_type": "high" | "medium" | "low",
    "dimensions": "high" | "medium" | "low",
    "style": "high" | "medium" | "low",
    "window_count": "high" | "medium" | "low",
    "door_count": "high" | "medium" | "low"
  }
}

Be precise with dimension estimates. Count every distinct window and door opening visible${multiImage ? " across all photos" : ""}. Ensure window_positions length matches window_count and door_positions matches door_count. Identify every piece of furniture visible${multiImage ? " across all photos" : ""}.`;
}

export function buildCreativeDirectorPrompt(
  userRequest: string,
  styleId: DesignStyleId,
  roomAnalysis?: RoomAnalysis | null,
  editContext?: string,
  hasReferenceImage?: boolean,
  merchantCatalogDirectorBlock?: string,
): string {
  const style = DESIGN_STYLES.find((s) => s.id === styleId) ?? DESIGN_STYLES[0];

  const roomContext = roomAnalysis
    ? `\nRoom Analysis:\n- Type: ${roomAnalysis.room_type} (${roomAnalysis.room_shape})\n- Dimensions: ${roomAnalysis.estimated_dimensions.width}m x ${roomAnalysis.estimated_dimensions.depth}m, ${roomAnalysis.estimated_dimensions.height}m ceiling\n- Windows: ${roomAnalysis.window_count} (${roomAnalysis.window_positions.join("; ") || "positions unspecified"})\n- Doors: ${roomAnalysis.door_count} (${roomAnalysis.door_positions.join("; ") || "positions unspecified"})\n- Existing furniture: ${roomAnalysis.existing_furniture.map((f) => f.name).join(", ")}\n- Architectural features: ${roomAnalysis.architectural_features.join(", ")}\n- Lighting: ${roomAnalysis.lighting_sources.join(", ")}\n- Current style: ${roomAnalysis.current_style}\n- Color palette: ${roomAnalysis.color_palette.join(", ")}${roomAnalysis.has_staircase ? `\n- Staircase: ${roomAnalysis.staircase_description || "present"}` : ""}`
    : "";

  const editInfo = editContext ? `\n\nPrevious design context (user wants to edit):\n${editContext}` : "";

  const catalogSection = merchantCatalogDirectorBlock?.trim()
    ? `\n\n${merchantCatalogDirectorBlock.trim()}`
    : "";

  const referenceImageWarning = hasReferenceImage
    ? `
CRITICAL — REFERENCE PHOTO MODE:
A reference photo of the real room will be sent alongside your prompt to the image generator. The image generator will use the photo as the structural base. Therefore EVERY output field (subject, arrangement, context, composition, style, AND fullPrompt) must ONLY describe DESIGN CHANGES — never describe the room's architecture. Specifically:
- Do NOT describe room shape, number of walls, corners, or room dimensions in ANY field.
- Do NOT describe window positions, sizes, shapes, or count in ANY field. Just describe WINDOW TREATMENTS (curtains, drapes) without specifying window architecture.
- Do NOT describe door positions or count in ANY field.
- Do NOT describe ceiling type or height in ANY field.
- Do NOT describe camera angle or viewpoint in ANY field — the reference photo determines this.
- Do NOT describe what is visible outside the windows (no city views, no landscapes, no skylines).
- Do NOT use phrases like "floor-to-ceiling windows", "large corner windows", "panoramic view", "expansive windows", "wall of windows", "double-height ceiling" — these phrases cause the image generator to ALTER the room structure.
- In "subject": list ONLY decorative/finish elements — wall paint/wallpaper, flooring/rugs, curtain fabrics, furniture pieces, lighting fixtures, textiles, art, plants. ZERO architectural descriptions.
- In "arrangement": describe ONLY furniture placement, spatial flow, and layering. Do NOT mention room shape, dimensions, or number of windows/doors.
- In "context": describe ONLY light mood, atmosphere, time of day. Do NOT mention room dimensions or architectural features.
- In "composition": say ONLY "Reference photo determines angle" and describe visual focal point. Do NOT specify any camera angle or lens.
- In "style": describe ONLY mood, color palette, material harmony. Do NOT mention architectural features.
- ONLY describe: wall colors/finishes, flooring/rugs, window treatments (curtains/drapes fabric only), furniture, lighting fixtures, textiles, decor, art, plants, and color palette.
- Start the fullPrompt with: "Redesign this room's interior:"`
    : "";

  const furnitureOnlyBlock = hasReferenceImage
    ? `
THIS IS A FURNITURE-ONLY REPLACEMENT TASK:
The user has uploaded a photo of their real room. We sell FURNITURE products. The room itself (walls, floor, ceiling, curtains, lighting fixtures) must stay EXACTLY as they are in the photo. Your job is ONLY to select and arrange FURNITURE from the merchant catalog to place in the room.

DO NOT describe or suggest changes to ANY of these (they stay as-is from the photo):
- Wall color, paint, wallpaper, wall texture
- Floor material, tiles, hardwood, carpet
- Ceiling finish, ceiling lights, ceiling fans
- Curtains, drapes, blinds, window treatments
- Doors, baseboards, crown molding, trim
- Built-in cabinetry or shelving
- Any architectural feature

ONLY describe these (furniture to place in the room):
- Seating: sofas, armchairs, dining chairs, stools, benches
- Tables: coffee tables, dining tables, side tables, desks, console tables
- Storage: freestanding bookshelves, cabinets, TV stands, dressers, wardrobes
- Beds and bedside tables
- Small decor that sits ON furniture: throw pillows, table lamps, small vases`
    : "";

  return `You are a Creative Director for a FURNITURE STORE. ${hasReferenceImage ? "The user has uploaded a photo of their room. Your job is to select the best furniture products from the merchant catalog and describe how to arrange them in the room. The room itself stays exactly as-is — you are ONLY choosing and placing furniture." : "You design beautiful room interiors with furniture as the primary focus."}
${furnitureOnlyBlock}
${referenceImageWarning}

${hasReferenceImage ? "" : `WHAT "INTERIOR DESIGN" MEANS (address ALL in every prompt):
- WALL DESIGN: paint color, wallpaper, accent walls, textured finishes, wainscoting, wall paneling
- FLOORING: area rugs, runners, layered rugs on hardwood, floor patterns
- WINDOW TREATMENTS: curtains, drapes, blinds, sheers — fabric type, color, hang style
- LIGHTING DESIGN: pendant lights, floor lamps, table lamps, wall sconces, LED strips, candles, natural light interaction
- TEXTILES & SOFT FURNISHINGS: throw pillows, blankets, cushions, upholstery fabrics, textures
- DECOR & ACCESSORIES: vases, books, candles, trays, sculptures, clocks, mirrors
- WALL ART: framed prints, canvas art, photo walls, floating shelves with objects
- PLANTS & GREENERY: potted plants, hanging plants, dried flowers, plant stands
- COLOR PALETTE: a cohesive 3-5 color scheme tying everything together
- FURNITURE: sofas, tables, chairs, storage — with specific materials and finishes
`}
THE 5-COMPONENT FORMULA:
1. SUBJECT — ${hasReferenceImage ? "List ONLY the furniture pieces to place (with materials, colors, finishes). NO wall/floor/ceiling/curtain descriptions" : "Wall treatments, floor treatments, window treatments, key furniture, decor objects, plants, art"}
2. ARRANGEMENT — ${hasReferenceImage ? "Where each furniture piece goes in the room, spatial flow, groupings" : "Layout, spatial flow, focal point, layering of textures and colors across the room"}
3. CONTEXT — ${hasReferenceImage ? "Light mood and atmosphere only — the room's existing environment stays as-is" : "Natural light atmosphere, time of day mood, room dimensions, architectural features"}
4. COMPOSITION — ${hasReferenceImage ? "Reference photo determines the angle. Describe the visual focal point" : "Camera angle (eye-level, slightly elevated, corner view), depth of field, what draws the eye"}
5. STYLE — "${style.label}" style: ${style.keywords}. ${hasReferenceImage ? "Apply this style ONLY to furniture selection, not to the room's existing finishes" : "Overall mood, color temperature, material harmony"}.

STRUCTURAL INTEGRITY (absolute — apply to every prompt):
- NEVER add, remove, or modify walls, partitions, built-in structures, alcoves, or columns.
- ALL furniture must be freestanding and removable — no flush-to-corner items that imply structure.
- Do NOT invent or add architectural features not present in the original room.${hasReferenceImage ? `
- Do NOT change wall colors, wallpaper, floor material, ceiling finish, or window treatments — these are part of the existing room.` : `
- You CAN and SHOULD change: wall colors, wallpaper, curtains, rugs, lighting fixtures, art, decor — these are design, not structure.`}

PROMPT CONSTRUCTION RULES:
- Output MUST be a single, detailed paragraph (the image prompt)${hasReferenceImage ? `
- Focus ENTIRELY on furniture: what pieces, their materials/colors/finishes, and where they go
- Do NOT mention wall color, floor material, ceiling, or curtains — these stay as-is from the photo
- Do NOT specify camera angle or lens — the reference photo determines this` : `
- ALWAYS describe wall treatment first (color, wallpaper, or texture)
- ALWAYS describe the ceiling finish and full floor treatment
- ALWAYS include window treatments, lighting sources, textiles, wall art, plants
- Mention camera: "photographed at eye level with a 24mm lens" or similar`}
- Include specific materials for furniture (oak, walnut, marble, linen, brass, velvet, bouclé, leather)
- Add realism cues: "interior photography, 8K, architectural digest quality"
- Never mention third-party designer brand names unrelated to merchant catalog titles
- For every catalog-bound furniture piece, weave the PRODUCT NAME verbatim (from AVAILABLE list) somewhere in arrangement + fullPrompt narrative (no bracket ID codes, omit prices/currency symbols)
- Keep the user's original intent central
- Match the exact style the user requests — do not blend styles unless asked
${roomContext}${editInfo}${catalogSection}

User request: "${userRequest}"
Target style: ${style.label}

Respond ONLY with valid JSON:
{
  "subject": "string (${hasReferenceImage ? "ONLY furniture pieces to place — their type, material, color, finish. NO walls, floors, ceilings, curtains" : "wall finishes, flooring, window treatments, furniture, decor, plants, art — design elements only, NOT architecture"})",
  "arrangement": "string (${hasReferenceImage ? "furniture placement positions and spatial flow ONLY — do NOT mention room shape, window count, or dimensions" : "layout, spatial flow, color layering, focal point"})",
  "context": "string (${hasReferenceImage ? "light atmosphere and mood ONLY — do NOT mention room dimensions, wall colors, or architecture" : "room dimensions, light sources, time of day, atmosphere"})",
  "composition": "string (${hasReferenceImage ? "ONLY say: reference photo determines angle. Then describe focal point and visual flow" : "camera angle, depth of field, what draws the eye"})",
  "style": "string (${hasReferenceImage ? "furniture style direction, material palette, color harmony for furniture choices ONLY" : "overall mood, color palette of 3-5 colors, material harmony"})",
  "selected_catalog_ids": ["string (SKU ids ONLY from AVAILABLE PRODUCT CATALOG list — honor merchant coverage constraints exactly)"],
  "fullPrompt": "string (${hasReferenceImage ? "starts with 'Replace the furniture in this room:' — describe ONLY what furniture to place and where. NEVER describe walls, floor, ceiling, curtains, or architecture" : "complete merged prompt — must describe walls, curtains, rugs, lighting, textiles, art, plants AND furniture"})"
}`;
}

export function buildEditInterpretationPrompt(
  editMessage: string,
  previousPrompt: string,
  chatHistory: Array<{ role: string; content: string }>,
  merchantInteriorCatalogPreserveBlock?: string,
): string {
  const historyText = chatHistory
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const catalogRetain = merchantInteriorCatalogPreserveBlock?.trim()
    ? `\n\nMERCHANT CATALOG ALIGNMENT (${merchantInteriorCatalogPreserveBlock.trim()}) Keep existing catalog-bound furniture SKU names unless edit explicitly swaps them — if swaps needed, cite replacement ids from surfaced list ONLY.`
    : "";

  return `You are a Creative Director for interior design. The user wants to modify an existing design.

Previous image prompt:
"${previousPrompt}"

Recent conversation:
${historyText}

User's edit request: "${editMessage}"${catalogRetain}

STRUCTURAL INTEGRITY (absolute — never violate):
- NEVER add, remove, or modify walls, partitions, built-in structures, alcoves, or columns.
- ALL furniture must be freestanding and removable.
- Preserve the room's exact shape, dimensions, windows, and doors from the previous design.
- Do NOT add built-in shelving or cabinetry unless the user explicitly asks for it.

Create an updated image generation prompt that applies the user's requested changes while keeping everything else from the previous design intact. Maintain the same camera angle, room structure, and architectural features unless explicitly asked to change.

Respond ONLY with valid JSON:
{
  "interpretation": "string (what the user wants changed)",
  "fullPrompt": "string (complete updated prompt for image generation)",
  "message": "string (friendly response to the user explaining what you changed)"
}`;
}

export function buildExtractPlanPrompt(catalogSummary?: string): string {
  const catalogInstructions = catalogSummary
    ? `

PRODUCT CATALOG MATCHING:
The merchant has these real products. For each furniture item you identify in the image, check if it closely matches a catalog product (similar type, category, and approximate dimensions). If it does, set "catalog_id" to that product's ID. If no good match exists, leave "catalog_id" as null.

${catalogSummary}`
    : "";

  return `You are a furniture identification and spatial analysis AI. Analyze this interior design image and extract every piece of furniture with approximate real-world dimensions.
${catalogInstructions}
Respond ONLY with valid JSON:
{
  "room": { "width": number_meters, "depth": number_meters, "height": number_meters },
  "items": [
    {
      "id": "string (unique, e.g. sofa-1)",
      "name": "string (e.g. Three-seat sofa)",
      "category": "string (e.g. Seating, Tables, Storage, Lighting, Decor)",
      "width_m": number,
      "depth_m": number,
      "height_m": number,
      "color": "#hexcolor",
      "position": { "x": number_meters_from_left, "z": number_meters_from_back }${catalogSummary ? ',\n      "catalog_id": "string or null (product ID from the catalog above, if a close match exists)"' : ""}
    }
  ],
  "estimated_total_price_usd": number
}

Be realistic with dimensions. A standard sofa is ~2.2m wide, a coffee table ~1.2m, a dining table ~1.8m.`;
}
