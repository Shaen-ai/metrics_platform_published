export const MAX_SURFACE_UPLOAD_BYTES = 10 * 1024 * 1024;

export const MAX_SURFACE_UPLOAD_LABEL = "10 MB";

export function isSurfaceFileOverLimit(file: { size: number }): boolean {
  return file.size > MAX_SURFACE_UPLOAD_BYTES;
}
