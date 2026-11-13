/**
 * Grapheme-aware bionic reading: bold the first `strength` of each word
 * (default 45%). Skips punctuation. Applied to all Preach text, including
 * Scripture quote body; already-bold text stays bold.
 */

export const DEFAULT_BIONIC_STRENGTH = 0.45;
/** Floor is above 0 so the slider can never turn Bionic off. */
export const MIN_BIONIC_STRENGTH = 0.1;
export const MAX_BIONIC_STRENGTH = 1;

export function clampBionicStrength(value: unknown, fallback = DEFAULT_BIONIC_STRENGTH): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_BIONIC_STRENGTH, Math.max(MIN_BIONIC_STRENGTH, n));
}

function graphemes(word: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(word), (s) => s.segment);
  }
  return Array.from(word);
}

function splitLeadingTrailingPunct(token: string): {
  lead: string;
  core: string;
  trail: string;
} {
  const leadMatch = token.match(/^[\p{P}\p{S}]+/u);
  const lead = leadMatch?.[0] ?? "";
  // Match trailing punctuation only in what is left after the lead, so a
  // token made entirely of punctuation ("—", "...") is emitted once, not twice.
  const rest = token.slice(lead.length);
  const trailMatch = rest.match(/[\p{P}\p{S}]+$/u);
  const trail = trailMatch?.[0] ?? "";
  const core = trail ? rest.slice(0, -trail.length) : rest;
  return { lead, core, trail };
}

export interface BionicPart {
  bold: boolean;
  text: string;
}

/** Split a plain-text run into bold/regular parts for bionic rendering. */
export function bionicParts(text: string, strength: number = DEFAULT_BIONIC_STRENGTH): BionicPart[] {
  if (!text) return [];
  const parts: BionicPart[] = [];
  const tokens = text.split(/(\s+)/);
  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) {
      parts.push({ bold: false, text: token });
      continue;
    }
    const { lead, core, trail } = splitLeadingTrailingPunct(token);
    if (lead) parts.push({ bold: false, text: lead });
    if (core) {
      const g = graphemes(core);
      const ratio = clampBionicStrength(strength);
      // At least 1 grapheme so the floor can never turn Bionic off.
      const n = Math.max(1, Math.ceil(g.length * ratio));
      const boldCount = Math.min(g.length, n);
      parts.push({ bold: true, text: g.slice(0, boldCount).join("") });
      if (boldCount < g.length) {
        parts.push({ bold: false, text: g.slice(boldCount).join("") });
      }
    }
    if (trail) parts.push({ bold: false, text: trail });
  }
  return parts;
}
