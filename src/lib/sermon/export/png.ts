import sharp from "sharp";
import type { CalibratedSnapshot } from "@/types/document";
import { HIGHLIGHT_AMBER, toHexRgb } from "./colors";
import {
  styledBlocksFromSnapshot,
  titleTextFromSnapshot,
  type StyledBlock,
  type StyledRun,
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

/**
 * v1: single PNG of calibrated content at preview aspect (sharp + SVG).
 * Notes are ignored for PNG (slice 2).
 */
export async function buildPng(
  snapshot: CalibratedSnapshot,
  options: PngBuildOptions = {},
): Promise<Buffer> {
  const target = String(snapshot.target);
  const { width, height } = frameSizeFor(target);
  const margins = resolveMargins(snapshot.margins, target);
  // Convert inch margins to px roughly using width / pageWidthInches
  const pageW =
    target.startsWith("paper-") || target === "tablet-portrait"
      ? width
      : width;
  const mx = Math.max(24, Math.round(margins.left * (pageW / 13.3)));
  const my = Math.max(24, Math.round(margins.top * (pageW / 13.3)));
  const binder = Math.round(margins.binderGutter * (pageW / 13.3));

  const paper = isPaperTarget(target);
  const light = paper || snapshot.theme === "light";
  const bg = light ? "#F7F4EF" : "#1A1A1A";
  const fg = light ? "#111111" : "#F0EDE6";
  const muted = light ? "#555555" : "#A8A29A";
  const accent =
    toHexRgb(options.resolvedColors?.accent) ||
    (light ? "#8B6914" : "#C4A35A");

  // PNG ignores includeNotes by contract.
  const blocks = styledBlocksFromSnapshot(snapshot);
  const title = titleTextFromSnapshot(snapshot);

  const contentWidth = width - mx * 2 - binder;
  const maxChars = Math.max(20, Math.floor(contentWidth / 11));

  let y = my + 8;
  const lines: string[] = [];

  // Accent bar
  lines.push(
    `<rect x="0" y="0" width="8" height="${height}" fill="${escapeXml(accent)}" />`,
  );

  const renderBlock = (block: StyledBlock) => {
    const role = blockRole(block.type);
    const color =
      block.type === "Title"
        ? accent
        : block.type === "Caption"
          ? muted
          : block.type === "H2"
            ? light
              ? "#222222"
              : "#D4CFC5"
            : fg;
    role.defaultColor = color;

    const plain = block.runs.map((r) => r.text).join("");
    const wrapped = wrapLines(plain, maxChars);
    const anchor =
      block.align === "center"
        ? "middle"
        : block.align === "right"
          ? "end"
          : "start";
    const x =
      block.align === "center"
        ? mx + binder + contentWidth / 2
        : block.align === "right"
          ? mx + binder + contentWidth
          : mx + binder;

    for (let i = 0; i < wrapped.length; i++) {
      if (y > height - my - 20) return;
      // For wrapped lines after the first, use plain text (marks lost on wrap — best-effort).
      if (i === 0 && wrapped.length === 1) {
        lines.push(
          `<text x="${x}" y="${y}" text-anchor="${anchor}">${runsToSvgTspans(block.runs, { size: role.size, defaultColor: color, forceItalic: role.forceItalic })}</text>`,
        );
      } else {
        const style = role.forceItalic ? "italic" : "normal";
        const weight =
          block.type === "Title" ||
          block.type === "H1" ||
          block.type === "H2"
            ? "700"
            : "400";
        lines.push(
          `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${escapeXml(color)}" font-size="${role.size}" font-weight="${weight}" font-style="${style}" font-family="${escapeXml(cssFontStack("sans"))}">${escapeXml(wrapped[i])}</text>`,
        );
      }
      y += role.size * snapshot.lineHeight;
    }

    if (block.citation) {
      y += 4;
      lines.push(
        `<text x="${mx + binder + contentWidth}" y="${y}" text-anchor="end" fill="${escapeXml(muted)}" font-size="14" font-family="${escapeXml(cssFontStack("serif"))}">${escapeXml(block.citation)}</text>`,
      );
      y += 18;
    }

    y += role.gap;
  };

  if (blocks.length === 0) {
    lines.push(
      `<text x="${mx + binder}" y="${y}" fill="${escapeXml(accent)}" font-size="42" font-weight="700" font-family="${escapeXml(cssFontStack("serif"))}">${escapeXml(title)}</text>`,
    );
  } else {
    for (const block of blocks) {
      if (y > height - my - 20) break;
      renderBlock(block);
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${escapeXml(bg)}" />
  ${lines.join("\n  ")}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
