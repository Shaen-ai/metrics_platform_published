/** Normalize persisted / API style tags: trim, dedupe case-insensitive, cap count and length. */
export function normalizeRoomStyleTagsField(tags: string[] | undefined): string[] | undefined {
  if (!tags?.length) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const s = String(t).trim().replace(/\s+/g, " ").slice(0, 40);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 8) break;
  }
  return out.length ? out : undefined;
}
