import type { SermonContent } from "@/types/document";

/**
 * Frontend color flattening for export (slice 2).
 *
 * Backend rejects any CSS `var(--…)` in TipTap color marks with 400, so the
 * export POST must carry concrete hex. We flatten a *copy* of the TipTap JSON
 * for the request only; the live editor document is never rewritten.
 */

/** Custom property holding the Edit accent (defined on :root in globals.css). */
export const EDIT_ACCENT_VAR = "--edit-accent";

/**
 * Fallback for `--edit-accent` when the token is missing / unresolvable or we
 * are not in a browser. The live value is read at export time
 * (`resolveEditAccentHex`).
 */
export const EDIT_ACCENT_FALLBACK_HEX = "#5c4a1f";

/** @deprecated Use EDIT_ACCENT_FALLBACK_HEX (or resolveEditAccentHex()). */
export const EDIT_ACCENT_HEX = EDIT_ACCENT_FALLBACK_HEX;

/** Last-resort ink when a CSS var cannot be resolved (matches --edit-fg). */
export const FALLBACK_TEXT_HEX = "#1a1814";

/**
 * Fallback hex for known vars, used only when the runtime lookup yields
 * nothing (SSR, tests, token missing).
 */
export const KNOWN_VAR_HEX: Readonly<Record<string, string>> = {
  [EDIT_ACCENT_VAR]: EDIT_ACCENT_FALLBACK_HEX,
};

/** Resolve a custom property name (e.g. `--edit-fg`) to a color string. */
export type CssVarResolver = (name: string) => string | null | undefined;

const CSS_VAR_RE = /var\s*\(\s*--/i;

export function containsCssVar(value: unknown): value is string {
  return typeof value === "string" && CSS_VAR_RE.test(value);
}

/**
 * Parse the outermost `var(--name[, fallback])` in a color value.
 * Returns null when the value is not a simple var() expression.
 */
export function parseCssVar(
  value: string,
): { name: string; fallback?: string } | null {
  const m = value
    .trim()
    .match(/^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([\s\S]+?))?\s*\)$/);
  if (!m) return null;
  return { name: m[1], fallback: m[2]?.trim() || undefined };
}

/**
 * Normalize #rgb / #rrggbb / #rrggbbaa / rgb() / rgba() to lowercase #rrggbb.
 * Returns null for anything else (named colors, var(), color-mix(), …).
 */
export function toHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim();
  const h6 = s.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  if (h6) return `#${h6[1].toLowerCase()}`;
  const h3 = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])[0-9a-f]?$/i);
  if (h3) {
    return `#${h3[1]}${h3[1]}${h3[2]}${h3[2]}${h3[3]}${h3[3]}`.toLowerCase();
  }
  const rgb = s.match(
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i,
  );
  if (rgb) {
    const c = (n: string) =>
      Math.max(0, Math.min(255, Math.round(Number(n))))
        .toString(16)
        .padStart(2, "0");
    return `#${c(rgb[1])}${c(rgb[2])}${c(rgb[3])}`;
  }
  return null;
}

export interface FlattenColorOptions {
  /** Runtime lookup (browser: getComputedStyle). Optional in tests / SSR. */
  resolveVar?: CssVarResolver;
  /** Used when nothing else resolves. Defaults to FALLBACK_TEXT_HEX. */
  fallbackHex?: string;
}

/** Resolve one color value that contains a CSS var to a concrete #rrggbb. */
export function resolveCssVarColor(
  value: string,
  opts: FlattenColorOptions = {},
): string {
  const fallback = toHex(opts.fallbackHex) ?? FALLBACK_TEXT_HEX;
  const parsed = parseCssVar(value);
  if (!parsed) {
    // Composite expression (e.g. color-mix(… var(--x) …)): only a runtime
    // resolver that understands full values can help; otherwise fall back.
    return fallback;
  }
  let runtime: string | null = null;
  try {
    runtime = toHex(opts.resolveVar?.(parsed.name) ?? null);
  } catch {
    runtime = null;
  }
  if (runtime) return runtime;

  const known = KNOWN_VAR_HEX[parsed.name];
  if (known) return known;

  if (parsed.fallback) {
    if (containsCssVar(parsed.fallback)) {
      return resolveCssVarColor(parsed.fallback, opts);
    }
    const fb = toHex(parsed.fallback);
    if (fb) return fb;
  }
  return fallback;
}

function flattenValue(value: unknown, opts: FlattenColorOptions): unknown {
  return containsCssVar(value) ? resolveCssVarColor(value, opts) : value;
}

function flattenMark(
  mark: Record<string, unknown>,
  opts: FlattenColorOptions,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...mark };
  if (mark.attrs && typeof mark.attrs === "object") {
    const attrs = { ...(mark.attrs as Record<string, unknown>) };
    if ("color" in attrs) attrs.color = flattenValue(attrs.color, opts);
    out.attrs = attrs;
  }
  if ("color" in mark) out.color = flattenValue(mark.color, opts);
  return out;
}

function flattenNode(node: unknown, opts: FlattenColorOptions): unknown {
  if (Array.isArray(node)) return node.map((n) => flattenNode(n, opts));
  if (!node || typeof node !== "object") return node;
  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };

  if (Array.isArray(src.marks)) {
    out.marks = src.marks.map((m) =>
      m && typeof m === "object"
        ? flattenMark(m as Record<string, unknown>, opts)
        : m,
    );
  }
  if (src.attrs && typeof src.attrs === "object") {
    const attrs = { ...(src.attrs as Record<string, unknown>) };
    if ("color" in attrs) attrs.color = flattenValue(attrs.color, opts);
    out.attrs = attrs;
  }
  if (Array.isArray(src.content)) {
    out.content = src.content.map((c) => flattenNode(c, opts));
  }
  return out;
}

/**
 * Return a deep copy of TipTap JSON with every `textStyle.color` (and any
 * other mark / node `color` attr) that uses CSS `var(--…)` replaced by hex.
 * Concrete colors are left untouched. The input is never mutated.
 */
export function flattenContentColors(
  content: SermonContent,
  opts: FlattenColorOptions = {},
): SermonContent {
  return flattenNode(content, opts) as SermonContent;
}

/**
 * Browser resolver: reads the custom property from `el` (default :root) and
 * lets the engine compute it to rgb() via a hidden probe, so nested vars and
 * named colors resolve too. Returns null outside the browser or when unset.
 */
export function browserCssVarResolver(el?: Element): CssVarResolver {
  return (name) => {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      typeof getComputedStyle !== "function"
    ) {
      return null;
    }
    const scope = el ?? document.documentElement;
    const raw = getComputedStyle(scope).getPropertyValue(name).trim();
    if (!raw) return null;
    const direct = toHex(raw);
    if (direct) return direct;
    const probe = document.createElement("span");
    probe.style.display = "none";
    probe.style.color = raw;
    if (!probe.style.color) return null; // not a valid color value
    (scope instanceof HTMLElement ? scope : document.body).appendChild(probe);
    try {
      return getComputedStyle(probe).color || null;
    } finally {
      probe.remove();
    }
  };
}

/**
 * Read `--edit-accent` at export time and return it as lowercase `#rrggbb`
 * (hex or rgb()/rgba() tokens; other valid colors via the browser resolver's
 * probe). Falls back to EDIT_ACCENT_FALLBACK_HEX when the token is missing or
 * unresolvable, or outside the browser. Never returns a non-hex value.
 */
export function resolveEditAccentHex(
  resolveVar: CssVarResolver = browserCssVarResolver(),
): string {
  try {
    const hex = toHex(resolveVar(EDIT_ACCENT_VAR) ?? null);
    if (hex) return hex;
  } catch {
    /* fall through */
  }
  return EDIT_ACCENT_FALLBACK_HEX;
}
