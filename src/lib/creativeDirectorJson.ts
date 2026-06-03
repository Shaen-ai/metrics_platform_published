/**
 * Parse the creative-director (Claude) reply into a JSON object.
 * Handles markdown fences, prose wrappers, multiple content blocks, and rejects HTML error pages.
 */

function extractBalancedObject(source: string, openBraceIdx: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openBraceIdx; i < source.length; i++) {
    const ch = source[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(openBraceIdx, i + 1);
    }
  }
  return null;
}

function extractMarkdownCodeBodies(text: string): string[] {
  const re = /```(?:json)?\s*([\s\S]*?)\s*```/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1]?.trim();
    if (inner) out.push(inner);
  }
  return out;
}

function looksLikeHtmlErrorBody(s: string): boolean {
  const t = s.trim();
  return /^<!DOCTYPE\s+/i.test(t) || /^<html[\s>]/i.test(t);
}

function tryParseJsonObjectFromString(trimmed: string): unknown | undefined {
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through to balanced scan */
    }
  }
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== "{") continue;
    const slice = extractBalancedObject(trimmed, i);
    if (!slice) continue;
    try {
      return JSON.parse(slice);
    } catch {
      continue;
    }
  }
  return undefined;
}

/** Concatenate every plain text segment from an Anthropic message (skips thinking/tool blocks). */
export function collectAnthropicTextBlocks(content: Array<{ type: string; text?: string }>): string {
  const parts: string[] = [];
  for (const b of content) {
    if (b.type === "text" && typeof b.text === "string" && b.text.length > 0) {
      parts.push(b.text);
    }
  }
  return parts.join("\n\n").trim();
}

/** Parse JSON design brief from merged assistant text; throws with a short reason if impossible. */
export function parseDesignBriefJsonFromAssistantText(rawAssistantText: string): unknown {
  const text = rawAssistantText.trim();
  if (!text) {
    throw new Error("Empty assistant response");
  }

  if (looksLikeHtmlErrorBody(text)) {
    throw new Error("Assistant returned HTML instead of JSON (proxy or API error page).");
  }

  const candidates: string[] = [];
  const codeBodies = extractMarkdownCodeBodies(text);
  if (codeBodies.length > 0) {
    candidates.push(...codeBodies);
  }
  candidates.push(text);

  for (const cand of candidates) {
    const trimmed = cand.trim();
    if (!trimmed || looksLikeHtmlErrorBody(trimmed)) continue;

    const parsed = tryParseJsonObjectFromString(trimmed);
    if (parsed !== undefined && typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
  }

  throw new Error("No valid JSON object found in assistant response");
}
