"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { INSERT_TYPES, type InsertDef } from "./blockOps";
import styles from "./BlockBuilder.module.css";

/** Spec order first, then the rest (Subpoint heading, sections). */
const ORDER = ["heading1", "paragraph", "scripture", "verseSnippet", "quote", "illustration", "cue"];
export const PALETTE_TYPES: InsertDef[] = [
  ...ORDER.map((id) => INSERT_TYPES.find((t) => t.id === id)!).filter(Boolean),
  ...INSERT_TYPES.filter((t) => !ORDER.includes(t.id)),
];

function BlockIcon({ id }: { id: string }) {
  const svg = { width: 18, height: 18, viewBox: "0 0 20 20", "aria-hidden": true, focusable: false } as const;
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (id) {
    case "heading1":
      return <span className={styles.glyph} aria-hidden="true">H1</span>;
    case "heading2":
      return <span className={styles.glyph} aria-hidden="true">H2</span>;
    case "paragraph":
      return <span className={styles.glyph} aria-hidden="true">¶</span>;
    case "scripture":
      return (
        <svg {...svg}>
          <path {...stroke} d="M10 5.5C8.5 4.3 6 4 3 4.3v11c3-.3 5.5 0 7 1.2 1.5-1.2 4-1.5 7-1.2v-11c-3-.3-5.5 0-7 1.2zM10 5.5v11" />
        </svg>
      );
    case "verseSnippet":
      return <span className={styles.glyph} aria-hidden="true">v.</span>;
    case "quote":
      return <span className={styles.glyph} aria-hidden="true">❝</span>;
    case "illustration":
      return (
        <svg {...svg}>
          <path {...stroke} d="M10 3a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9zM8 17h4" />
        </svg>
      );
    case "cue":
      return (
        <svg {...svg}>
          <path {...stroke} d="M7.5 5v10M12.5 5v10" strokeWidth={2.2} />
        </svg>
      );
    default: {
      const n = Number(id.replace("section", "")) || 1;
      const w = (14 - (n - 1) * 1.5) / n;
      return (
        <svg {...svg}>
          {Array.from({ length: n }, (_, i) => (
            <rect key={i} x={3 + i * (w + 1.5)} y="4" width={w} height="12" rx="1" {...stroke} strokeWidth={1.4} />
          ))}
        </svg>
      );
    }
  }
}

interface Props {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** Click: insert at the cursor (same as the old Blocks list). */
  onInsert: (def: InsertDef) => void;
  /** Pointer down on a block button: BlockBuilder decides click vs drag. */
  onPointerDown: (def: InsertDef, e: ReactPointerEvent<HTMLButtonElement>) => void;
  /** Wheel over the strip scrolls the page underneath. */
  onWheel: (deltaY: number) => void;
}

/**
 * Floating Blocks palette (UI UX spec 2): a 56 px icon strip, vertically
 * centred, 12 px in from the canvas edge. Items that do not fit go under
 * "More"; the strip can shrink to a single "+".
 */
export function BlocksPalette({ collapsed, onCollapsedChange, onInsert, onPointerDown, onWheel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [fitCount, setFitCount] = useState(PALETTE_TYPES.length);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host || collapsed) return;
    const measure = () => {
      const btn = ref.current?.querySelector<HTMLElement>("[data-palette-item]");
      const step = (btn?.offsetHeight ?? 44) + 4;
      // Host height minus 2×12 px inset, strip padding and the hide button.
      const room = host.clientHeight - 24 - 12 - step;
      const all = PALETTE_TYPES.length;
      if (all * step <= room) setFitCount(all);
      else setFitCount(Math.max(1, Math.floor(room / step) - 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [collapsed]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const item = (t: InsertDef, inMenu = false) => (
    <button
      key={t.id}
      type="button"
      className={inMenu ? styles.paletteMenuItem : styles.paletteBtn}
      aria-label={t.label}
      title={t.label}
      data-palette-item={t.id}
      data-testid={`palette-${t.id}`}
      onPointerDown={(e) => onPointerDown(t, e)}
      onClick={(e) => {
        // Pointer clicks are handled in onPointerDown; this is the keyboard path.
        if (e.detail === 0) {
          onInsert(t);
          setMoreOpen(false);
        }
      }}
    >
      <BlockIcon id={t.id} />
      {inMenu ? <span>{t.label}</span> : null}
    </button>
  );

  if (collapsed) {
    return (
      <div className={styles.palette} ref={ref} data-testid="blocks-palette" data-collapsed="true" role="toolbar"
        aria-label="Blocks" aria-orientation="vertical" onWheel={(e) => onWheel(e.deltaY)}>
        <button type="button" className={styles.paletteBtn} aria-label="Show blocks" title="Show blocks"
          aria-expanded={false} data-testid="blocks-palette-toggle" onClick={() => onCollapsedChange(false)}>
          <span className={styles.glyph} aria-hidden="true">+</span>
        </button>
      </div>
    );
  }

  const shown = PALETTE_TYPES.slice(0, fitCount);
  const rest = PALETTE_TYPES.slice(fitCount);
  return (
    <div className={styles.palette} ref={ref} data-testid="blocks-palette" data-collapsed="false" role="toolbar"
      aria-label="Blocks" aria-orientation="vertical" onWheel={(e) => onWheel(e.deltaY)}>
      <button type="button" className={`${styles.paletteBtn} ${styles.paletteHide}`} aria-label="Hide blocks"
        title="Hide blocks" aria-expanded data-testid="blocks-palette-toggle" onClick={() => onCollapsedChange(true)}>
        <span aria-hidden="true">–</span>
      </button>
      {shown.map((t) => item(t))}
      {rest.length ? (
        <div className={styles.paletteMore} ref={moreRef}>
          <button type="button" className={styles.paletteBtn} aria-label="More blocks" title="More"
            aria-haspopup="true" aria-expanded={moreOpen} data-testid="palette-more" onClick={() => setMoreOpen((o) => !o)}>
            <span className={styles.glyph} aria-hidden="true">⋯</span>
          </button>
          {moreOpen ? (
            <div className={styles.paletteMenu} role="group" aria-label="More blocks">
              {rest.map((t) => item(t, true))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
