"use client";

import type { Editor } from "@tiptap/react";
import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import {
  INSERT_TYPES, TYPE_LABEL, applyDrop, blockAtSelection, changeBlockTypeAt, collectBlocks,
  deleteBlockAt, duplicateBlockAt, insertBlockAt, insertBlockInColumn, moveBlockInParent,
  topBlocks, type DropTarget, type InsertDef,
} from "./blockOps";
import { StylePanel } from "./StylePanel";
import { BlocksPalette } from "./BlocksPalette";
import { blockCss, type GlobalStyles } from "@/lib/builder/blockAttrs";
import { LAYOUT, PANEL_KEYS, SHEET_MQ, fitScale, readFlag, writeFlag, type EditPageBox } from "@/lib/editLayout/layout";
import styles from "./BlockBuilder.module.css";

interface Rect { top: number; height: number; left: number; width: number }

interface Props {
  editor: Editor;
  globalStyles: GlobalStyles;
  onGlobalStylesChange: (g: GlobalStyles) => void;
  children: ReactNode;
  /** The sermon's page (chosen size + orientation) in CSS px. */
  page?: EditPageBox;
  formattingOpen?: boolean;
  onFormattingOpenChange?: (open: boolean) => void;
}

const LONG_PRESS_MS = 300;
const DRAG_THRESHOLD_PX = 6;
const DEFAULT_PAGE_BOX: EditPageBox = { widthPx: 794, heightPx: 1123, margins: { top: 77, right: 77, bottom: 77, left: 77 } };

function useMedia(q: string): boolean {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

export function BlockBuilder({
  editor, globalStyles, onGlobalStylesChange, children,
  page = DEFAULT_PAGE_BOX, formattingOpen = true, onFormattingOpenChange,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  /** Formatting is a bottom sheet below 1024 px or on a portrait tablet. */
  const sheetMode = useMedia(SHEET_MQ);
  const sheetModeRef = useRef(sheetMode);
  sheetModeRef.current = sheetMode;
  const setFormatting = useCallback((open: boolean) => onFormattingOpenChange?.(open), [onFormattingOpenChange]);
  const [paletteCollapsed, setPaletteCollapsed] = useState<boolean>(() =>
    typeof window !== "undefined" && readFlag(PANEL_KEYS.blocks) === "collapsed",
  );
  const onPaletteCollapsed = (c: boolean) => {
    setPaletteCollapsed(c);
    writeFlag(PANEL_KEYS.blocks, c ? "collapsed" : "expanded");
  };
  const [scale, setScale] = useState(1);
  const [sheetHeight, setSheetHeight] = useState(page.heightPx);
  const [scrollbarW, setScrollbarW] = useState(0);
  const floatingOpen = formattingOpen && !sheetMode;
  const leftInset = LAYOUT.inset * 2 + (paletteCollapsed ? LAYOUT.paletteCollapsed : LAYOUT.palette) + LAYOUT.blockGutter;
  const rightInset = LAYOUT.inset + (floatingOpen ? LAYOUT.formatting + LAYOUT.inset : 0);

  // Page scale: fit the band between the floating panels. Only the scale
  // changes (the page keeps its width in CSS px), so line breaks never move.
  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const fit = () => {
      setScrollbarW(sc.offsetWidth - sc.clientWidth);
      setScale(fitScale(page.widthPx, sc.clientWidth - leftInset - rightInset));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(sc);
    return () => ro.disconnect();
  }, [page.widthPx, leftInset, rightInset]);

  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const on = () => setSheetHeight(el.offsetHeight);
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [rects, setRects] = useState<Map<number, Rect>>(new Map());
  const [selected, setSelected] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ at: number; replace: boolean; top: number; colPos?: number } | null>(null);
  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState<{ from: number; target: DropTarget } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, force] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const base = canvas.getBoundingClientRect();
    const next = new Map<number, Rect>();
    for (const b of collectBlocks(editor)) {
      const dom = editor.view.nodeDOM(b.pos) as HTMLElement | null;
      const r = (dom as HTMLElement | null)?.getBoundingClientRect?.();
      if (r) next.set(b.pos, { top: r.top - base.top, height: r.height, left: r.left - base.left, width: r.width });
    }
    setRects(next);
  }, [editor]);

  useLayoutEffect(() => {
    measure();
    const onTx = () => { measure(); force((n) => n + 1); };
    editor.on("update", onTx);
    editor.on("transaction", onTx);
    const ro = new ResizeObserver(measure);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => { editor.off("update", onTx); editor.off("transaction", onTx); ro.disconnect(); };
  }, [editor, measure]);

  const lastSel = useRef<number | null>(null);
  useEffect(() => {
    const onSel = () => {
      if (!editor.isFocused) return;
      const b = blockAtSelection(editor);
      setSelected(b?.pos ?? null);
      // Formatting still opens when a block is selected (a newly selected one,
      // so typing inside a block after closing it does not reopen it).
      if (b && b.pos !== lastSel.current) setFormatting(true);
      lastSel.current = b?.pos ?? null;
    };
    editor.on("selectionUpdate", onSel);
    editor.on("focus", onSel);
    return () => { editor.off("selectionUpdate", onSel); editor.off("focus", onSel); };
  }, [editor, setFormatting]);

  useEffect(() => {
    const dom = editor.view.dom as HTMLElement;
    const onKey = (e: KeyboardEvent) => {
      const cur = blockAtSelection(editor);
      if (e.key === "Escape" && !menu) {
        setSelected(null);
        lastSel.current = null;
        if (sheetModeRef.current) setFormatting(false);
        return;
      }
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && cur) {
        e.preventDefault();
        const dir = e.key === "ArrowUp" ? -1 : 1;
        if (moveBlockInParent(editor, cur.pos, dir)) {
          const next = blockAtSelection(editor);
          setSelected(next?.pos ?? null);
        }
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        const n = editor.state.selection.$from.parent;
        const $from = editor.state.selection.$from;
        if (n.type.name === "paragraph" && n.content.size === 0 && $from.depth === 1) {
          e.preventDefault();
          const idx = $from.index(0);
          const tops = topBlocks(editor);
          setQuery("");
          setMenu({ at: idx, replace: true, top: (rects.get(tops[idx]?.pos)?.top ?? 0) + (rects.get(tops[idx]?.pos)?.height ?? 0) });
        }
      }
    };
    dom.addEventListener("keydown", onKey);
    return () => dom.removeEventListener("keydown", onKey);
  }, [editor, menu, rects, setFormatting]);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  };

  const doInsert = (def: InsertDef) => {
    if (!menu) return;
    if (menu.colPos !== undefined) {
      insertBlockInColumn(editor, menu.colPos, menu.at, def);
    } else {
      insertBlockAt(editor, menu.at, def, menu.replace);
    }
    setMenu(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? INSERT_TYPES.filter((t) => (t.label + " " + t.keywords).toLowerCase().includes(q)) : INSERT_TYPES;
  }, [query]);

  const dropTargetAt = useCallback((clientX: number, clientY: number): DropTarget => {
    const canvas = canvasRef.current;
    const base = canvas?.getBoundingClientRect();
    const y = clientY - (base?.top ?? 0);
    // Prefer a section column under the pointer.
    if (canvas) {
      const cols = Array.from(canvas.querySelectorAll<HTMLElement>("[data-column]"));
      for (const el of cols) {
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
          let colPos: number | null = null;
          editor.state.doc.descendants((node, pos) => {
            if (colPos !== null) return false;
            if (node.type.name === "column" && editor.view.nodeDOM(pos) === el) colPos = pos;
            return true;
          });
          if (colPos !== null) {
            const col = editor.state.doc.nodeAt(colPos);
            if (col) {
              let childPos = colPos + 1;
              let index = col.childCount;
              let insertAt = colPos + col.nodeSize - 1;
              for (let i = 0; i < col.childCount; i++) {
                const child = col.child(i);
                const cr = rects.get(childPos);
                if (cr && y < cr.top + cr.height / 2) {
                  index = i;
                  insertAt = childPos;
                  break;
                }
                childPos += child.nodeSize;
              }
              return { kind: "column", colPos, index, pos: insertAt };
            }
          }
        }
      }
    }
    const tops = topBlocks(editor);
    for (let i = 0; i < tops.length; i++) {
      const cr = rects.get(tops[i].pos);
      if (cr && y < cr.top + cr.height / 2) return { kind: "gap", pos: tops[i].pos };
    }
    return { kind: "gap", pos: editor.state.doc.content.size };
  }, [editor, rects]);

  const startDrag = (from: number, e: React.PointerEvent) => {
    e.preventDefault();
    const targetEl = e.currentTarget as HTMLElement;
    const pid = e.pointerId;
    let active = e.pointerType !== "touch";
    let timer: ReturnType<typeof setTimeout> | null = null;
    let target: DropTarget = { kind: "gap", pos: from };
    if (!active) timer = setTimeout(() => { active = true; setDrag({ from, target }); }, LONG_PRESS_MS);
    else setDrag({ from, target });
    try { targetEl.setPointerCapture(pid); } catch { /* ignore */ }
    const move = (ev: PointerEvent) => {
      if (!active) return;
      target = dropTargetAt(ev.clientX, ev.clientY);
      setDrag({ from, target });
    };
    const up = () => {
      if (timer) clearTimeout(timer);
      targetEl.removeEventListener("pointermove", move);
      targetEl.removeEventListener("pointerup", up);
      targetEl.removeEventListener("pointercancel", up);
      setDrag(null);
      if (active && applyDrop(editor, from, target)) {
        setSelected(blockAtSelection(editor)?.pos ?? null);
      }
    };
    targetEl.addEventListener("pointermove", move);
    targetEl.addEventListener("pointerup", up);
    targetEl.addEventListener("pointercancel", up);
  };

  /** Palette click: insert at the cursor (after the selected block), as the old Blocks list did. */
  const insertAtCursor = (t: InsertDef) => {
    const blocksNow = collectBlocks(editor);
    const topsNow = topBlocks(editor);
    const sb = selected !== null ? blocksNow.find((b) => b.pos === selected) : undefined;
    const at = sb
      ? (sb.parentType === "doc" ? topsNow.findIndex((b) => b.pos === sb.pos) + 1 : topsNow.length)
      : topsNow.length;
    if (sb?.parentType === "column" && sb.parentPos !== null && t.json().type !== "section") {
      const col = editor.state.doc.nodeAt(sb.parentPos);
      let index = 0;
      if (col) {
        let p = sb.parentPos + 1;
        for (let i = 0; i < col.childCount; i++) {
          if (p === sb.pos) { index = i + 1; break; }
          p += col.child(i).nodeSize;
        }
      }
      insertBlockInColumn(editor, sb.parentPos, index, t);
    } else {
      insertBlockAt(editor, at < 0 ? topsNow.length : at, t);
    }
  };

  /** Palette pointer: a click inserts at the cursor; a drag drops onto the page. */
  const startPaletteDrag = (def: InsertDef, e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const btn = e.currentTarget;
    const pid = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let dragging = false;
    let target: DropTarget | null = null;
    try { btn.setPointerCapture(pid); } catch { /* ignore */ }
    const overCanvas = (x: number, y: number) => {
      const r = scrollerRef.current?.getBoundingClientRect();
      return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      target = overCanvas(ev.clientX, ev.clientY) ? dropTargetAt(ev.clientX, ev.clientY) : null;
      setDrag(target ? { from: -1, target } : null);
    };
    const done = (ev: PointerEvent) => {
      btn.removeEventListener("pointermove", move);
      btn.removeEventListener("pointerup", done);
      btn.removeEventListener("pointercancel", done);
      setDrag(null);
      if (ev.type === "pointercancel") return;
      if (!dragging) { insertAtCursor(def); return; }
      if (!target) return;
      if (target.kind === "column" && def.json().type !== "section") {
        insertBlockInColumn(editor, target.colPos, target.index, def);
      } else {
        const t = target;
        const topsNow = topBlocks(editor);
        const idx = topsNow.findIndex((b) => b.pos === t.pos);
        insertBlockAt(editor, idx < 0 ? topsNow.length : idx, def);
      }
      setSelected(blockAtSelection(editor)?.pos ?? null);
    };
    btn.addEventListener("pointermove", move);
    btn.addEventListener("pointerup", done);
    btn.addEventListener("pointercancel", done);
  };

  const blocks = collectBlocks(editor);
  const tops = topBlocks(editor);
  const sel = selected !== null && blocks.some((b) => b.pos === selected) ? selected : null;
  const selBlock = sel !== null ? blocks.find((b) => b.pos === sel) : undefined;
  const selRect = sel !== null ? rects.get(sel) : undefined;
  const typeName = selBlock?.node.type.name ?? "";
  const $sel = sel !== null ? editor.state.doc.resolve(sel) : null;
  const canMoveUp = !!$sel && $sel.index() > 0;
  const canMoveDown = !!$sel && $sel.index() < $sel.parent.childCount - 1;

  const globalCss = Object.entries(globalStyles)
    .map(([t, g]) => {
      const css = blockCss(g.style, g.spacing);
      const sel2 = t === "heading" ? ".ProseMirror h1:not([data-sermon-title]), .ProseMirror h2"
        : t === "title" ? ".ProseMirror [data-sermon-title]"
        : t === "scripture" ? ".ProseMirror .sermon-scripture"
        : t === "quote" ? ".ProseMirror .sermon-quote"
        : t === "illustration" ? ".ProseMirror .sermon-illustration"
        : t === "paragraph" ? ".ProseMirror p" : "";
      return css && sel2 ? `${sel2} { ${css} }` : "";
    })
    .join("\n");

  const dropLineTop = (() => {
    if (!drag) return 0;
    if (drag.target.kind === "column") {
      const col = editor.state.doc.nodeAt(drag.target.colPos);
      if (!col) return 0;
      if (drag.target.index >= col.childCount) {
        const lastPos = drag.target.colPos + col.nodeSize - 1 - (col.lastChild?.nodeSize ?? 0);
        const last = col.lastChild ? rects.get(drag.target.pos === drag.target.colPos + col.nodeSize - 1 ? lastPos : drag.target.pos) : rects.get(drag.target.colPos);
        // Prefer the insert pos rect; fall back to the column bottom.
        const at = rects.get(drag.target.pos);
        if (at) return at.top;
        const colR = (() => {
          const el = editor.view.nodeDOM(drag.target.colPos) as HTMLElement | null;
          const canvas = canvasRef.current?.getBoundingClientRect();
          const r = el?.getBoundingClientRect();
          return r && canvas ? r.top - canvas.top + r.height : 0;
        })();
        return last ? last.top + last.height : colR;
      }
      return rects.get(drag.target.pos)?.top ?? 0;
    }
    if (drag.target.pos >= editor.state.doc.content.size) {
      const last = tops.at(-1);
      const r = last ? rects.get(last.pos) : undefined;
      return (r?.top ?? 0) + (r?.height ?? 0);
    }
    return rects.get(drag.target.pos)?.top ?? 0;
  })();

  const dropColRect = drag?.target.kind === "column"
    ? (() => {
        const el = editor.view.nodeDOM(drag.target.colPos) as HTMLElement | null;
        const canvas = canvasRef.current?.getBoundingClientRect();
        const r = el?.getBoundingClientRect();
        if (!r || !canvas) return null;
        return { top: r.top - canvas.top, left: r.left - canvas.left, width: r.width, height: r.height };
      })()
    : null;

  const pageW = page.widthPx;
  return (
    <div
      className={styles.layout}
      ref={layoutRef}
      data-sheet-mode={sheetMode ? "true" : "false"}
      style={{ ["--sbw" as string]: `${scrollbarW}px` }}
    >
      {globalCss ? <style>{globalCss}</style> : null}
      {/* Full-width scroll container: its scrollbar is the window's right edge. */}
      <div
        className={styles.scroller}
        ref={scrollerRef}
        data-testid="edit-scroller"
        style={sheetMode && formattingOpen ? { paddingBottom: "50vh" } : undefined}
      >
        <div className={styles.band} style={{ paddingLeft: leftInset, paddingRight: rightInset }}>
      <div
        className={styles.canvas}
        ref={canvasRef}
        data-builder-canvas=""
        style={{ width: LAYOUT.blockGutter + pageW * scale, marginLeft: -LAYOUT.blockGutter }}
      >
        <div className={styles.sheetBox} style={{ width: pageW * scale, height: sheetHeight * scale }}>
          <div
            className={styles.sheet}
            ref={sheetRef}
            data-testid="edit-page"
            data-edit-page=""
            data-scale={scale.toFixed(4)}
            data-page-width={pageW}
            style={{
              width: pageW,
              minHeight: page.heightPx,
              transform: scale === 1 ? undefined : `scale(${scale})`,
              ["--edit-page-scale" as string]: String(scale),
              padding: `${page.margins.top}px ${page.margins.right}px ${page.margins.bottom}px ${page.margins.left}px`,
            }}
          >
            {children}
          </div>
        </div>

        {tops.map((b, i) => {
          const r = rects.get(b.pos);
          if (!r) return null;
          return (
            <div key={`ins-${i}`} className={styles.inserter} style={{ top: r.top + r.height - 22 }}>
              <span className={styles.inserterLine} aria-hidden />
              <button
                type="button"
                className={styles.inserterBtn}
                aria-label={`Add block after block ${i + 1}`}
                data-testid={`inserter-${i}`}
                onClick={() => { setQuery(""); setMenu({ at: i + 1, replace: false, top: r.top + r.height }); }}
              >
                +
              </button>
            </div>
          );
        })}

        {selRect && sel !== null && selBlock && (
          <>
            <div className={styles.outline} style={{ top: selRect.top - 2, height: selRect.height + 4, left: selRect.left - 6, width: selRect.width + 12 }} aria-hidden />
            <div
              className={styles.blockToolbar}
              role="toolbar"
              aria-label={`${TYPE_LABEL[typeName] ?? typeName} block tools`}
              style={{ top: Math.max(0, selRect.top) }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setSelected(null); if (sheetMode) setFormatting(false); editor.commands.blur(); }
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  const btns = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("button,select"));
                  const i = btns.indexOf(document.activeElement as HTMLElement);
                  btns[(i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length]?.focus();
                }
              }}
            >
              <button
                type="button" className={`${styles.tb} ${styles.handle}`} aria-label="Drag to move block"
                data-testid="drag-handle" onPointerDown={(e) => startDrag(sel, e)}
              >⋮⋮</button>
              <button type="button" className={styles.tb} aria-label="Move block up" disabled={!canMoveUp}
                onClick={() => { if (moveBlockInParent(editor, sel, -1)) setSelected(blockAtSelection(editor)?.pos ?? sel); }}>↑</button>
              <button type="button" className={styles.tb} aria-label="Move block down" disabled={!canMoveDown}
                onClick={() => { if (moveBlockInParent(editor, sel, 1)) setSelected(blockAtSelection(editor)?.pos ?? sel); }}>↓</button>
              {selBlock.node.isTextblock && (
                <select
                  className={styles.tbSelect} aria-label="Change block type"
                  value={typeName === "heading" ? `heading${selBlock.node.attrs.level}` : typeName}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith("heading")) changeBlockTypeAt(editor, sel, "heading", { level: Number(v.slice(7)) });
                    else changeBlockTypeAt(editor, sel, v);
                  }}
                >
                  <option value="title">Title</option>
                  <option value="heading1">Heading 1</option>
                  <option value="heading2">Heading 2</option>
                  <option value="paragraph">Paragraph</option>
                  <option value="scripture">Scripture</option>
                  <option value="quote">Quote</option>
                  <option value="illustration">Illustration</option>
                </select>
              )}
              <button type="button" className={styles.tb} aria-label="Duplicate block"
                onClick={() => duplicateBlockAt(editor, sel)}>⧉</button>
              <button type="button" className={styles.tb} aria-label="Delete block"
                onClick={() => { deleteBlockAt(editor, sel); setSelected(null); showToast("Block deleted"); }}>🗑</button>
              <button type="button" className={`${styles.tb} ${styles.sheetOpenBtn}`} aria-label="Open block settings"
                data-testid="open-style-sheet"
                onClick={() => setFormatting(true)}>⚙</button>
            </div>
          </>
        )}

        {drag && dropColRect && (
          <div className={styles.dropColumn} data-testid="drop-column" style={dropColRect} aria-hidden />
        )}
        {drag && (
          <div
            className={styles.dropLine}
            data-testid="drop-line"
            style={{ top: dropLineTop }}
            aria-hidden
          />
        )}

        {menu && (
          <div className={styles.menu} role="dialog" aria-label="Insert block" style={{ top: menu.top }}
            onKeyDown={(e) => { if (e.key === "Escape") { setMenu(null); editor.commands.focus(); } }}>
            <input
              autoFocus className={styles.menuSearch} placeholder="Search blocks" aria-label="Search blocks"
              value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && filtered[0]) doInsert(filtered[0]); }}
            />
            <ul role="listbox" aria-label="Block types" className={styles.menuList}>
              {filtered.map((t) => (
                <li key={t.id}>
                  <button type="button" role="option" aria-selected={false} className={styles.panelBtn} onClick={() => doInsert(t)}>
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
        </div>
      </div>

      <BlocksPalette
        collapsed={paletteCollapsed}
        onCollapsedChange={onPaletteCollapsed}
        onInsert={insertAtCursor}
        onPointerDown={startPaletteDrag}
        onWheel={(dy) => scrollerRef.current?.scrollBy({ top: dy })}
      />

      <StylePanel
        editor={editor}
        pos={formattingOpen ? sel : null}
        open={formattingOpen}
        globalStyles={globalStyles}
        onGlobalStylesChange={onGlobalStylesChange}
        onClose={() => setFormatting(false)}
      />

      {toast && (
        <div className={styles.toast} role="status">
          {toast}
          <button type="button" className={styles.panelBtn}
            onClick={() => { editor.commands.undo(); setToast(null); }}>Undo</button>
        </div>
      )}
    </div>
  );
}
