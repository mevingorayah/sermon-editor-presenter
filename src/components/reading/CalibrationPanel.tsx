"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { JSONContent } from "@tiptap/react";
import {
  CALIBRATION_TARGETS,
  buildCalibratedSnapshot,
  marginsFor,
  typeScaleMultiplier,
} from "@/lib/calibration";
import type {
  CalibrationTarget,
  LineHeightOption,
  ReadingTheme,
  TypeScaleStep,
} from "@/types/document";
import { ReadingView } from "./ReadingView";
import styles from "./CalibrationPanel.module.css";

interface CalibrationPanelProps {
  content: JSONContent;
  target: CalibrationTarget;
  typeScaleStep: TypeScaleStep;
  lineHeight: LineHeightOption;
  /** Live reading theme; print targets default preview to light. */
  theme: ReadingTheme;
  onTargetChange: (t: CalibrationTarget) => void;
  onTypeScaleChange: (s: TypeScaleStep) => void;
  onLineHeightChange: (lh: LineHeightOption) => void;
  onThemeChange: (t: ReadingTheme) => void;
  onClose: () => void;
}

export function CalibrationPanel(props: CalibrationPanelProps) {
  const {
    content,
    target,
    typeScaleStep,
    lineHeight,
    theme,
    onTargetChange,
    onTypeScaleChange,
    onLineHeightChange,
    onThemeChange,
    onClose,
  } = props;

  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const meta = CALIBRATION_TARGETS.find((t) => t.id === target)!;
  const margins = marginsFor(target);
  const previewTheme: ReadingTheme =
    meta.kind === "paper" ? "light" : theme;
  const scale = typeScaleMultiplier(typeScaleStep);

  const snapshot = useMemo(
    () =>
      buildCalibratedSnapshot({
        target,
        typeScaleStep,
        lineHeight,
        theme: meta.kind === "paper" ? "light" : theme,
        content,
      }),
    [target, typeScaleStep, lineHeight, theme, content, meta.kind],
  );

  async function postExport() {
    setExportStatus("Posting calibrated snapshot…");
    console.log("[export stub] CalibratedSnapshot", snapshot);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      const data = await res.json().catch(() => ({}));
      setExportStatus(
        `HTTP ${res.status}: ${data.message ?? data.error ?? res.statusText}`,
      );
    } catch (err) {
      setExportStatus(
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return (
    <aside className={styles.panel} aria-label="Calibration panel">
      <div className={styles.header}>
        <h2 className={styles.title}>Calibration</h2>
        <button type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>

      <div className={styles.fields}>
        <label className={styles.label}>
          Target
          <select
            className={styles.select}
            value={target}
            onChange={(e) =>
              onTargetChange(e.target.value as CalibrationTarget)
            }
          >
            {CALIBRATION_TARGETS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.label}>
          Type scale
          <select
            className={styles.select}
            value={typeScaleStep}
            onChange={(e) =>
              onTypeScaleChange(Number(e.target.value) as TypeScaleStep)
            }
          >
            {([-2, -1, 0, 1, 2] as TypeScaleStep[]).map((s) => (
              <option key={s} value={s}>
                {s > 0 ? `+${s}` : s}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.label}>
          Line height
          <select
            className={styles.select}
            value={lineHeight}
            onChange={(e) =>
              onLineHeightChange(Number(e.target.value) as LineHeightOption)
            }
          >
            {([1.55, 1.7, 1.85] as LineHeightOption[]).map((lh) => (
              <option key={lh} value={lh}>
                {lh}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.label}>
          Theme {meta.kind === "paper" ? "(print → light)" : ""}
          <select
            className={styles.select}
            value={previewTheme}
            disabled={meta.kind === "paper"}
            onChange={(e) => onThemeChange(e.target.value as ReadingTheme)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>

        <p className={styles.margins}>
          Margins: {margins.top} / {margins.right} / {margins.bottom} /{" "}
          {margins.left}
          {margins.binderGutter
            ? ` · binder gutter +${margins.binderGutter}`
            : ""}
        </p>
      </div>

      <div className={styles.previewWrap}>
        <p className={styles.previewLabel}>Live preview (gradient flattened)</p>
        <div
          className={styles.frame}
          style={{
            width: meta.previewWidth,
            aspectRatio: meta.aspect,
            paddingTop: margins.top,
            paddingRight: margins.right,
            paddingBottom: margins.bottom,
            paddingLeft: margins.binderGutter
              ? `calc(${margins.left} + ${margins.binderGutter})`
              : margins.left,
          }}
          data-reading-mode=""
          data-theme={previewTheme}
        >
          <div
            className={styles.frameInner}
            style={
              {
                ["--rm-scale" as string]: String(scale),
                ["--rm-lh-body" as string]: String(lineHeight),
              } as CSSProperties
            }
          >
            <ReadingView
              content={content}
              bionic={false}
              flattenGradient
            />
          </div>
        </div>
      </div>

      <div className={styles.exportRow}>
        <button type="button" className={styles.exportBtn} onClick={postExport}>
          Export snapshot (stub)
        </button>
        <button
          type="button"
          className={styles.exportBtn}
          onClick={postExport}
        >
          DOCX / PDF (Backend)
        </button>
      </div>
      {exportStatus ? (
        <p className={styles.status} role="status">
          {exportStatus}
        </p>
      ) : (
        <p className={styles.hint}>
          Posts CalibratedSnapshot JSON to <code>/api/export</code> (501 until
          Backend lands).
        </p>
      )}
    </aside>
  );
}
