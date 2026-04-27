/**
 * Export nested sheet placements (positions + cut sizes as shown in the sheet viewer).
 */

import type { PackResult, Placement, Sheet } from "./panelPacker";

export type WardrobeSheetLayoutExportFormat =
  | "csv"
  | "xml"
  | "pdf"
  /** HOMAG woodWOP–style line-oriented stock + cut rectangles (subset; validate in woodWOP). */
  | "mpr"
  /** XML interchange with the same geometry as MPR (not native woodWOP MPRX/MPRXE binary). */
  | "mprx"
  /** Biesse CIX-style text (one file per nested sheet; geometry macros; validate in bSolid / BiesseWorks). */
  | "cix";

export type SheetLayoutExportMaterialSlice = {
  materialId: string;
  material: { name: string } | null | undefined;
  sheet: Sheet;
  result: Pick<PackResult, "placements" | "sheets">;
};

export interface SheetLayoutPieceRow {
  materialId: string;
  materialName: string;
  sheetIndex: number;
  sheetWidthCm: number;
  sheetHeightCm: number;
  kerfCm: number;
  panelId: string;
  label: string;
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
  rotated: boolean;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Panel thickness for CAM stock (mm). Wardrobe structural boards use 18 mm unless you override downstream. */
const DEFAULT_PANEL_THICKNESS_MM = 18;

function cmToMm(cm: number): number {
  return Math.round(cm * 1000) / 100;
}

function sheetKey(materialId: string, sheetIndex: number): string {
  return `${materialId}\t${sheetIndex}`;
}

function filenameSafeStem(s: string, maxLen = 48): string {
  const t = s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return t.slice(0, maxLen) || "sheet";
}

/** Skip synthetic strip anchors (not physical cuts). */
function isPhysicalCut(pl: Placement): boolean {
  return !pl.panelId.includes(":strip");
}

export function buildSheetLayoutPieceRows(
  byMaterial: SheetLayoutExportMaterialSlice[],
): SheetLayoutPieceRow[] {
  const rows: SheetLayoutPieceRow[] = [];
  for (const mp of byMaterial) {
    const name = mp.material?.name ?? mp.materialId;
    const { widthCm: sw, heightCm: sh, kerfCm } = mp.sheet;
    const list = [...mp.result.placements].filter(isPhysicalCut).sort((a, b) => {
      if (a.sheetIndex !== b.sheetIndex) return a.sheetIndex - b.sheetIndex;
      if (a.yCm !== b.yCm) return a.yCm - b.yCm;
      return a.xCm - b.xCm;
    });
    for (const pl of list) {
      rows.push({
        materialId: mp.materialId,
        materialName: name,
        sheetIndex: pl.sheetIndex,
        sheetWidthCm: sw,
        sheetHeightCm: sh,
        kerfCm,
        panelId: pl.panelId,
        label: pl.label,
        xCm: round4(pl.xCm),
        yCm: round4(pl.yCm),
        widthCm: round4(pl.widthCm),
        heightCm: round4(pl.heightCm),
        rotated: pl.rotated,
      });
    }
  }
  return rows;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function exportFilenameStem(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function buildCsv(rows: SheetLayoutPieceRow[]): string {
  const header = [
    "material_id",
    "material_name",
    "sheet_index",
    "sheet_width_cm",
    "sheet_height_cm",
    "kerf_cm",
    "panel_id",
    "label",
    "x_cm",
    "y_cm",
    "width_cm",
    "height_cm",
    "rotated_on_sheet",
  ];
  const lines: string[][] = [header];
  for (const r of rows) {
    lines.push([
      r.materialId,
      r.materialName,
      String(r.sheetIndex),
      String(r.sheetWidthCm),
      String(r.sheetHeightCm),
      String(r.kerfCm),
      r.panelId,
      r.label,
      String(r.xCm),
      String(r.yCm),
      String(r.widthCm),
      String(r.heightCm),
      r.rotated ? "true" : "false",
    ]);
  }
  const esc = (cell: string) => {
    if (cell.includes('"') || cell.includes(",") || cell.includes("\n")) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };
  return lines.map((row) => row.map(esc).join(",")).join("\r\n");
}

function buildXml(rows: SheetLayoutPieceRow[], title: string): string {
  const generated = new Date().toISOString();
  const byMat = new Map<string, SheetLayoutPieceRow[]>();
  for (const r of rows) {
    const list = byMat.get(r.materialId) ?? [];
    list.push(r);
    byMat.set(r.materialId, list);
  }

  const materialNodes = [...byMat.entries()]
    .map(([mid, pieces]) => {
      const name = escapeXml(pieces[0]?.materialName ?? mid);
      const pieceNodes = pieces
        .map(
          (p) => `      <Piece panelId="${escapeXml(p.panelId)}" sheetIndex="${p.sheetIndex}">
        <Label>${escapeXml(p.label)}</Label>
        <Position xCm="${p.xCm}" yCm="${p.yCm}" origin="top-left"/>
        <Cut widthCm="${p.widthCm}" heightCm="${p.heightCm}" rotated="${p.rotated}"/>
      </Piece>`,
        )
        .join("\n");
      const sheet = pieces[0];
      const sw = sheet?.sheetWidthCm ?? 0;
      const sh = sheet?.sheetHeightCm ?? 0;
      const k = sheet?.kerfCm ?? 0;
      return `  <Material id="${escapeXml(mid)}" name="${name}">
    <Sheet stockWidthCm="${sw}" stockHeightCm="${sh}" kerfCm="${k}" unit="cm"/>
    <Nest>
${pieceNodes}
    </Nest>
  </Material>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<SheetLayoutExport version="1.0" generator="wardrobe-planner" generated="${escapeXml(generated)}">
  <Title>${escapeXml(title)}</Title>
${materialNodes}
</SheetLayoutExport>
`;
}

function buildPrintableHtml(rows: SheetLayoutPieceRow[], title: string): string {
  const bodyRows = rows
    .map(
      (r) =>
        `<tr><td>${escapeXml(r.materialName)}</td><td>${r.sheetIndex}</td>` +
        `<td>${r.sheetWidthCm}×${r.sheetHeightCm}</td><td>${r.kerfCm}</td>` +
        `<td>${escapeXml(r.panelId)}</td><td>${escapeXml(r.label)}</td>` +
        `<td>${r.xCm}</td><td>${r.yCm}</td><td>${r.widthCm}</td><td>${r.heightCm}</td>` +
        `<td>${r.rotated ? "yes" : ""}</td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; font-size: 12px; }
    h1 { font-size: 1.2rem; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { border: 1px solid #333; padding: 5px 6px; text-align: left; }
    th { background: #eee; }
    @media print { body { padding: 8px; } }
  </style>
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  <p>Origins top-left of each sheet (cm). Sizes are cut dimensions after nesting rotation.</p>
  <table>
    <thead>
      <tr>
        <th>Material</th><th>Sheet #</th><th>Stock W×H</th><th>Kerf</th>
        <th>Panel ID</th><th>Label</th><th>X</th><th>Y</th><th>W</th><th>H</th><th>Rot</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <p style="margin-top:12px;color:#555">Use Print → Save as PDF for a PDF file.</p>
</body>
</html>`;
}

function downloadTextFile(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * HOMAG-oriented text: one @00 block per physical sheet. Coordinates: top-left origin, mm, X right, Y down.
 * This is a pragmatic subset — not a full woodWOP program; open or post-process in woodWOP / ProjectX.
 */
function buildMpr(rows: SheetLayoutPieceRow[], title: string): string {
  const generated = new Date().toISOString();
  const bySheet = new Map<string, SheetLayoutPieceRow[]>();
  for (const r of rows) {
    const k = sheetKey(r.materialId, r.sheetIndex);
    const list = bySheet.get(k) ?? [];
    list.push(r);
    bySheet.set(k, list);
  }
  const keys = [...bySheet.keys()].sort((a, b) => {
    const [ma, sa] = a.split("\t");
    const [mb, sb] = b.split("\t");
    if (ma !== mb) return ma.localeCompare(mb);
    return Number(sa) - Number(sb);
  });

  const blocks: string[] = [
    "; HOMAG woodWOP–oriented nest export (subset)",
    `; ${title}`,
    `; Generated: ${generated}`,
    "; Units: mm. Origin: top-left of panel, X right, Y down.",
    `; Default thickness LPZ=${DEFAULT_PANEL_THICKNESS_MM} mm (adjust if needed).`,
    "",
  ];

  for (const k of keys) {
    const list = bySheet.get(k)!;
    const head = list[0]!;
    const lpx = cmToMm(head.sheetWidthCm);
    const lpy = cmToMm(head.sheetHeightCm);
    blocks.push(
      "@00",
      `KR=${head.materialName} sheet=${head.sheetIndex}`,
      `LPX=${lpx}`,
      `LPY=${lpy}`,
      `LPZ=${DEFAULT_PANEL_THICKNESS_MM}`,
      `; Kerf_cm=${head.kerfCm} (positions are already nested)`,
      "",
    );
    let i = 0;
    for (const p of list) {
      i += 1;
      const xp = cmToMm(p.xCm);
      const yp = cmToMm(p.yCm);
      const l = cmToMm(p.widthCm);
      const b = cmToMm(p.heightCm);
      blocks.push(
        `; Piece ${i}: ${p.label}`,
        `; panelId=${p.panelId}`,
        `XP=${xp}`,
        `YP=${yp}`,
        `L=${l}`,
        `B=${b}`,
        `ROT=${p.rotated ? 90 : 0}`,
        "",
      );
    }
  }
  return blocks.join("\r\n");
}

function buildMprxXml(rows: SheetLayoutPieceRow[], title: string): string {
  const generated = new Date().toISOString();
  const bySheet = new Map<string, SheetLayoutPieceRow[]>();
  for (const r of rows) {
    const k = sheetKey(r.materialId, r.sheetIndex);
    const list = bySheet.get(k) ?? [];
    list.push(r);
    bySheet.set(k, list);
  }
  const keys = [...bySheet.keys()].sort((a, b) => {
    const [ma, sa] = a.split("\t");
    const [mb, sb] = b.split("\t");
    if (ma !== mb) return ma.localeCompare(mb);
    return Number(sa) - Number(sb);
  });

  const sheetNodes = keys
    .map((k) => {
      const list = bySheet.get(k)!;
      const head = list[0]!;
      const pieces = list
        .map(
          (p) =>
            `    <Piece panelId="${escapeXml(p.panelId)}" label="${escapeXml(p.label)}"` +
            ` xMm="${cmToMm(p.xCm)}" yMm="${cmToMm(p.yCm)}"` +
            ` wMm="${cmToMm(p.widthCm)}" hMm="${cmToMm(p.heightCm)}"` +
            ` rotated="${p.rotated}"/>`,
        )
        .join("\n");
      return (
        `  <Sheet materialId="${escapeXml(head.materialId)}" materialName="${escapeXml(head.materialName)}"` +
        ` index="${head.sheetIndex}"` +
        ` stockWidthMm="${cmToMm(head.sheetWidthCm)}" stockHeightMm="${cmToMm(head.sheetHeightCm)}"` +
        ` kerfMm="${cmToMm(head.kerfCm)}" thicknessMm="${DEFAULT_PANEL_THICKNESS_MM}">\n${pieces}\n  </Sheet>`
      );
    })
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<WoodWopNestInterchange version="1" generator="wardrobe-planner">\n` +
    `  <Note>XML geometry interchange — not a native woodWOP MPRX/MPRXE binary. Use for converters or manual import.</Note>\n` +
    `  <Meta title="${escapeXml(title)}" generated="${escapeXml(generated)}"/>\n` +
    `  <Origin>top-left of each sheet; X right; Y down; dimensions in mm.</Origin>\n` +
    `${sheetNodes}\n` +
    `</WoodWopNestInterchange>\n`
  );
}

function cixVbSingleQuoted(s: string): string {
  return s.replace(/'/g, "''").replace(/\r?\n/g, " ").slice(0, 200);
}

/** Biesse CIX/BPP-style program for one nested sheet (stock = LPX×LPY). */
function buildCixForSheet(rowsOnSheet: SheetLayoutPieceRow[], title: string): string {
  const head = rowsOnSheet[0]!;
  const lpx = cmToMm(head.sheetWidthCm);
  const lpy = cmToMm(head.sheetHeightCm);
  const lpz = DEFAULT_PANEL_THICKNESS_MM;
  const generated = new Date().toISOString();

  const vbLines = [
    `wardrobe-planner: ${title}`,
    `generated ${generated} material=${head.materialName} sheet=${head.sheetIndex}`,
    "top-left stock mm; RECTANGLE center from lower-left origin",
  ].map(cixVbSingleQuoted);

  const rectangles: string[] = [];
  let n = 0;
  for (const p of rowsOnSheet) {
    n += 1;
    const wMm = cmToMm(p.widthCm);
    const hMm = cmToMm(p.heightCm);
    const xTl = cmToMm(p.xCm);
    const yTl = cmToMm(p.yCm);
    const xc = xTl + wMm / 2;
    const yc = lpy - yTl - hMm / 2;
    const id = 2_000_000 + n;
    rectangles.push(
      [
        "BEGIN MACRO",
        "\tNAME=RECTANGLE",
        `\tPARAM,NAME=ID,VALUE=${id}`,
        `\tPARAM,NAME=XC,VALUE=${round4(xc)}`,
        `\tPARAM,NAME=YC,VALUE=${round4(yc)}`,
        `\tPARAM,NAME=L,VALUE=${round4(wMm)}`,
        `\tPARAM,NAME=H,VALUE=${round4(hMm)}`,
        "\tPARAM,NAME=DIR,VALUE=dirCW",
        "\tPARAM,NAME=CT,VALUE=cmfNO",
        "\tPARAM,NAME=CD,VALUE=0",
        "\tPARAM,NAME=SS,VALUE=1",
        "\tPARAM,NAME=SD,VALUE=HALF",
        "\tPARAM,NAME=A,VALUE=0",
        "\tPARAM,NAME=ZS,VALUE=0",
        "\tPARAM,NAME=ZE,VALUE=0",
        "\tPARAM,NAME=SC,VALUE=scOFF",
        "\tPARAM,NAME=FD,VALUE=0",
        "\tPARAM,NAME=SP,VALUE=0",
        "\tPARAM,NAME=USC,VALUE=1",
        "\tPARAM,NAME=CRN,VALUE=1",
        "END MACRO",
      ].join("\r\n"),
    );
  }

  const vbBlock = [
    "BEGIN VB",
    ...vbLines.map((line) => `\tVBLINE="'${line}'"`),
    "END VB",
  ].join("\r\n");

  const mainData = [
    "BEGIN MAINDATA",
    `\tLPX=${lpx}`,
    `\tLPY=${lpy}`,
    `\tLPZ=${lpz}`,
    '\tORLST="1,4"',
    "\tSIMMETRY=0",
    "\tTLCHK=0",
    '\tTOOLING=""',
    '\tCUSTSTR=""',
    "\tFCN=25.400000",
    "\tXCUT=0",
    "\tYCUT=0",
    "\tJIGTH=0",
    "\tCKOP=0",
    "\tUNIQUE=0",
    '\tMATERIAL=""',
    '\tPUTLST=""',
    "\tOPPWKRS=0",
    "\tUNICLAMP=0",
    "\tCHKCOLL=0",
    "\tWTPIANI=0",
    "\tCOLLTOOL=0",
    "\tCALCEDTH=0",
    "\tENABLELABEL=0",
    "\tLOCKWASTE=0",
    "\tLOADEDGEOPT=0",
    "\tITLTYPE=0",
    "\tRUNPAV=0",
    "\tFLIPEND=0",
    "\tENABLEMACHLINKS=0",
    "\tENABLEPURSUITS=0",
    "\tENABLEFASTVERTBORINGS=0",
    "\tFASTVERTBORINGSVALUE=0",
    "END MAINDATA",
  ].join("\r\n");

  return [
    "BEGIN ID CID3",
    "\tREL= 3.5",
    "END ID",
    "",
    mainData,
    "",
    "BEGIN PUBLICVARS",
    "END PUBLICVARS",
    "",
    "BEGIN PRIVATEVARS",
    "END PRIVATEVARS",
    "",
    vbBlock,
    "",
    rectangles.join("\r\n\r\n"),
    "",
  ].join("\r\n");
}

export function runSheetLayoutPieceExport(
  byMaterial: SheetLayoutExportMaterialSlice[],
  format: WardrobeSheetLayoutExportFormat,
  title = "Sheet layout — nested pieces",
): void {
  if (typeof window === "undefined") return;
  const rows = buildSheetLayoutPieceRows(byMaterial);
  const stem = exportFilenameStem("wardrobe-sheet-pieces");

  if (format === "csv") {
    const csv = `# ${title}\r\n` + buildCsv(rows);
    downloadTextFile(`${stem}.csv`, "text/csv;charset=utf-8", `\uFEFF${csv}`);
    return;
  }
  if (format === "xml") {
    downloadTextFile(`${stem}.xml`, "application/xml;charset=utf-8", buildXml(rows, title));
    return;
  }
  if (format === "mpr") {
    const body = `; ${title}\r\n` + buildMpr(rows, title);
    downloadTextFile(`${stem}.mpr`, "text/plain;charset=utf-8", body);
    return;
  }
  if (format === "mprx") {
    downloadTextFile(`${stem}.mprx`, "application/xml;charset=utf-8", buildMprxXml(rows, title));
    return;
  }
  if (format === "cix") {
    const bySheet = new Map<string, SheetLayoutPieceRow[]>();
    for (const r of rows) {
      const k = sheetKey(r.materialId, r.sheetIndex);
      const list = bySheet.get(k) ?? [];
      list.push(r);
      bySheet.set(k, list);
    }
    const keys = [...bySheet.keys()].sort((a, b) => {
      const [ma, sa] = a.split("\t");
      const [mb, sb] = b.split("\t");
      if (ma !== mb) return ma.localeCompare(mb);
      return Number(sa) - Number(sb);
    });
    keys.forEach((k, i) => {
      const list = bySheet.get(k)!;
      const head = list[0]!;
      const matStem = filenameSafeStem(head.materialId);
      const cix = buildCixForSheet(list, title);
      const name = `${stem}_${matStem}_sheet${head.sheetIndex}.cix`;
      window.setTimeout(() => {
        downloadTextFile(name, "text/plain;charset=utf-8", cix);
      }, i * 320);
    });
    return;
  }

  const html = buildPrintableHtml(rows, title);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  requestAnimationFrame(() => {
    try {
      w.print();
    } catch {
      /* pop-up blocked */
    }
  });
}
