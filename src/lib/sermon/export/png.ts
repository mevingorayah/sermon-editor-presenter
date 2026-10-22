import sharp from "sharp";
import type { CalibratedSnapshot } from "@/types/document";
import {
  DEFAULT_ACCENT_DARK,
  DEFAULT_ACCENT_LIGHT,
  HIGHLIGHT_AMBER,
  toHexRgb,
} from "./colors";
import {
  type StyledBlock,
  type StyledRun,
  citationCaps,
} from "./contentWalk";
import { cssFontStack } from "./fonts";
import { isPaperTarget } from "./margins";
import { exportPages, sliceRuns, type LineToken } from "./pages";
import { DARK_YELLOW_PRESET, ensureContrast } from "../../reading/contrast";

export interface PngBuildOptions {
  resolvedColors?: { accent: string };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const CHAR_EM = 0.53; // as pngLayout.ts
type Token = LineToken;

function familyFor(run: StyledRun): string {
  return run.fontExplicit ? cssFontStack(run.fontFamily) : cssFontStack("serif");
}

function tokensToSvg(
  line: Token[],
  opts: { size: number; defaultColor: string; forceItalic?: boolean; forceBold?: boolean },
): string {
  return line
    .map(({ run, text }, i) => {
      const t = i === line.length - 1 ? text.trimEnd() : text;
      const weight = opts.forceBold || run.bold ? "700" : "400";
      const style = opts.forceItalic || run.italic ? "italic" : "normal";
      const deco = [run.underline ? "underline" : "", run.strike ? "line-through" : ""]
        .filter(Boolean)
        .join(" ");
      return `<tspan fill="${escapeXml(run.color || opts.defaultColor)}" font-family="${escapeXml(familyFor(run))}" font-weight="${weight}" font-style="${style}" font-size="${opts.size}"${deco ? ` text-decoration="${deco}"` : ""}>${escapeXml(t)}</tspan>`;
    })
    .join("");
}

export interface PngPagesResult {
  pages: Buffer[];
}

/**
 * PNG export: the whole sermon over as many frames as it needs, one PNG per
 * frame, using the shared page split in pngLayout.ts (same as PPTX slides and
 * the Export button's page count). Notes are ignored for PNG (slice 2).
 */
export async function buildPngPages(
  snapshot: CalibratedSnapshot,
  options: PngBuildOptions = {},
): Promise<Buffer[]> {
  const target = String(snapshot.target);
  const layout = exportPages(snapshot);
  const { width, height, left, contentWidth } = layout.frame;

  const paper = isPaperTarget(target);
  const light = paper || snapshot.theme === "light";
  const bg = light ? "#F7F4EF" : "#1A1A1A";
  const fg = light ? "#111111" : "#F0EDE6";
  const muted = light ? "#555555" : "#A8A29A";
  const accent =
    toHexRgb(options.resolvedColors?.accent) ||
    (light ? DEFAULT_ACCENT_LIGHT : DEFAULT_ACCENT_DARK);
  // Dark theme: the accent is lightened (hue kept) until it reaches 4.5:1 (#19).
  const titleColor = light ? accent : ensureContrast(accent, bg);
  const highlightFill = light ? HIGHLIGHT_AMBER : DARK_YELLOW_PRESET;

  const role = (type: StyledBlock["type"]) => {
    switch (type) {
      case "Title": return { color: titleColor, bold: true };
      case "H1": return { color: fg, bold: true };
      case "H2": return { color: light ? "#222222" : "#D4CFC5", bold: true };
      case "Caption": return { color: muted };
      case "Scripture": return { color: fg, italic: true };
      default: return { color: fg };
    }
  };

  const drawLine = (
    out: string[],
    line: Token[],
    size: number,
    y: number,
    align: StyledBlock["align"],
    opts: { defaultColor: string; forceItalic?: boolean; forceBold?: boolean },
  ) => {
    const baseline = y + size;
    const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
    const lineW = line.reduce((n, t) => n + t.text.length, 0) * size * CHAR_EM;
    const x0 = align === "center" ? left + contentWidth / 2 : align === "right" ? left + contentWidth : left;
    const start = align === "center" ? x0 - lineW / 2 : align === "right" ? x0 - lineW : x0;
    let cx = start;
    for (const t of line) {
      const tw = t.text.length * size * CHAR_EM;
      if (t.run.highlight) {
        out.push(`<rect x="${cx.toFixed(1)}" y="${(baseline - size * 0.85).toFixed(1)}" width="${tw.toFixed(1)}" height="${(size * 1.15).toFixed(1)}" fill="${highlightFill}" />`);
      }
      cx += tw;
    }
    out.push(`<text xml:space="preserve" x="${x0}" y="${baseline}" text-anchor="${anchor}">${tokensToSvg(line, { size, ...opts })}</text>`);
  };

  return Promise.all(
    layout.pages.map((placed) => {
      const out = [`<rect x="0" y="0" width="8" height="${height}" fill="${escapeXml(accent)}" />`];
      for (const p of placed.lines) {
        const block = layout.blocks[p.blockIndex];
        if (p.kind === "citation") {
          const cite: StyledRun = { text: citationCaps(block.citation ?? ""), fontFamily: "serif", color: muted };
          drawLine(out, [{ run: cite, text: cite.text }], p.size, p.y, "right", { defaultColor: muted });
        } else {
          const r = role(block.type);
          drawLine(out, sliceRuns(block, p.start, p.end), p.size, p.y, block.align, { defaultColor: r.color, forceItalic: r.italic, forceBold: r.bold });
        }
      }
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${escapeXml(bg)}" />
  ${out.join("\n  ")}
</svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    }),
  );
}

/** First frame only (kept for callers that want a single image). */
export async function buildPng(
  snapshot: CalibratedSnapshot,
  options: PngBuildOptions = {},
): Promise<Buffer> {
  return (await buildPngPages(snapshot, options))[0];
}
