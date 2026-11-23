/** @jsxRuntime automatic */
import { FIELD, blockCss, sanitizeSpacing, sanitizeStyle, type BlockSpacing, type BlockStyle } from "../builder/blockAttrs";
import { effectiveBlockSizePt } from "../sermon/blockStyle";
import { cssTextToReactStyle } from "../cssText";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { JSONContent } from "@tiptap/react";
import { bionicParts } from "@/lib/bionic";
import { displayHighlightColor, displayTextColor } from "./contrast";
import { FORMAT_THEME, type FormatTheme } from "@/lib/sermon/export/frames";
import {
  VERSE_SNIPPET_FONT_FAMILY,
  currentPassageText,
  normalizeAttrs,
  translationLabel,
} from "@/lib/sermon/verseSnippet";

/**
 * Preach renderer: walks the sermon's ProseMirror JSON (the shared schema in
 * src/extensions/schema.ts) and emits the same elements Edit's renderHTML
 * produces for every node and mark. Bionic reading is a layer applied inside
 * each text leaf, *under* the user's marks, so it can only add weight.
 */

export type ReadingClassNames = Partial<
  Record<
    | "title"
    | "h1"
    | "h2"
    | "body"
    | "list"
    | "listItem"
    | "rule"
    | "scripture"
    | "quoteBlock"
    | "quote"
    | "citation"
    | "verseBar"
    | "cue"
    | "titleSub",
    string
  >
>;

export interface RenderOptions {
  bionic: boolean;
  /** 0.1–1; ignored when bionic is off. Default 0.45. */
  bionicStrength?: number;
  theme: "light" | "dark";
  /** #43 format group: print vs screen-dark. Overrides theme when set. */
  formatTheme?: FormatTheme;
  classes?: ReadingClassNames;
}

interface Ctx extends RenderOptions {
  classes: ReadingClassNames;
  /** Bionic disabled for this subtree (code blocks). */
  plain: boolean;
  /** Background behind the current text run (highlight or page). */
  textBg?: string;
  formatTheme: FormatTheme;
}

/** Every node/mark type this renderer handles explicitly (see drift test). */
export const RENDERED_NODES = [
  "doc", "paragraph", "text", "title", "heading", "scripture", "verseSnippet", "bulletList",
  "orderedList", "listItem", "hardBreak", "horizontalRule",
  // Disabled in the sermon schema but rendered if old docs contain them.
  "blockquote", "codeBlock",
  // Block builder.
  "quote", "illustration", "section", "column",
];
export const RENDERED_MARKS = [
  "bold", "italic", "underline", "strike", "code", "link", "textStyle",
  "highlight",
];

/** Stage-cue colour: cues like [Pause.] are italic text in this grey (Edit's grey swatch). */
export const CUE_COLOR = "#5c5c5c";

/** A text run is a stage cue when it is italic and coloured CUE_COLOR. */
export function isCueRun(node: JSONContent): boolean {
  const marks = node.marks ?? [];
  const italic = marks.some((m) => m.type === "italic");
  const grey = marks.some(
    (m) =>
      m.type === "textStyle" &&
      typeof m.attrs?.color === "string" &&
      m.attrs.color.trim().toLowerCase() === CUE_COLOR,
  );
  return italic && grey;
}

/**
 * The line right under the title (e.g. "Éphésiens 1.3–7 …") when it is a short
 * paragraph: Preach shows it as the title block's Scripture line.
 */
export function isTitleSubline(prev: JSONContent | undefined, node: JSONContent): boolean {
  if (prev?.type !== "title" || node.type !== "paragraph") return false;
  const text = (node.content ?? []).map((c) => c.text ?? "").join("");
  return text.trim().length > 0 && text.length <= 160;
}

const TEXT_ALIGNS = new Set(["left", "center", "right", "justify"]);

export function textAlignOf(node: JSONContent): CSSProperties["textAlign"] | undefined {
  const v = node.attrs?.textAlign;
  return typeof v === "string" && TEXT_ALIGNS.has(v)
    ? (v as CSSProperties["textAlign"])
    : undefined;
}

function spacingStyle(attrs: Record<string, unknown> | undefined): CSSProperties {
  const style: CSSProperties = {};
  const ls = attrs?.letterSpacing;
  const lh = attrs?.lineSpacing;
  if (typeof ls === "string" && ls) style.letterSpacing = ls;
  else if (typeof ls === "number") style.letterSpacing = `${ls}em`;
  if (typeof lh === "string" && lh) style.lineHeight = lh;
  else if (typeof lh === "number") style.lineHeight = lh;
  return style;
}

function builderStyle(node: JSONContent): CSSProperties | undefined {
  const st = node.attrs?.[FIELD.style] as BlockStyle | null | undefined;
  const sp = node.attrs?.[FIELD.spacing] as BlockSpacing | null | undefined;
  if (!st && !sp) return undefined;
  const style = sanitizeStyle(st);
  const shown = style?.size !== undefined ? { ...style, size: effectiveBlockSizePt(style) } : style;
  return cssTextToReactStyle(blockCss(shown, sanitizeSpacing(sp)));
}

function alignStyle(node: JSONContent): CSSProperties | undefined {
  const a = textAlignOf(node);
  const style: CSSProperties = { ...spacingStyle(node.attrs), ...builderStyle(node) };
  if (a) style.textAlign = a;
  return Object.keys(style).length ? style : undefined;
}

const SAFE_HREF = /^(https?:|mailto:|tel:|#|\/)/i;

function bionicLeaf(text: string, inBold: boolean, strength?: number): ReactNode {
  return bionicParts(text, strength).map((part, i) => {
    if (!part.bold) return <span key={i}>{part.text}</span>;
    // Inside a user bold mark, bionic adds weight contrast instead of a
    // second <strong>, so the user's bold is never replaced.
    return inBold ? (
      <span key={i} data-bionic="" style={{ fontWeight: 800 }}>
        {part.text}
      </span>
    ) : (
      <strong key={i} data-bionic="">
        {part.text}
      </strong>
    );
  });
}

function renderText(node: JSONContent, ctx: Ctx, key: string): ReactNode {
  const text = node.text ?? "";
  const marks = node.marks ?? [];
  const inBold = marks.some((m) => m.type === "bold");
  const hl = marks.find((m) => m.type === "highlight");
  const hlColor = typeof hl?.attrs?.color === "string" && hl.attrs.color ? hl.attrs.color : null;
  const hlPreset = typeof hl?.attrs?.preset === "string" ? hl.attrs.preset : null;
  const fmt = ctx.formatTheme;
  const pageBg = FORMAT_THEME[fmt].pageBackground;
  ctx = {
    ...ctx,
    textBg: hl
      ? displayHighlightColor(hlColor || "#FFF176", fmt)
      : pageBg,
  };
  let out: ReactNode =
    ctx.bionic && !ctx.plain ? bionicLeaf(text, inBold, ctx.bionicStrength) : text;
  // Wrap innermost-last so marks[0] is the outermost element, like ProseMirror.
  for (let i = marks.length - 1; i >= 0; i--) {
    out = wrapMark(marks[i], out, ctx, i);
  }
  if (isCueRun(node)) {
    // Stays inline, exactly where it was written; only its look changes.
    return (
      <span key={key} className={ctx.classes.cue} data-cue="">
        {out}
      </span>
    );
  }
  return <Fragment key={key}>{out}</Fragment>;
}

function wrapMark(
  mark: { type: string; attrs?: Record<string, unknown> },
  children: ReactNode,
  ctx: Ctx,
  i: number,
): ReactNode {
  const attrs = mark.attrs ?? {};
  switch (mark.type) {
    case "bold":
      return <strong key={i}>{children}</strong>;
    case "italic":
      return <em key={i}>{children}</em>;
    case "underline":
      return <u key={i}>{children}</u>;
    case "strike":
      return <s key={i}>{children}</s>;
    case "code":
      return <code key={i}>{children}</code>;
    case "link": {
      const href = typeof attrs.href === "string" && SAFE_HREF.test(attrs.href)
        ? attrs.href
        : undefined;
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer nofollow">
          {children}
        </a>
      );
    }
    case "textStyle": {
      const style: CSSProperties = {};
      if (typeof attrs.color === "string" && attrs.color) {
        style.color = displayTextColor(
          attrs.color,
          ctx.textBg ?? FORMAT_THEME[ctx.formatTheme].pageBackground,
          ctx.formatTheme,
          { highlight: !!ctx.textBg && ctx.textBg !== FORMAT_THEME[ctx.formatTheme].pageBackground },
        );
      }
      if (typeof attrs.fontFamily === "string" && attrs.fontFamily) {
        style.fontFamily = attrs.fontFamily;
      }
      if (typeof attrs.fontSize === "string" && attrs.fontSize) {
        style.fontSize = attrs.fontSize;
      }
      Object.assign(style, spacingStyle(attrs));
      return Object.keys(style).length ? (
        <span key={i} style={style}>{children}</span>
      ) : (
        <Fragment key={i}>{children}</Fragment>
      );
    }
    case "highlight": {
      const color = typeof attrs.color === "string" && attrs.color ? attrs.color : null;
      const preset = typeof attrs.preset === "string" ? attrs.preset : null;
      return (
        <mark
          key={i}
          className="sermon-highlight"
          data-color={color ?? undefined}
          style={{
            ...(color ? { backgroundColor: displayHighlightColor(color, ctx.formatTheme) } : {}),
            ...(ctx.formatTheme === "screen-dark" ? { color: FORMAT_THEME.print.text } : {}),
          }}
        >
          {children}
        </mark>
      );
    }
    default:
      // Unknown mark: keep the text.
      return <Fragment key={i}>{children}</Fragment>;
  }
}

function children(node: JSONContent, ctx: Ctx): ReactNode {
  return (node.content ?? []).map((c, i) => renderNode(c, ctx, `${c.type}-${i}`));
}

export function renderNode(node: JSONContent, ctx: Ctx, key: string): ReactNode {
  const c = ctx.classes;
  switch (node.type) {
    case "text":
      return renderText(node, ctx, key);
    case "doc":
      return <Fragment key={key}>{children(node, ctx)}</Fragment>;
    case "title":
      return (
        <h1 key={key} className={c.title} data-sermon-title="" style={alignStyle(node)}>
          {children(node, ctx)}
        </h1>
      );
    case "heading": {
      const level = node.attrs?.level === 2 ? 2 : 1;
      const Tag = level === 1 ? "h2" : "h3";
      return (
        <Tag key={key} className={level === 1 ? c.h1 : c.h2} style={alignStyle(node)}>
          {children(node, ctx)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={key} className={c.body} style={alignStyle(node)}>
          {children(node, ctx)}
        </p>
      );
    case "bulletList":
      return (
        <ul key={key} className={c.list}>
          {children(node, ctx)}
        </ul>
      );
    case "orderedList": {
      const start = typeof node.attrs?.start === "number" ? node.attrs.start : undefined;
      return (
        <ol key={key} className={c.list} start={start !== 1 ? start : undefined}>
          {children(node, ctx)}
        </ol>
      );
    }
    case "listItem":
      return (
        <li key={key} className={c.listItem}>
          {children(node, ctx)}
        </li>
      );
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} className={c.rule} />;
    case "quote":
      return (
        <blockquote key={key} className="sermon-quote" data-quote="" style={alignStyle(node)}>
          {children(node, ctx)}
        </blockquote>
      );
    case "illustration":
      return (
        <div key={key} className="sermon-illustration" data-illustration="" style={alignStyle(node)}>
          {children(node, ctx)}
        </div>
      );
    case "section":
      return (
        <section key={key} className="sermon-section" data-section="" data-columns={String(node.attrs?.columns ?? 1)} style={alignStyle(node)}>
          {children(node, ctx)}
        </section>
      );
    case "column":
      return (
        <div key={key} className="sermon-column" data-column="">
          {children(node, ctx)}
        </div>
      );
    case "blockquote":
      return <blockquote key={key}>{children(node, ctx)}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children(node, { ...ctx, plain: true })}</code>
        </pre>
      );
    case "scripture": {
      const citation = typeof node.attrs?.citation === "string" ? node.attrs.citation : "";
      // Body follows the node's TextAlign; the citation is always caption-right
      // below the quote (slice 1 spec, Align). Scripture quote body is Bionic when on.
      return (
        <figure key={key} className={c.scripture} data-scripture="" style={alignStyle(node)}>
          <blockquote className={c.quoteBlock}>
            <p className={c.quote}>{children(node, { ...ctx, plain: false })}</p>
          </blockquote>
          {citation ? (
            <figcaption className={c.citation}>
              <cite>{citation}</cite>
            </figcaption>
          ) : null}
        </figure>
      );
    }
    case "verseSnippet": {
      const attrs = normalizeAttrs(node.attrs);
      const text = currentPassageText(attrs);
      const citation = [attrs.ref, translationLabel(attrs.translation)]
        .filter(Boolean)
        .join(" · ");
      const built = alignStyle(node) ?? {};
      // Keep the snippet's serif face unless the writer overrode the block font.
      const fontFamily = built.fontFamily ?? VERSE_SNIPPET_FONT_FAMILY;
      const style = { ...built, fontFamily };
      return (
        <figure key={key} className={c.scripture} data-verse-snippet="" style={style}>
          {citation ? (
            <div className={c.verseBar} data-verse-bar="">
              <cite>{citation}</cite>
            </div>
          ) : null}
          <blockquote className={c.quoteBlock}>
            <p className={c.quote} style={{ fontFamily }}>
              {text}
            </p>
          </blockquote>
        </figure>
      );
    }
    default:
      // Unknown node: render its children instead of dropping them.
      return <Fragment key={key}>{children(node, ctx)}</Fragment>;
  }
}

/** Render the blocks of a sermon document for Preach. */
export function renderSermon(content: JSONContent, opts: RenderOptions): ReactNode {
  const formatTheme = opts.formatTheme ?? (opts.theme === "dark" ? "screen-dark" : "print");
  const ctx: Ctx = { ...opts, formatTheme, classes: opts.classes ?? {}, plain: false };
  const blocks = content.content ?? [];
  return blocks.map((n, i) => {
    if (isTitleSubline(blocks[i - 1], n)) {
      return (
        <p key={`${n.type}-${i}`} className={ctx.classes.titleSub} data-title-sub="" style={alignStyle(n)}>
          {children(n, ctx)}
        </p>
      );
    }
    return renderNode(n, ctx, `${n.type}-${i}`);
  });
}
