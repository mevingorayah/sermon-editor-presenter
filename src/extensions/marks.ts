import { Extension } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Strike from "@tiptap/extension-strike";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import { fontFamilyCss, fontIdOf, fontSizeCss, fontSizePt } from "@/lib/marks/presets";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sermonTextStyle: {
      /** Store a FontId (e.g. "lora"); rendered via fontFamilyCss. */
      setFontId: (fontId: string) => ReturnType;
      unsetFontId: () => ReturnType;
      /** Store a size in pt (8–96). */
      setFontSizePt: (pt: number | string) => ReturnType;
      unsetFontSizePt: () => ReturnType;
      /** Text colour plus optional preset id (dark variant lookup in Preach). */
      setTextColor: (color: string, preset?: string | null) => ReturnType;
    };
  }
}

/**
 * fontFamily (FontId), fontSize (pt) and colour preset attributes on
 * textStyle. Replaces @tiptap FontFamily so the stored value is a FontId and
 * the rendered CSS is the same stack Preach uses.
 */
export const SermonTextStyle = Extension.create({
  name: "sermonTextStyle",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-font") ?? (el.style.fontFamily ? fontIdOf(el.style.fontFamily) : null),
            renderHTML: (attrs) => {
              const css = fontFamilyCss(attrs.fontFamily);
              if (!css) return {};
              return { "data-font": fontIdOf(attrs.fontFamily) ?? undefined, style: `font-family: ${css}` };
            },
          },
          fontSize: {
            default: null,
            parseHTML: (el) => {
              const pt = fontSizePt(el.getAttribute("data-font-size"));
              return pt === null ? null : `${pt}pt`;
            },
            renderHTML: (attrs) => {
              const css = fontSizeCss(attrs.fontSize);
              return css ? { "data-font-size": String(fontSizePt(attrs.fontSize)), style: `font-size: ${css}` } : {};
            },
          },
          preset: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-color-preset"),
            renderHTML: (attrs) => (attrs.preset ? { "data-color-preset": attrs.preset } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontId:
        (fontId) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontFamily: fontId }).run(),
      unsetFontId:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontFamily: null }).removeEmptyTextStyle().run(),
      setFontSizePt:
        (pt) =>
        ({ chain }) => {
          const n = fontSizePt(pt);
          if (n === null) return false;
          return chain().setMark("textStyle", { fontSize: `${n}pt` }).run();
        },
      unsetFontSizePt:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
      setTextColor:
        (color, preset) =>
        ({ chain }) =>
          chain().setMark("textStyle", { color, preset: preset ?? null }).run(),
    };
  },
  addKeyboardShortcuts() {
    return {};
  },
});

/** Multicolour highlight storing { color, preset }. */
export const SermonHighlight = Highlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      preset: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-preset"),
        renderHTML: (attrs) => (attrs.preset ? { "data-preset": attrs.preset } : {}),
      },
    };
  },
}).configure({ multicolor: true, HTMLAttributes: { class: "sermon-highlight" } });

/** Strikethrough: Ctrl/Cmd+Shift+X (spec §4.16a), keeping TipTap's Mod-Shift-S. */
export const SermonStrike = Strike.extend({
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-x": () => this.editor.commands.toggleStrike(),
      "Mod-Shift-s": () => this.editor.commands.toggleStrike(),
    };
  },
});

/** MK2: superscript and subscript are mutually exclusive. */
export const SermonSuperscript = Superscript.extend({
  excludes: "subscript",
  addCommands() {
    return {
      ...this.parent?.(),
      setSuperscript:
        () =>
        ({ state, tr, dispatch }) => {
          const { from, to } = state.selection;
          if (dispatch) {
            tr.removeMark(from, to, state.schema.marks.subscript);
            tr.addMark(from, to, state.schema.marks.superscript.create());
          }
          return true;
        },
      toggleSuperscript:
        () =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.marks.superscript, other = state.schema.marks.subscript;
          const { from, to, empty } = state.selection;
          if (empty) {
            const stored = (state.storedMarks ?? state.selection.$from.marks()).filter((m) => m.type !== other);
            if (dispatch) tr.setStoredMarks(type.isInSet(stored) ? type.removeFromSet(stored) : type.create().addToSet(stored));
            return true;
          }
          const active = state.doc.rangeHasMark(from, to, type);
          if (dispatch) {
            tr.removeMark(from, to, other);
            if (active) tr.removeMark(from, to, type);
            else tr.addMark(from, to, type.create());
          }
          return true;
        },
    };
  },
});
export const SermonSubscript = Subscript.extend({
  excludes: "superscript",
  addCommands() {
    return {
      ...this.parent?.(),
      setSubscript:
        () =>
        ({ state, tr, dispatch }) => {
          const { from, to } = state.selection;
          if (dispatch) {
            tr.removeMark(from, to, state.schema.marks.superscript);
            tr.addMark(from, to, state.schema.marks.subscript.create());
          }
          return true;
        },
      toggleSubscript:
        () =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.marks.subscript, other = state.schema.marks.superscript;
          const { from, to, empty } = state.selection;
          if (empty) {
            const stored = (state.storedMarks ?? state.selection.$from.marks()).filter((m) => m.type !== other);
            if (dispatch) tr.setStoredMarks(type.isInSet(stored) ? type.removeFromSet(stored) : type.create().addToSet(stored));
            return true;
          }
          const active = state.doc.rangeHasMark(from, to, type);
          if (dispatch) {
            tr.removeMark(from, to, other);
            if (active) tr.removeMark(from, to, type);
            else tr.addMark(from, to, type.create());
          }
          return true;
        },
    };
  },
});
