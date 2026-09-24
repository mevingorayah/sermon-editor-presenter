/**
 * Lightweight sanitizer for stored sermon text/HTML / TipTap JSON.
 */

import type { SermonContent } from "@/types/document";

const SCRIPT_TAG_RE =
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const STYLE_TAG_RE =
  /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi;
const EVENT_ATTR_RE = /\son[a-z]+\s*=\s*(["']).*?\1/gi;
const EVENT_ATTR_UNQUOTED_RE = /\son[a-z]+\s*=\s*[^\s>]+/gi;
const JS_URL_RE = /(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi;
const DATA_HTML_RE = /(href|src)\s*=\s*(["'])\s*data:text\/html[^"']*\2/gi;

export function sanitizeText(input: string): string {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function sanitizeHtml(input: string): string {
  let out = sanitizeText(input);
  out = out.replace(SCRIPT_TAG_RE, "");
  out = out.replace(STYLE_TAG_RE, "");
  out = out.replace(EVENT_ATTR_RE, "");
  out = out.replace(EVENT_ATTR_UNQUOTED_RE, "");
  out = out.replace(JS_URL_RE, "$1=$2#$2");
  out = out.replace(DATA_HTML_RE, "$1=$2#$2");
  return out;
}

export function sanitizeDocumentJson(doc: unknown): SermonContent {
  return scrub(doc) as SermonContent;
}

function scrub(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeHtml(value);
  }
  if (Array.isArray(value)) {
    return value.map(scrub);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.toLowerCase() === "script") continue;
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}
