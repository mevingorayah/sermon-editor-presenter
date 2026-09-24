import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Strip junk on paste: Word/Google Docs styles, scripts, comments, empty spans.
 * Keeps plain structure TipTap can map (paragraphs, headings, basic marks).
 */
function cleanHtml(html: string): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  doc
    .querySelectorAll("script, style, meta, link, xml, o\\:p, w\\:sdt")
    .forEach((el) => el.remove());

  doc.querySelectorAll("*").forEach((el) => {
    // Strip Word/Google class noise and inline style bags
    el.removeAttribute("style");
    el.removeAttribute("class");
    el.removeAttribute("lang");
    el.removeAttribute("dir");
    // Remove mso / office namespaces attrs
    [...el.attributes].forEach((attr) => {
      if (
        attr.name.startsWith("data-") ||
        attr.name.includes(":") ||
        attr.name === "id"
      ) {
        // keep data-citation / data-scripture / data-sermon-title
        if (
          attr.name === "data-citation" ||
          attr.name === "data-scripture" ||
          attr.name === "data-sermon-title"
        ) {
          return;
        }
        if (attr.name.startsWith("data-") || attr.name.includes(":")) {
          el.removeAttribute(attr.name);
        }
        if (attr.name === "id") el.removeAttribute("id");
      }
    });
  });

  // Unwrap empty spans/fonts
  doc.querySelectorAll("span, font").forEach((el) => {
    if (!el.attributes.length) {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }
  });

  return doc.body.innerHTML;
}

function cleanText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

export const PasteCleanup = Extension.create({
  name: "pasteCleanup",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("pasteCleanup"),
        props: {
          transformPastedHTML(html) {
            return cleanHtml(html);
          },
          transformPastedText(text) {
            return cleanText(text);
          },
        },
      }),
    ];
  },
});
