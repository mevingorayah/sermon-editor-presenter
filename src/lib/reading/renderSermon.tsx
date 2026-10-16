/** @jsxRuntime automatic */
import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { JSONContent } from "@tiptap/react";
import { bionicParts } from "@/lib/bionic";
import { readingHighlightColor, readingTextColor } from "./contrast";
import {
  HIGHLIGHT_PRESETS,
  SCRIPT_NO_BIONIC_MAX,
  TEXT_PRESETS,
  findPreset,
  fontFamilyCss,
  fontSizeCss,
} from "@/lib/marks/presets";

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
    | "citation",
    string
  >
>;

export interface RenderOptions {
  bionic: boolean;
  theme: "light" | "dark";
  classes?: ReadingClassNames;
}

interface Ctx extends RenderOptions {
  classes: ReadingClassNames;
  /** Bionic disabled for this subtree (Scripture). */
  plain: boolean;
}

/** Every node/mark type this renderer handles explicitly (see drift test). */
export const RENDERED_NODES = [
  "doc", "paragraph", "text", "title", "heading", "scripture", "bulletList",
  "orderedList", "listItem", "hardBreak", "horizontalRule",
  // Disabled in the sermon schema but rendered if old docs contain them.
  "blockquote", "codeBlock",
];
export const RENDERED_MARKS = [
  "bold", "italic", "underline", "strike", "code", "link", "textStyle",
  "highlight", "superscript", "subscript",
];

const TEXT_ALIGNS = new Set(["left", "center", "right", "justify"]);

export function textAlignOf(node: JSONContent): CSSProperties["textAlign"] | undefined {
  const v = node.attrs?.textAlign;
  return typeof v === "string" && TEXT_ALIGNS.has(v)
    ? (v as CSSProperties["textAlign"])
    : undefined;
}

function alignStyle(node: JSONContent): CSSProperties | undefined {
  const a = textAlignOf(node);
  return a ? { textAlign: a } : undefined;
}

const SAFE_HREF = /^(https?:|mailto:|tel:|#|\/)/i;

function bionicLeaf(text: string): ReactNode {
  return bionicParts(text).map((part, i) =>
    part.bold ? (
      <strong key={i} data-bionic="">
        {part.text}
      </strong>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}

function graphemeCount(text: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)).length;
  }
  return text.match(/\P{M}\p{M}*/gu)?.length ?? 0;
}

/**
 * Bionic is skipped for: Scripture (ctx.plain); text the writer already
 * bolded (A3: nothing is added inside user bold); and short superscript /
 * subscript runs such as verse numbers or "1er" (MK4).
 */
function bionicApplies(text: string, marks: { type: string }[], ctx: Ctx): boolean {
  if (!ctx.bionic || ctx.plain) return false;
  if (marks.some((m) => m.type === "bold")) return false;
  if (
    marks.some((m) => m.type === "superscript" || m.type === "subscript") &&
    graphemeCount(text.trim()) <= SCRIPT_NO_BIONIC_MAX
  ) {
    return false;
  }
  return true;
}

function renderText(node: JSONContent, ctx: Ctx, key: string): ReactNode {
  const text = node.text ?? "";
  const marks = node.marks ?? [];
  let out: ReactNode = bionicApplies(text, marks, ctx) ? bionicLeaf(text) : text;
  // Wrap innermost-last so marks[0] is the outermost element, like ProseMirror.
  for (let i = marks.length - 1; i >= 0; i--) {
    out = wrapMark(marks[i], out, ctx, i);
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
    case "superscript":
      return <sup key={i}>{children}</sup>;
    case "subscript":
      return <sub key={i}>{children}</sub>;
    case "textStyle": {
      const style: CSSProperties = {};
      if (typeof attrs.color === "string" && attrs.color) {
        const preset = findPreset(TEXT_PRESETS, attrs.preset, attrs.color);
        style.color =
          preset && ctx.theme === "dark" ? preset.dark : readingTextColor(attrs.color, ctx.theme);
      }
      const family = fontFamilyCss(attrs.fontFamily);
      if (family) style.fontFamily = family;
      const size = fontSizeCss(attrs.fontSize);
      if (size) style.fontSize = size;
      return Object.keys(style).length ? (
        <span key={i} style={style}>{children}</span>
      ) : (
        <Fragment key={i}>{children}</Fragment>
      );
    }
    case "highlight": {
      const color = typeof attrs.color === "string" && attrs.color ? attrs.color : null;
      const preset = findPreset(HIGHLIGHT_PRESETS, attrs.preset, color);
      const bg = preset
        ? ctx.theme === "dark" ? preset.dark : preset.light
        : color ? readingHighlightColor(color, ctx.theme) : null;
      return (
        <mark
          key={i}
          className="sermon-highlight"
          data-color={color ?? undefined}
          style={bg ? { backgroundColor: bg } : undefined}
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
      // below the quote (slice 1 spec, Align). Scripture never gets bionic.
      return (
        <figure key={key} className={c.scripture} data-scripture="" style={alignStyle(node)}>
          <blockquote className={c.quoteBlock}>
            <p className={c.quote}>{children(node, { ...ctx, plain: true })}</p>
          </blockquote>
          {citation ? (
            <figcaption className={c.citation}>
              <cite>{citation}</cite>
            </figcaption>
          ) : null}
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
  const ctx: Ctx = { ...opts, classes: opts.classes ?? {}, plain: false };
  return (content.content ?? []).map((n, i) => renderNode(n, ctx, `${n.type}-${i}`));
}
