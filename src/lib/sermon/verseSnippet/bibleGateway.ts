import { formatReference, parseReference } from "@/lib/bible";
import { isPasteTranslation, TRANSLATION_BY_ID } from "./types";

const GATEWAY_BASE = "https://www.biblegateway.com/passage/";

/**
 * Build a Bible Gateway passage URL for a paste-only translation.
 * `search` uses Backend's English formatted reference when the ref is
 * recognised, otherwise the writer's own string (still URL-encoded).
 */
export function bibleGatewayUrl(ref: string, translation: string): string | null {
  if (!isPasteTranslation(translation)) return null;
  const code = TRANSLATION_BY_ID[translation].bibleGatewayCode;
  if (!code) return null;
  const parsed = parseReference(ref);
  const search = (parsed ? formatReference(parsed, "en") : null) ?? ref.trim();
  if (!search) return null;
  const params = new URLSearchParams({ search, version: code });
  return `${GATEWAY_BASE}?${params.toString()}`;
}
