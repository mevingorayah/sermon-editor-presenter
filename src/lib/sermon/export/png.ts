import sharp from "sharp";
import type { CalibratedSnapshot } from "@/types/document";
import {
  DEFAULT_ACCENT_DARK,
  DEFAULT_ACCENT_LIGHT,
  HIGHLIGHT_AMBER,
  toHexRgb,
} from "./colors";
import {
  styledBlocksFromSnapshot,
  titleTextFromSnapshot,
  type StyledBlock,
  type StyledRun,
  citationCaps,
} from "./contentWalk";
import { cssFontStack } from "./fonts";
import { isPaperTarget, resolveMargins } from "./margins";

export interface PngBuildOptions {
  resolvedColors?: { accent: string };
}

interface FrameSize {
  width: number;
  height: number;
}

function frameSizeFor(target: string): FrameSize {
  switch (target) {
    case "screen-16-10":
      return { width: 1600, height: 1000 };
    case "tablet-portrait":
      return { width: 900, height: 1200 };
    case "paper-letter":
      return { width: 1275, height: 1650 }; // 8.5x11 @ 150dpi
    case "paper-a4":
      return { width: 1240, height: 1754 };
    case "paper-half-letter":
      return { width: 825, height: 1275 };
    case "screen-16-9":
    default:
      return { width: 1920, height: 1080 };
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function runsToSvgTspans(
  runs: StyledRun[],
  opts: { size: number; defaultColor: string; forceItalic?: boolean },
): string {
  return runs
    .map((run) => {
      const weight = run.bold ? "700" : "400";
      const style = opts.forceItalic || run.italic ? "italic" : "normal";
      const fill = run.color || opts.defaultColor;
      const family = cssFontStack(run.fontFamily);
      const bg = run.highlight
        ? ` style="background:${HIGHLIGHT_AMBER}"`
        : "";
      // SVG text doesn't support background on tspan reliably; use fill + optional
      // brighter look for highlight.
      const highlightFill = run.highlight ? "#6B5A1E" : fill;
      void bg;
      return `<tspan fill="${escapeXml(highlightFill)}" font-family="${escapeXml(family)}" font-weight="${weight}" font-style="${style}" font-size="${opts.size}">${escapeXml(run.text)}</tspan>`;
    })
    .join("");
}

function blockRole(type: StyledBlock["type"]): {
  size: number;
  gap: number;
  defaultColor: string;
  forceItalic?: boolean;
} {
  switch (type) {
    case "Title":
      return { size: 42, gap: 28, defaultColor: "#111111" };
    case "H1":
      return { size: 28, gap: 18, defaultColor: "#111111" };
    case "H2":
      return { size: 22, gap: 14, defaultColor: "#222222" };
    case "Scripture":
      return {
        size: 18,
        gap: 12,
        defaultColor: "#111111",
        forceItalic: true,
      };
    case "Caption":
      return { size: 14, gap: 10, defaultColor: "#555555" };
    case "Body":
    default:
      return { size: 18, gap: 12, defaultColor: "#111111" };
  }
}

const CHAR_EM = 0.53; // average advance of the serif text fonts, in ems

interface Token {
  run: StyledRun;
  text: string;
}

function familyFor(run: StyledRun): string {
  return run.fontExplicit ? cssFontStack(run.fontFamily) : cssFontStack("serif");
}

/** Wrap styled runs into lines by estimated width, keeping every mark and space. */
function layoutLines(runs: StyledRun[], size: number, maxWidth: number): Token[][] {
  const tokens: Token[] = [];
  for (const run of runs) {
    for (const m of run.text.match(/\S+\s*|\s+/g) ?? []) tokens.push({ run, text: m });
  }
  const lines: Token[][] = [];
  let cur: Token[] = [];
  let w = 0;
  for (const tok of tokens) {
    const tw = tok.text.trimEnd().length * size * CHAR_EM;
    if (cur.length && w + tw > maxWidth) {
      lines.push(cur);
      cur = [];
      w = 0;
    }
    cur.push(tok);
    w += tok.text.length * size * CHAR_EM;
  }
  if (cur.length) lines.push(cur);
  return lines.length ? lines : [[]];
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
 * PNG export: the whole sermon laid out over as many frames as it needs,
 * one PNG per frame. Notes are ignored for PNG (slice 2).
 */
export async function buildPngPages(
  snapshot: CalibratedSnapshot,
  options: PngBuildOptions = {},
): Promise<Buffer[]> {
  const target = String(snapshot.target);
  const { width, height } = frameSizeFor(target);
  const margins = resolveMargins(snapshot.margins, target);
  const scale = width / 13.3;
  const mx = Math.max(24, Math.round(margins.left * scale));
  const my = Math.max(24, Math.round(margins.top * scale));
  const binder = Math.round(margins.binderGutter * scale);

  const paper = isPaperTarget(target);
  const light = paper || snapshot.theme === "light";
  const bg = light ? "#F7F4EF" : "#1A1A1A";
  const fg = light ? "#111111" : "#F0EDE6";
  const muted = light ? "#555555" : "#A8A29A";
  const accent =
    toHexRgb(options.resolvedColors?.accent) ||
    (light ? DEFAULT_ACCENT_LIGHT : DEFAULT_ACCENT_DARK);
  // Dark theme: the title uses the readable dark-theme accent, not a dark ink.
  const titleColor = light ? accent : DEFAULT_ACCENT_DARK;
  const highlightFill = light ? HIGHLIGHT_AMBER : "#3d2e0e";

  const blocks = styledBlocksFromSnapshot(snapshot);
  const title = titleTextFromSnapshot(snapshot);
  const contentWidth = width - mx * 2 - binder;
  const left = mx + binder;
  const bottom = height - my;

  const pages: string[][] = [];
  let page: string[] = [];
  let y = 0;
  const newPage = () => {
    page = [`<rect x="0" y="0" width="8" height="${height}" fill="${escapeXml(accent)}" />`];
    pages.push(page);
    y = my + 8;
  };
  newPage();

  const drawLine = (
    line: Token[],
    size: number,
    lh: number,
    align: StyledBlock["align"],
    opts: { defaultColor: string; forceItalic?: boolean; forceBold?: boolean },
  ) => {
    if (y + lh > bottom && y > my + 8) newPage();
    const baseline = y + size;
    const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
    const lineW = line.reduce((n, t) => n + t.text.length, 0) * size * CHAR_EM;
    const x0 = align === "center" ? left + contentWidth / 2 : align === "right" ? left + contentWidth : left;
    const start = align === "center" ? x0 - lineW / 2 : align === "right" ? x0 - lineW : x0;
    let cx = start;
    for (const t of line) {
      const tw = t.text.length * size * CHAR_EM;
      if (t.run.highlight) {
        page.push(`<rect x="${cx.toFixed(1)}" y="${(baseline - size * 0.85).toFixed(1)}" width="${tw.toFixed(1)}" height="${(size * 1.15).toFixed(1)}" fill="${highlightFill}" />`);
      }
      cx += tw;
    }
    page.push(`<text xml:space="preserve" x="${x0}" y="${baseline}" text-anchor="${anchor}">${tokensToSvg(line, { size, ...opts })}</text>`);
    y += lh;
  };

  const role = (type: StyledBlock["type"]) => {
    switch (type) {
      case "Title": return { size: 42, gap: 28, color: titleColor, bold: true };
      case "H1": return { size: 30, gap: 18, color: fg, bold: true };
      case "H2": return { size: 24, gap: 14, color: light ? "#222222" : "#D4CFC5", bold: true };
      case "Caption": return { size: 16, gap: 12, color: muted };
      case "Scripture": return { size: 20, gap: 12, color: fg, italic: true };
      default: return { size: 20, gap: 12, color: fg };
    }
  };

  const all = blocks.length ? blocks : [{ type: "Title", align: "left", runs: [{ text: title, fontFamily: "serif" }] } as StyledBlock];
  for (const block of all) {
    const r = role(block.type);
    const lh = r.size * snapshot.lineHeight;
    for (const line of layoutLines(block.runs, r.size, contentWidth)) {
      drawLine(line, r.size, lh, block.align, { defaultColor: r.color, forceItalic: r.italic, forceBold: r.bold });
    }
    if (block.citation) {
      const cite: StyledRun = { text: citationCaps(block.citation), fontFamily: "serif", color: muted };
      drawLine([{ run: cite, text: cite.text }], 16, 26, "right", { defaultColor: muted });
    }
    y += r.gap;
  }

  return Promise.all(
    pages.map((lines) => {
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${escapeXml(bg)}" />
  ${lines.join("\n  ")}
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
