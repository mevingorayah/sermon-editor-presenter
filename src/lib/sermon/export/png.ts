import sharp from "sharp";
import JSZip from "jszip";
import type { CalibratedSnapshot } from "@/types/document";
import {
  DEFAULT_ACCENT_DARK,
  DEFAULT_ACCENT_LIGHT,
  toHexRgb,
} from "./colors";
import { citationCaps, type StyledBlock, type StyledRun } from "./contentWalk";
import { layoutSnapshot, roleStyle, type PngPage, type SnapshotLayout } from "./pngLayout";
import { metricCompatibleCss } from "./textMeasure";

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

interface Palette {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  light: boolean;
}

/** Colours for a theme. Theme never affects layout. */
export function paletteFor(theme: "light" | "dark", accentIn?: string): Palette {
  const light = theme === "light";
  return {
    light,
    bg: light ? "#F7F4EF" : "#1A1A1A",
    fg: light ? "#111111" : "#F0EDE6",
    muted: light ? "#555555" : "#A8A29A",
    accent: toHexRgb(accentIn) || (light ? DEFAULT_ACCENT_LIGHT : DEFAULT_ACCENT_DARK),
  };
}

export function blockColor(type: StyledBlock["type"], p: Palette): string {
  if (type === "Title") return p.accent;
  if (type === "Caption") return p.muted;
  if (type === "H2") return p.light ? "#222222" : "#D4CFC5";
  return p.fg;
}

function pageSvg(layout: SnapshotLayout, page: PngPage, p: Palette): string {
  const { frame: f, styled } = layout;
  const parts: string[] = [
    `<rect x="0" y="0" width="8" height="${f.height}" fill="${escapeXml(p.accent)}" />`,
  ];
  for (const line of page.lines) {
    const block = styled[line.blockIndex];
    const baseline = (line.y + line.size).toFixed(2);
    if (line.kind === "citation") {
      parts.push(
        `<text x="${f.left + f.contentWidth}" y="${baseline}" text-anchor="end" fill="${escapeXml(p.muted)}" font-size="${line.size}" font-family="${escapeXml(metricCompatibleCss("serif"))}">${escapeXml(citationCaps(block.citation ?? ""))}</text>`,
      );
      continue;
    }
    const role = roleStyle(block.type);
    const color = blockColor(block.type, p);
    const anchor = block.align === "center" ? "middle" : block.align === "right" ? "end" : "start";
    const x =
      block.align === "center" ? f.left + f.contentWidth / 2
        : block.align === "right" ? f.left + f.contentWidth
          : f.left;
    const tspans = trimRunsEnd(sliceRuns(block.runs, line.start, line.end))
      .map((run) => {
        const fill = run.highlight ? "#6B5A1E" : run.color || color;
        const deco = [run.underline ? "underline" : "", run.strike ? "line-through" : ""].filter(Boolean).join(" ");
        return `<tspan fill="${escapeXml(fill)}" font-family="${escapeXml(metricCompatibleCss(run.fontFamily))}" font-weight="${role.bold || run.bold ? 700 : 400}" font-style="${role.italic || run.italic ? "italic" : "normal"}"${deco ? ` text-decoration="${deco}"` : ""}>${escapeXml(run.text)}</tspan>`;
      })
      .join("");
    parts.push(
      `<text x="${x}" y="${baseline}" text-anchor="${anchor}" font-size="${line.size}" xml:space="preserve">${tspans}</text>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${f.width}" height="${f.height}" viewBox="0 0 ${f.width} ${f.height}">
  <rect width="100%" height="100%" fill="${escapeXml(p.bg)}" />
  ${parts.join("\n  ")}
</svg>`;
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
