"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { JSONContent } from "@tiptap/react";
import type { PresentationSettings, ReadingTheme } from "@/types/document";
import { metricCompatibleCss } from "@/lib/sermon/export/textMeasure";
import {
  buildPageView,
  clampPage,
  containScale,
  pageStepForKey,
  pageStepForSwipe,
  pageOfBlock,
  type PageViewLine,
} from "@/lib/reading/pageView";
import { readingHighlightColor, readingTextColor } from "@/lib/reading/contrast";
import { CUE_COLOR } from "@/lib/reading/renderSermon";
import styles from "./PageView.module.css";

interface PageViewProps {
  content: JSONContent;
  settings: PresentationSettings;
  /** Frame matches the screen: edge to edge, no bars. */
  fill?: boolean;
}

/** Keys typed into a control never turn the page. */
function typingInControl(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el?.closest) return false;
  return Boolean(el.closest("input, select, textarea, [contenteditable], [role=dialog], [role=complementary]"));
}

export function PageView({ content, settings, fill = false }: PageViewProps) {
  const theme = settings.theme;
  const model = useMemo(() => buildPageView({ content, settings }), [content, settings]);
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [page, setPage] = useState(0);
  const count = model.pages.length;
  const current = clampPage(page, count);
  const touch = useRef<{ x: number; y: number } | null>(null);

  // Stay on the same paragraph after a re-layout (format, orientation, size).
  const anchor = useRef({ blockIndex: 0, lineIndex: 0 });
  const lastModel = useRef(model);
  useEffect(() => {
    if (lastModel.current === model) return;
    lastModel.current = model;
    setPage(pageOfBlock(model.pages, anchor.current.blockIndex, anchor.current.lineIndex));
  }, [model]);
  useEffect(() => {
    const first = model.pages[current]?.find((l) => l.kind === "text") ?? model.pages[current]?.[0];
    anchor.current = { blockIndex: first?.blockIndex ?? 0, lineIndex: first?.lineIndex ?? 0 };
  }, [current, model]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (typingInControl(e.target)) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        // Up/Down nudge within the page (only moves when the page overflows the host).
        hostRef.current?.scrollBy({ top: e.key === "ArrowDown" ? 60 : -60 });
        return;
      }
      const step = pageStepForKey(e.key, e.shiftKey);
      if (!step) return;
      // Space on a focused button presses it; leave that alone.
      if (e.key === " " && (e.target as HTMLElement)?.closest?.("button, a")) return;
      e.preventDefault();
      setPage((p) => clampPage(clampPage(p, count) + step, count));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count]);

  const { frame } = model;
  const scale = containScale(frame, box.w || frame.width, box.h || frame.height);
  const lines = model.pages[current] ?? [];

  return (
    <div
      ref={hostRef}
      className={styles.host}
      data-page-view=""
      data-format={settings.page?.format ?? String(settings.calibrationTarget)}
      data-fill={fill ? "true" : "false"}
      data-page-index={current}
      data-page-count={count}
      onPointerDown={(e) => {
        touch.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s) return;
        const step = pageStepForSwipe(e.clientX - s.x, e.clientY - s.y);
        if (step) setPage((p) => clampPage(clampPage(p, count) + step, count));
      }}
    >
      <section
        className={styles.pageBox}
        style={{ width: frame.width * scale, height: frame.height * scale }}
        aria-label={`Page ${current + 1} of ${count}`}
        aria-live="polite"
        data-page={current + 1}
      >
        <div
          className={styles.page}
          style={{ width: frame.width, height: frame.height, transform: `scale(${scale})` }}
        >
          {lines.map((l) => (
            <Line key={l.key} l={l} frame={frame} theme={theme} />
          ))}
        </div>
      </section>
      <div className={styles.counter} aria-hidden="true" data-page-counter="">
        {current + 1} / {count}
      </div>
    </div>
  );
}

function Line({
  l,
  frame,
  theme,
}: {
  l: PageViewLine;
  frame: { left: number; contentWidth: number };
  theme: ReadingTheme;
}) {
  return (
    <div
      className={styles.line}
      data-line=""
      data-kind={l.kind}
      data-block={l.blockType}
      style={{
        top: l.y,
        left: frame.left,
        width: frame.contentWidth,
        height: l.lineHeight,
        fontSize: l.size,
        lineHeight: `${l.lineHeight}px`,
        textAlign: l.align,
      }}
    >
      {l.tokens.map((t, ti) => {
        const r = t.run;
        const cue = Boolean(r.italic && r.color?.toLowerCase() === CUE_COLOR);
        const style: CSSProperties = {
          fontFamily: metricCompatibleCss(r.fontFamily as Parameters<typeof metricCompatibleCss>[0]),
          fontVariationSettings: '"opsz" 24',
        };
        if (r.bold || l.role.bold) style.fontWeight = 700;
        if (r.italic || l.role.italic) style.fontStyle = "italic";
        const deco = [r.underline && "underline", r.strike && "line-through"].filter(Boolean).join(" ");
        if (deco) style.textDecorationLine = deco;
        if (r.color && !cue) style.color = readingTextColor(r.color, theme);
        if (r.highlight) style.backgroundColor = readingHighlightColor("#fff176", theme, "yellow");
        return (
          <span key={ti} style={style} className={cue ? styles.cue : undefined} data-cue={cue ? "" : undefined}>
            {t.text}
          </span>
        );
      })}
    </div>
  );
}
