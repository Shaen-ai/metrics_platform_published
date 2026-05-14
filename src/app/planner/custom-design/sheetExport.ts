import type { Canvas } from "fabric";
import type { SheetDesignPayload } from "./sheetTypes";

export function canvasToPngDataUrl(canvas: Canvas) {
  return canvas.toDataURL({
    format: "png",
    multiplier: 1,
    enableRetinaScaling: true,
  });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function exportSheetPng(canvas: Canvas) {
  const dataUrl = canvasToPngDataUrl(canvas);
  downloadDataUrl(dataUrl, `design-${Date.now()}.png`);
  return dataUrl;
}

export async function exportSheetPdf(input: {
  canvas: Canvas;
  payload: SheetDesignPayload;
  customerName?: string | null;
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const image = canvasToPngDataUrl(input.canvas);
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const imageWidth = pageWidth - margin * 2;
  const imageHeight = imageWidth * (input.canvas.getHeight() / input.canvas.getWidth());

  doc.setFontSize(16);
  doc.text("Custom Furniture Plan", margin, 16);
  doc.setFontSize(10);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, 23);
  if (input.customerName) doc.text(`Customer: ${input.customerName}`, margin, 29);
  doc.addImage(image, "PNG", margin, 34, imageWidth, imageHeight);

  let y = 40 + imageHeight;
  doc.setFontSize(11);
  doc.text("Objects", margin, y);
  y += 6;
  doc.setFontSize(8);
  doc.text("Name", margin, y);
  doc.text("W", margin + 72, y);
  doc.text("H", margin + 92, y);
  doc.text("Color / material", margin + 112, y);
  y += 4;

  for (const obj of input.payload.objects) {
    if (y > 286) {
      doc.addPage();
      y = 16;
    }
    doc.text(obj.label || "Custom", margin, y, { maxWidth: 68 });
    doc.text(`${obj.width} mm`, margin + 72, y);
    doc.text(`${obj.height} mm`, margin + 92, y);
    doc.text(obj.materialKey ?? obj.color ?? "-", margin + 112, y, { maxWidth: 70 });
    y += 5;
  }

  doc.save(`design-${Date.now()}.pdf`);
}
