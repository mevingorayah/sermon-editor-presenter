import PptxGenJS from "pptxgenjs";
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
  chunkRuns,
} from "./contentWalk";
import { docxFontName } from "./fonts";
import { isPaperTarget } from "./margins";

export interface PptxBuildOptions {
  resolvedColors?: { accent: string };
}

interface Section {
  heading: string;
  blocks: StyledBlock[];
}

function groupSections(blocks: StyledBlock[]): {
  title: string;
  sections: Section[];
  preamble: StyledBlock[];
} {
  let title = "";
  const preamble: StyledBlock[] = [];
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const block of blocks) {
    if (block.type === "Title") {
      title = block.runs.map((r) => r.text).join("").trim() || title;
      continue;
    }
    if (block.type === "H1" || block.type === "H2") {
      current = {
        heading: block.runs.map((r) => r.text).join("").trim() || "Section",
        blocks: [],
      };
      sections.push(current);
      continue;
    }
    if (current) {
      current.blocks.push(block);
    } else {
      preamble.push(block);
    }
  }

  return { title, sections, preamble };
}

function runsToPptxText(
  runs: StyledRun[],
  opts: {
    fontSize: number;
    defaultColor: string;
    forceItalic?: boolean;
    bold?: boolean;
  },
): PptxGenJS.TextProps[] {
  return runs.map((run) => ({
    text: run.text,
    options: {
      fontSize: opts.fontSize,
      fontFace: docxFontName(run.fontFamily),
      bold: opts.bold || run.bold,
      italic: opts.forceItalic || run.italic,
      underline: run.underline ? { style: "sng" } : undefined,
      strike: run.strike ? "sngStrike" : undefined,
      color: (run.color || opts.defaultColor).replace(/^#/, ""),
      highlight: run.highlight
        ? HIGHLIGHT_AMBER.replace(/^#/, "")
        : undefined,
    },
  }));
}

/**
 * PPTX: Title slide + one slide per H1 section.
 * Notes ignored for PPTX v1.
 */
export async function buildPptx(
  snapshot: CalibratedSnapshot,
  options: PptxBuildOptions = {},
): Promise<Buffer> {
  const blocks = styledBlocksFromSnapshot(snapshot);
  const { title: fromBlocks, sections, preamble } = groupSections(blocks);
  const title = fromBlocks || titleTextFromSnapshot(snapshot);
  const paper = isPaperTarget(String(snapshot.target));
  const light = paper || snapshot.theme === "light";
  const accent =
    toHexRgb(options.resolvedColors?.accent) ||
    (light ? DEFAULT_ACCENT_LIGHT : DEFAULT_ACCENT_DARK);
  const bg = light ? "F7F4EF" : "1A1A1A";
  const fg = light ? "111111" : "F0EDE6";
  const muted = light ? "555555" : "A8A29A";

  const pptx = new PptxGenJS();
  pptx.author = "sermon-editor-presenter";
  pptx.title = title;
  pptx.subject = `Calibrated export target=${snapshot.target}`;

  // Prefer 16:9 for screen targets; letter-ish for paper still uses widescreen for v1 simplicity.
  pptx.defineLayout({ name: "CAL", width: 13.333, height: 7.5 });
  pptx.layout = "CAL";

  // Title slide
  {
    const slide = pptx.addSlide();
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
      fill: { color: bg },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.15,
      h: "100%",
      fill: { color: accent.replace(/^#/, "") },
    });
    slide.addText(title, {
      x: 0.8,
      y: 2.6,
      w: 11.5,
      h: 1.2,
      fontSize: 40,
      bold: true,
      color: accent.replace(/^#/, ""),
      fontFace: "Georgia",
    });
    if (preamble.length > 0) {
      const preview = preamble
        .slice(0, 2)
        .map((b) => b.runs.map((r) => r.text).join(""))
        .join(" ");
      slide.addText(preview.slice(0, 240), {
        x: 0.8,
        y: 4.0,
        w: 11.5,
        h: 1.5,
        fontSize: 16,
        color: muted,
        fontFace: "Calibri",
      });
    }
  }

  // If no H1 sections, put remaining body on one content slide
  const preambleChars = preamble.reduce(
    (n, b) => n + b.runs.reduce((m, r) => m + r.text.length, 0),
    0,
  );
  if (sections.length > 0 && preambleChars > 240) {
    sections.unshift({ heading: title, blocks: preamble });
  }
  const slidesToBuild: Section[] =
    sections.length > 0
      ? sections
      : preamble.length > 0
        ? [{ heading: title, blocks: preamble }]
        : [];

  // Every block is placed; long sections continue on extra slides and long
  // paragraphs are split at sentence ends, so no text is ever dropped.
  const CHARS_PER_LINE = 95; // 16 pt on a 12 in text box
  const LINE_IN = 0.3;
  const TOP = 1.2;
  const BOTTOM = 7.0;
  const MAX_CHUNK = CHARS_PER_LINE * Math.floor((BOTTOM - TOP) / LINE_IN - 2);

  const newSlide = (heading: string) => {
    const slide = pptx.addSlide();
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: bg } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.15, h: "100%", fill: { color: accent.replace(/^#/, "") } });
    slide.addText(heading, {
      x: 0.6, y: 0.35, w: 12, h: 0.7, fontSize: 28, bold: true,
      color: accent.replace(/^#/, ""), fontFace: "Georgia",
    });
    return slide;
  };
  const heightOf = (chars: number) =>
    Math.max(1, Math.ceil(chars / CHARS_PER_LINE)) * LINE_IN + 0.1;

  for (const section of slidesToBuild) {
    let slide = newSlide(section.heading);
    let y = TOP;
    const room = (h: number) => {
      if (y + h > BOTTOM && y > TOP) {
        slide = newSlide(section.heading);
        y = TOP;
      }
    };
    for (const block of section.blocks) {
      if (block.type === "Caption") {
        const plain = block.runs.map((r) => r.text).join("");
        room(0.4);
        slide.addText(plain, { x: 0.6, y, w: 12, h: 0.35, fontSize: 12, color: muted, align: "right", fontFace: "Calibri" });
        y += 0.4;
        continue;
      }
      const scripture = block.type === "Scripture";
      for (const chunk of chunkRuns(block.runs, MAX_CHUNK)) {
        const h = heightOf(chunk.map((r) => r.text).join("").length);
        room(h);
        slide.addText(
          runsToPptxText(chunk, {
            fontSize: 16,
            defaultColor: `#${fg}`,
            forceItalic: scripture,
            bold: block.type === "H1",
          }),
          { x: 0.6, y, w: 12, h, valign: "top", align: block.align },
        );
        y += h + 0.1;
      }
      if (scripture && block.citation) {
        room(0.4);
        slide.addText(citationCaps(block.citation), {
          x: 0.6, y, w: 12, h: 0.35, fontSize: 12, color: muted, align: "right", fontFace: "Calibri",
        });
        y += 0.45;
      }
    }
  }

  // Always at least title slide; if no sections and no preamble, title alone is fine.
  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return Buffer.from(out);
}
