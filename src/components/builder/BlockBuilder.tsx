"use client";

import type { Editor } from "@tiptap/react";
import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import {
  INSERT_TYPES, TYPE_LABEL, changeBlockType, deleteBlock, duplicateBlock,
  insertBlockAt, moveBlock, topBlocks, type InsertDef,
} from "./blockOps";
import { StylePanel } from "./StylePanel";
import { blockCss, type GlobalStyles } from "@/lib/builder/blockAttrs";
import styles from "./BlockBuilder.module.css";

interface Rect { top: number; height: number }

interface Props {
  editor: Editor;
  globalStyles: GlobalStyles;
  onGlobalStylesChange: (g: GlobalStyles) => void;
  children: ReactNode;
}

const LONG_PRESS_MS = 300;

export function BlockBuilder({ editor, globalStyles, onGlobalStylesChange, children }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ at: number; replace: boolean; top: number } | null>(null);
  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, force] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const base = canvas.getBoundingClientRect().top;
    const next = topBlocks(editor).map((b) => {
      const dom = editor.view.nodeDOM(b.pos) as HTMLElement | null;
      const r = dom?.getBoundingClientRect?.();
      return r ? { top: r.top - base, height: r.height } : { top: 0, height: 0 };
    });
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

  // Selecting a block follows the caret; it never changes text.
  useEffect(() => {
    const onSel = () => {
      if (!editor.isFocused) return;
      setSelected(editor.state.selection.$from.index(0));
    };
    editor.on("selectionUpdate", onSel);
    editor.on("focus", onSel);
    return () => { editor.off("selectionUpdate", onSel); editor.off("focus", onSel); };
  }, [editor]);

  // Keyboard: Esc deselects, Alt+↑/↓ moves, "/" on an empty line opens the inserter.
  useEffect(() => {
    const dom = editor.view.dom as HTMLElement;
    const onKey = (e: KeyboardEvent) => {
      const idx = editor.state.selection.$from.index(0);
      if (e.key === "Escape" && !menu) { setSelected(null); return; }
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const to = e.key === "ArrowUp" ? idx - 1 : idx + 2;
        if (to >= 0 && moveBlock(editor, idx, to)) {
          const ni = e.key === "ArrowUp" ? idx - 1 : idx + 1;
          setSelected(ni);
          const b = topBlocks(editor)[ni];
          if (b) editor.commands.setTextSelection(b.pos + 1);
        }
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        const n = editor.state.selection.$from.parent;
        if (n.type.name === "paragraph" && n.content.size === 0 && editor.state.selection.$from.depth === 1) {
          e.preventDefault();
          setQuery("");
          setMenu({ at: idx, replace: true, top: (rects[idx]?.top ?? 0) + (rects[idx]?.height ?? 0) });
        }
      }
    };
    dom.addEventListener("keydown", onKey);
    return () => dom.removeEventListener("keydown", onKey);
  }, [editor, menu, rects]);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  };

  const doInsert = (def: InsertDef) => {
    if (!menu) return;
    insertBlockAt(editor, menu.at, def, menu.replace);
    setSelected(menu.at);
    setMenu(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? INSERT_TYPES.filter((t) => (t.label + " " + t.keywords).toLowerCase().includes(q)) : INSERT_TYPES;
  }, [query]);

  // ---- Drag (pointer-based; mouse immediate, touch after 300 ms long-press) ----
  const dropIndexAt = (clientY: number) => {
    const base = canvasRef.current?.getBoundingClientRect().top ?? 0;
    const y = clientY - base;
    for (let i = 0; i < rects.length; i++) if (y < rects[i].top + rects[i].height / 2) return i;
    return rects.length;
  };
  const startDrag = (from: number, e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    const pid = e.pointerId;
    let active = e.pointerType !== "touch";
    let timer: ReturnType<typeof setTimeout> | null = null;
    let to = from;
    if (!active) timer = setTimeout(() => { active = true; setDrag({ from, to: from }); }, LONG_PRESS_MS);
    else setDrag({ from, to: from });
    try { target.setPointerCapture(pid); } catch { /* ignore */ }
    const move = (ev: PointerEvent) => {
      if (!active) return;
      to = dropIndexAt(ev.clientY);
      setDrag({ from, to });
    };
    const up = () => {
      if (timer) clearTimeout(timer);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      setDrag(null);
      if (active && moveBlock(editor, from, to)) setSelected(to > from ? to - 1 : to);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const blocks = topBlocks(editor);
  const sel = selected !== null && selected < blocks.length ? selected : null;
  const selNode = sel !== null ? blocks[sel].node : null;
  const selRect = sel !== null ? rects[sel] : null;
  const typeName = selNode?.type.name ?? "";

  // Global styles → CSS applied to blocks of each type (empty = nothing emitted).
  const globalCss = Object.entries(globalStyles)
    .map(([t, g]) => {
      const css = blockCss(g.style, g.spacing);
      const sel2 = t === "heading" ? ".ProseMirror > h1:not([data-sermon-title]), .ProseMirror > h2"
        : t === "title" ? ".ProseMirror > [data-sermon-title]"
        : t === "scripture" ? ".ProseMirror > .sermon-scripture"
        : t === "quote" ? ".ProseMirror > .sermon-quote"
        : t === "illustration" ? ".ProseMirror > .sermon-illustration"
        : t === "paragraph" ? ".ProseMirror > p" : "";
      return css && sel2 ? `${sel2} { ${css} }` : "";
    })
    .join("\n");

  return (
    <div className={styles.layout}>
      {globalCss ? <style>{globalCss}</style> : null}
      <aside className={styles.left} aria-label="Block panel">
        <h2 className={styles.panelTitle}>Blocks</h2>
        <ul className={styles.blockList}>
          {INSERT_TYPES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={styles.panelBtn}
                onClick={() => {
                  const at = sel !== null ? sel + 1 : blocks.length;
                  insertBlockAt(editor, at, t);
                  setSelected(at);
                }}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className={styles.canvas} ref={canvasRef} data-builder-canvas="">
        {children}

        {/* Inserters between blocks */}
        {rects.map((r, i) => (
          <div key={`ins-${i}`} className={styles.inserter} style={{ top: r.top + r.height - 22 + 0 }}>
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
        ))}

        {/* Selection outline + toolbar */}
        {selRect && sel !== null && (
          <>
            <div className={styles.outline} style={{ top: selRect.top - 2, height: selRect.height + 4 }} aria-hidden />
            <div
              className={styles.blockToolbar}
              role="toolbar"
              aria-label={`${TYPE_LABEL[typeName] ?? typeName} block tools`}
              style={{ top: Math.max(0, selRect.top - 50) }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setSelected(null); editor.commands.blur(); }
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
              <button type="button" className={styles.tb} aria-label="Move block up" disabled={sel === 0}
                onClick={() => { if (moveBlock(editor, sel, sel - 1)) setSelected(sel - 1); }}>↑</button>
              <button type="button" className={styles.tb} aria-label="Move block down" disabled={sel >= blocks.length - 1}
                onClick={() => { if (moveBlock(editor, sel, sel + 2)) setSelected(sel + 1); }}>↓</button>
              {selNode?.isTextblock && (
                <select
                  className={styles.tbSelect} aria-label="Change block type"
                  value={typeName === "heading" ? `heading${selNode.attrs.level}` : typeName}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith("heading")) changeBlockType(editor, sel, "heading", { level: Number(v.slice(7)) });
                    else changeBlockType(editor, sel, v);
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
                onClick={() => duplicateBlock(editor, sel)}>⧉</button>
              <button type="button" className={styles.tb} aria-label="Delete block"
                onClick={() => { deleteBlock(editor, sel); setSelected(null); showToast("Block deleted"); }}>🗑</button>
            </div>
          </>
        )}

        {/* Drop line */}
        {drag && (
          <div
            className={styles.dropLine}
            data-testid="drop-line"
            style={{ top: drag.to >= rects.length ? (rects.at(-1)?.top ?? 0) + (rects.at(-1)?.height ?? 0) : rects[drag.to]?.top ?? 0 }}
            aria-hidden
          />
        )}

        {/* Insert menu */}
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

      <StylePanel
        editor={editor}
        index={sel}
        globalStyles={globalStyles}
        onGlobalStylesChange={onGlobalStylesChange}
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
