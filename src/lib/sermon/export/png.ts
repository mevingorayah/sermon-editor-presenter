import sharp from "sharp";
import JSZip from "jszip";
import type { CalibratedSnapshot } from "@/types/document";
import {
  DEFAULT_ACCENT_DARK,
  HIGHLIGHT_AMBER,
  DEFAULT_ACCENT_LIGHT,
  toHexRgb,
} from "./colors";
import { citationDisplay, type StyledBlock, type StyledRun } from "./contentWalk";
import { layoutSnapshot, roleStyle, type PngPage, type SnapshotLayout } from "./pngLayout";
import { blockFadeOpacity, lookAlign, lookRole, type BlockOutlinePaint, type BlockShadowPaint } from "./blockLook";
import { afmMeasurer, FALLBACK_FAMILY, letterSpacingEm, metricCompatibleCss, splitByCoverage } from "./textMeasure";
import { displayHighlightColor, displayTextColor, displayTextOnBackground, ensureContrast } from "@/lib/reading/contrast";

export interface PngBuildOptions {
  resolvedColors?: { accent: string };
  /** Colours only; defaults to the snapshot theme. */
  exportTheme?: "light" | "dark";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Runs clipped to [start, end) of the block's plain text. */
export function sliceRuns(runs: readonly StyledRun[], start: number, end: number): StyledRun[] {
  const out: StyledRun[] = [];
  let at = 0;
  for (const r of runs) {
    const a = Math.max(start, at);
    const b = Math.min(end, at + r.text.length);
    if (a < b) out.push({ ...r, text: r.text.slice(a - at, b - at) });
    at += r.text.length;
  }
  return out;
}

/** Drop trailing whitespace from a line's runs (it never counts for width). */
export function trimRunsEnd(runs: StyledRun[]): StyledRun[] {
  const out = runs.map((r) => ({ ...r }));
  for (let i = out.length - 1; i >= 0; i--) {
    out[i].text = out[i].text.replace(/\s+$/u, "");
    if (out[i].text) break;
    out.pop();
  }
  return out;
}

/** A line run, flagged when its text is drawn in the symbol fallback font. */
export type GlyphRun = StyledRun & { glyphFallback?: boolean };

/**
 * Split runs where the run's export font lacks a glyph (e.g. "↑" in Lora):
 * those pieces are drawn in the fallback font, exactly as the layout measured.
 */
export function splitRunsByGlyph(runs: readonly StyledRun[], role: { bold: boolean; italic: boolean }): GlyphRun[] {
  const out: GlyphRun[] = [];
  for (const r of runs) {
    const style = { font: r.fontFamily ?? "sans", bold: role.bold || !!r.bold, italic: role.italic || !!r.italic };
    for (const piece of splitByCoverage(r.text, style)) {
      out.push(piece.fallback ? { ...r, text: piece.text, glyphFallback: true } : { ...r, text: piece.text });
    }
  }
  return out;
}

interface Palette {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  /** Title colour: dark theme lifts the accent to 4.5:1 on the background. */
  title: string;
  /** Highlight fill behind marked text. */
  highlight: string;
  light: boolean;
}

/** Colours for a theme. Theme never affects layout. */
export function paletteFor(theme: "light" | "dark", accentIn?: string): Palette {
  const light = theme === "light";
  const bg = light ? "#F7F4EF" : "#1A1A1A";
  const accent = toHexRgb(accentIn) || (light ? DEFAULT_ACCENT_LIGHT : DEFAULT_ACCENT_DARK);
  return {
    light,
    bg,
    fg: light ? "#111111" : "#F0EDE6",
    muted: light ? "#555555" : "#A8A29A",
    accent,
    title: light ? accent : ensureContrast(accent, bg),
    highlight: HIGHLIGHT_AMBER,
  };
}

export function blockColor(type: StyledBlock["type"], p: Palette): string {
  if (type === "Title") return p.title;
  if (type === "Caption") return p.muted;
  if (type === "H2") return p.light ? "#222222" : "#D4CFC5";
  return p.fg;
}

/** SVG filter + caster for a CSS box-shadow (sharp rasterises this). */
export function svgBoxShadow(id: string, box: { x: number; y: number; w: number; h: number }, sh: BlockShadowPaint): string {
  const std = (sh.blur / 2).toFixed(2);
  const pad = sh.blur * 3 + Math.abs(sh.offsetX) + Math.abs(sh.offsetY);
  const fx = (box.x + Math.min(0, sh.offsetX) - pad).toFixed(2);
  const fy = (box.y + Math.min(0, sh.offsetY) - pad).toFixed(2);
  const fw = (box.w + Math.abs(sh.offsetX) + pad * 2).toFixed(2);
  const fh = (box.h + Math.abs(sh.offsetY) + pad * 2).toFixed(2);
  return (
    `<filter id="${escapeXml(id)}" x="${fx}" y="${fy}" width="${fw}" height="${fh}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="${std}" result="blur"/>` +
    `<feOffset in="blur" dx="${sh.offsetX}" dy="${sh.offsetY}" result="off"/>` +
    `<feFlood flood-color="${escapeXml(sh.color)}" flood-opacity="${sh.opacity}" result="tint"/>` +
    `<feComposite in="tint" in2="off" operator="in" result="shadow"/>` +
    `</filter>` +
    `<rect data-block-shadow="${escapeXml(id)}" x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.w.toFixed(2)}" height="${box.h.toFixed(2)}" fill="#000000" filter="url(#${escapeXml(id)})"/>`
  );
}

/** Full-box outline as a border (CSS outline sits outside the box). */
export function svgBoxOutline(id: string, box: { x: number; y: number; w: number; h: number }, outline: BlockOutlinePaint, fallbackColor: string): string {
  const w = outline.width;
  const color = outline.color || fallbackColor;
  return (
    `<rect data-block-outline="${escapeXml(id)}" x="${(box.x - w / 2).toFixed(2)}" y="${(box.y - w / 2).toFixed(2)}" ` +
    `width="${(box.w + w).toFixed(2)}" height="${(box.h + w).toFixed(2)}" fill="none" stroke="${escapeXml(color)}" ` +
    `stroke-width="${w}" stroke-linejoin="miter" data-outline-style="${escapeXml(outline.style)}"/>`
  );
}

function boxShadows(b: { shadow?: BlockShadowPaint; shadows?: BlockShadowPaint[] }): BlockShadowPaint[] {
  return b.shadows ?? (b.shadow ? [b.shadow] : []);
}

function pageSvg(layout: SnapshotLayout, page: PngPage, p: Palette): string {
  const { frame: f, styled } = layout;
  const fadeOf = (block: (typeof styled)[number]) =>
    blockFadeOpacity(block.look?.effect) ?? blockFadeOpacity(block.column?.sectionLook?.effect);
  const parts: string[] = [
    `<rect x="0" y="0" width="8" height="${f.height}" fill="${escapeXml(p.accent)}" />`,
  ];
  (page.boxes ?? []).forEach((b, i) => {
    const inner: string[] = [];
    boxShadows(b).forEach((sh, j) => inner.push(svgBoxShadow(`bsh-${i}-${j}`, b, sh)));
    if (b.fill) inner.push(`<rect x="${b.x.toFixed(2)}" y="${b.y.toFixed(2)}" width="${b.w.toFixed(2)}" height="${b.h.toFixed(2)}" fill="${escapeXml(b.fill)}" />`);
    if (b.border) inner.push(`<rect x="${b.x.toFixed(2)}" y="${b.y.toFixed(2)}" width="${b.borderWidth.toFixed(2)}" height="${b.h.toFixed(2)}" fill="${escapeXml(b.border)}" />`);
    if (b.outline) inner.push(svgBoxOutline(`bon-${i}`, b, b.outline, p.fg));
    if (b.opacity !== undefined && b.opacity < 1 && inner.length) {
      parts.push(`<g data-block-fade="${b.opacity}" opacity="${b.opacity}">${inner.join("")}</g>`);
    } else {
      parts.push(...inner);
    }
  });
  for (const line of page.lines) {
    const block = styled[line.blockIndex];
    const lx = line.x ?? f.left;
    const lw = line.width ?? f.contentWidth;
    const baseline = (line.y + line.size).toFixed(2);
    if (line.kind === "citation") {
      const shown = citationDisplay(block);
      const anchor = shown.align === "left" ? "start" : "end";
      const x = shown.align === "left" ? lx : lx + lw;
      const fade = fadeOf(block);
      const fadeAttr = fade !== undefined ? ` opacity="${fade}"` : "";
      const theme = p.light ? "print" as const : "screen-dark" as const;
      const nearest = block.look?.background ?? p.bg;
      const citeFill = displayTextOnBackground(undefined, nearest, theme, { pageBackground: p.bg }) ?? p.muted;
      parts.push(
        `<text x="${x}" y="${baseline}" text-anchor="${anchor}" fill="${escapeXml(citeFill)}" font-size="${line.size}" font-family="${escapeXml(metricCompatibleCss("serif"))}"${fadeAttr}>${escapeXml(shown.text)}</text>`,
      );
      continue;
    }
    const role = lookRole(roleStyle(block.type), block.look);
    const color = block.look?.color ?? blockColor(block.type, p);
    const align = lookAlign(block.look, block.align);
    const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
    const x =
      align === "center" ? lx + lw / 2
        : align === "right" ? lx + lw
          : lx;
    const runs = splitRunsByGlyph(trimRunsEnd(sliceRuns(block.runs, line.start, line.end)), role);
    const styleOf = (run: StyledRun) => ({
      font: run.fontFamily,
      bold: role.bold || !!run.bold,
      italic: role.italic || !!run.italic,
      letterSpacing: run.letterSpacing ?? block.letterSpacing,
    });
    const widths = runs.map((run) => afmMeasurer(run.text, line.size, styleOf(run)));
    const total = widths.reduce((a, w) => a + w, 0);
    let hx = anchor === "middle" ? x - total / 2 : anchor === "end" ? x - total : x;
    const fade = fadeOf(block);
    const fadeAttr = fade !== undefined ? ` opacity="${fade}"` : "";
    if (block.look?.highlight && total > 0) {
      parts.push(
        `<rect x="${hx.toFixed(2)}" y="${(line.y + line.size * 0.15).toFixed(2)}" width="${total.toFixed(2)}" height="${(line.size * 1.05).toFixed(2)}" fill="${escapeXml(block.look.highlight)}"${fadeAttr} />`,
      );
    }
    runs.forEach((run, i) => {
      if (run.highlight) {
        const hl = displayHighlightColor(run.highlightColor || p.highlight);
        parts.push(
          `<rect x="${hx.toFixed(2)}" y="${(line.y + line.size * 0.15).toFixed(2)}" width="${widths[i].toFixed(2)}" height="${(line.size * 1.05).toFixed(2)}" fill="${escapeXml(hl)}"${fadeAttr} />`,
        );
      }
      hx += widths[i];
    });
    const tspans = runs
      .map((run) => {
        const theme = p.light ? "print" as const : "screen-dark" as const;
        const nearest = block.look?.background ?? p.bg;
        const painted = displayTextOnBackground(run.color ?? block.look?.color, nearest, theme, {
          highlight: !!run.highlight,
          pageBackground: p.bg,
        });
        const fill = run.highlight && !run.color && !p.light
          ? "#141210"
          : (painted ?? displayTextColor(run.color || color, nearest, theme, { highlight: !!run.highlight }));
        const deco = [run.underline ? "underline" : "", run.strike ? "line-through" : ""].filter(Boolean).join(" ");
        const ls = letterSpacingEm(run.letterSpacing ?? block.letterSpacing);
        const lsAttr = ls ? ` letter-spacing="${(ls * line.size).toFixed(3)}"` : "";
        return `<tspan fill="${escapeXml(fill)}" font-family="${escapeXml(run.glyphFallback ? `"${FALLBACK_FAMILY}", sans-serif` : metricCompatibleCss(run.fontFamily))}" font-weight="${role.bold || run.bold ? 700 : 400}" font-style="${!run.glyphFallback && (role.italic || run.italic) ? "italic" : "normal"}"${deco ? ` text-decoration="${deco}"` : ""}${lsAttr}>${escapeXml(run.text)}</tspan>`;
      })
      .join("");
    parts.push(
      `<text x="${x}" y="${baseline}" text-anchor="${anchor}" font-size="${line.size}" xml:space="preserve"${fadeAttr}>${tspans}</text>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${f.width}" height="${f.height}" viewBox="0 0 ${f.width} ${f.height}">
  <rect width="100%" height="100%" fill="${escapeXml(p.bg)}" />
  ${parts.join("\n  ")}
</svg>`;
}

/** SVG for each laid-out page (unit tests; no rasterisation). */
export function buildPagesSvg(snapshot: CalibratedSnapshot, options: PngBuildOptions = {}): string[] {
  const layout = layoutSnapshot(snapshot);
  const palette = paletteFor(options.exportTheme ?? snapshot.theme, options.resolvedColors?.accent);
  return layout.pages.map((page) => pageSvg(layout, page, palette));
}

/** SVG for the first laid-out page (unit tests; no rasterisation). */
export function buildPageSvg(snapshot: CalibratedSnapshot, options: PngBuildOptions = {}): string {
  return buildPagesSvg(snapshot, options)[0];
}

/** One PNG per page of the shared layout (`layoutPngPages`). */
export async function buildPngPages(
  snapshot: CalibratedSnapshot,
  options: PngBuildOptions = {},
): Promise<Buffer[]> {
  const layout = layoutSnapshot(snapshot);
  const palette = paletteFor(options.exportTheme ?? snapshot.theme, options.resolvedColors?.accent);
  return Promise.all(
    layout.pages.map((page) => sharp(Buffer.from(pageSvg(layout, page, palette))).png().toBuffer()),
  );
}

/** First page only (single-image callers). */
export async function buildPng(
  snapshot: CalibratedSnapshot,
  options: PngBuildOptions = {},
): Promise<Buffer> {
  return (await buildPngPages(snapshot, options))[0];
}

/** Zip of numbered pages: `<stem>-01.png`, `<stem>-02.png` … */
export async function zipPngPages(pages: readonly Buffer[], stem: string): Promise<Buffer> {
  const zip = new JSZip();
  const pad = Math.max(2, String(pages.length).length);
  pages.forEach((buf, i) => zip.file(`${stem}-${String(i + 1).padStart(pad, "0")}.png`, buf));
  return zip.generateAsync({ type: "nodebuffer" });
}
