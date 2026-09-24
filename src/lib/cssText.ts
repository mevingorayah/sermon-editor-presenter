import type { CSSProperties } from "react";

/**
 * Convert an inline CSS declaration string (e.g. TipTap `renderHTML` output
 * like `"text-align: center; color: #5c4a1f"`) into a React style object.
 *
 * TipTap global attributes (TextAlign, etc.) render `style` as a *string*.
 * React NodeViews must never forward that string as a `style` prop:
 * `NodeViewWrapper` spreads `props.style` into an object, and spreading a
 * string yields indexed keys (`{0: "t", 1: "e", …}`) which crashes Chromium
 * with "Failed to set an indexed property [0] on 'CSSStyleDeclaration'".
 */
export function cssTextToReactStyle(
  input: unknown,
): CSSProperties | undefined {
  if (input == null || input === "") return undefined;
  if (typeof input === "object") {
    if (Array.isArray(input)) return undefined;
    return input as CSSProperties;
  }
  if (typeof input !== "string") return undefined;

  const out: Record<string, string> = {};
  for (const decl of input.split(";")) {
    const idx = decl.indexOf(":");
    if (idx <= 0) continue;
    const rawProp = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!rawProp || !value) continue;
    const prop = rawProp.startsWith("--")
      ? rawProp // CSS custom properties keep their name verbatim
      : rawProp
          .toLowerCase()
          .replace(/^-ms-/, "ms-")
          .replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    out[prop] = value;
  }
  return Object.keys(out).length > 0 ? (out as CSSProperties) : undefined;
}
