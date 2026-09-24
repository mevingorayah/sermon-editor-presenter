import PptxGenJS from "pptxgenjs";
import type { CalibratedSnapshot } from "@/types/document";
import { HIGHLIGHT_AMBER, toHexRgb } from "./colors";
import {
  styledBlocksFromSnapshot,
  titleTextFromSnapshot,
  type StyledBlock,
  type StyledRun,
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
    if (block.type === "H1") {
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
  const accent =
    toHexRgb(options.resolvedColors?.accent) || "#8B6914";
  const paper = isPaperTarget(String(snapshot.target));
  const light = paper || snapshot.theme === "light";
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
  const slidesToBuild: Section[] =
    sections.length > 0
      ? sections
      : preamble.length > 0
        ? [{ heading: title, blocks: preamble }]
        : [];

  for (const section of slidesToBuild) {
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

    slide.addText(section.heading, {
      x: 0.6,
      y: 0.35,
      w: 12,
      h: 0.7,
      fontSize: 28,
      bold: true,
      color: accent.replace(/^#/, ""),
      fontFace: "Georgia",
    });

    let y = 1.2;
    for (const block of section.blocks) {
      if (y > 6.8) break;
      const plain = block.runs.map((r) => r.text).join("");
      if (block.type === "H2") {
        slide.addText(
          runsToPptxText(block.runs, {
            fontSize: 20,
            defaultColor: `#${fg}`,
            bold: true,
          }),
          { x: 0.6, y, w: 12, h: 0.45, valign: "top" },
        );
        y += 0.5;
      } else if (block.type === "Scripture") {
        slide.addText(
          runsToPptxText(block.runs, {
            fontSize: 16,
            defaultColor: `#${fg}`,
            forceItalic: true,
          }),
          { x: 0.6, y, w: 12, h: 0.8, valign: "top" },
        );
        y += 0.7;
        if (block.citation) {
          slide.addText(block.citation, {
            x: 0.6,
            y,
            w: 12,
            h: 0.35,
            fontSize: 12,
            color: muted,
            align: "right",
            fontFace: "Calibri",
          });
          y += 0.4;
        }
      } else if (block.type === "Caption") {
        slide.addText(plain, {
          x: 0.6,
          y,
          w: 12,
          h: 0.35,
          fontSize: 12,
          color: muted,
          align: "right",
          fontFace: "Calibri",
        });
        y += 0.4;
      } else {
        const approxLines = Math.max(1, Math.ceil(plain.length / 90));
        const h = Math.min(2.2, 0.35 * approxLines);
        slide.addText(
          runsToPptxText(block.runs, {
            fontSize: 16,
            defaultColor: `#${fg}`,
          }),
          { x: 0.6, y, w: 12, h, valign: "top" },
        );
        y += h + 0.15;
      }
    }
  }

  // Always at least title slide; if no sections and no preamble, title alone is fine.
  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return Buffer.from(out);
}
