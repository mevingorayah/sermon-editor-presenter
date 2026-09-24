"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { JSONContent } from "@tiptap/react";
import {
  CALIBRATION_TARGETS,
  buildCalibratedSnapshot,
  marginsFor,
  typeScaleMultiplier,
} from "@/lib/calibration";
import {
  EXPORT_FORMATS,
  buildExportPayload,
  defaultFilenameStem,
  fallbackFilename,
  filenameFromContentDisposition,
  formatMeta,
  sanitizeFilenameStem,
} from "@/lib/export-client/payload";
import { browserCssVarResolver } from "@/lib/export-client/flattenColors";
import type {
  CalibrationTarget,
  ExportFormat,
  LineHeightOption,
  ReadingTheme,
  TypeScaleStep,
} from "@/types/document";
import { ReadingView } from "./ReadingView";
import styles from "./CalibrationPanel.module.css";

/** Backend schema cap for `filenameStem`. */
const STEM_MAX = 200;

interface CalibrationPanelProps {
  content: JSONContent;
  /** Sermon title — default Save-as filename stem. */
  title: string;
  /** Study notes — sent only when "Include study notes" is on (DOCX/PDF). */
  notes: string;
  target: CalibrationTarget;
  typeScaleStep: TypeScaleStep;
  lineHeight: LineHeightOption;
  /** Live reading theme; print targets default preview to light. */
  theme: ReadingTheme;
  /** Move focus into the panel on mount (deep link `?calibrate=1`). */
  autoFocus?: boolean;
  onTargetChange: (t: CalibrationTarget) => void;
  onTypeScaleChange: (s: TypeScaleStep) => void;
  onLineHeightChange: (lh: LineHeightOption) => void;
  onThemeChange: (t: ReadingTheme) => void;
  onClose: () => void;
}

export function CalibrationPanel(props: CalibrationPanelProps) {
  const {
    content,
    title,
    notes,
    target,
    typeScaleStep,
    lineHeight,
    theme,
    autoFocus = false,
    onTargetChange,
    onTypeScaleChange,
    onLineHeightChange,
    onThemeChange,
    onClose,
  } = props;

  const ids = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);
  // null = untouched → follow the sermon title; string = user-edited stem.
  const [stemDraft, setStemDraft] = useState<string | null>(null);
  const [includeNotes, setIncludeNotes] = useState(false);

  const meta = CALIBRATION_TARGETS.find((t) => t.id === target)!;
  const margins = marginsFor(target);
  const previewTheme: ReadingTheme =
    meta.kind === "paper" ? "light" : theme;
  const scale = typeScaleMultiplier(typeScaleStep);
  const stem = stemDraft ?? defaultFilenameStem(title);
  const savedStem = sanitizeFilenameStem(stem);
  const hasNotes = notes.trim().length > 0;

  useEffect(() => {
    if (autoFocus) headingRef.current?.focus();
  }, [autoFocus]);

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

  async function postExport(format: ExportFormat) {
    if (busyFormat) return;
    const fmt = formatMeta(format);
    const upper = fmt.ext.toUpperCase();
    setBusyFormat(format);
    setExportStatus(`Downloading ${upper}…`);
    try {
      const payload = buildExportPayload({
        snapshot,
        format,
        filenameStem: stem,
        includeNotes,
        notes,
        resolveVar: browserCssVarResolver(),
      });
      const res = await fetch(
        `/api/export?format=${encodeURIComponent(format)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const blob = await res.blob();
      if (!res.ok) {
        let message = res.statusText;
        let code: string | undefined;
        try {
          const data = JSON.parse(await blob.text()) as {
            message?: string;
            error?: string;
            code?: string;
          };
          message = data.message ?? data.error ?? message;
          code = data.code;
        } catch {
          // Keep the HTTP status when the error response is not JSON.
        }
        setExportStatus(
          res.status === 501 || code === "NOT_IMPLEMENTED"
            ? `${upper} export isn’t available yet (${message}).`
            : `HTTP ${res.status}: ${message}`,
        );
        return;
      }

      const filename =
        filenameFromContentDisposition(res.headers.get("Content-Disposition")) ??
        fallbackFilename(stem, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setExportStatus(`Downloaded ${filename}`);
    } catch (err) {
      setExportStatus(
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusyFormat(null);
    }
  }

  return (
    <aside
      className={styles.panel}
      aria-labelledby={`${ids}-heading`}
      data-testid="calibration-panel"
    >
      <div className={styles.header}>
        <h2
          id={`${ids}-heading`}
          ref={headingRef}
          tabIndex={-1}
          className={styles.title}
        >
          Document setup &amp; export
        </h2>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close document setup"
        >
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

      <fieldset className={styles.saveAs}>
        <legend className={styles.legend}>Save as</legend>
        <label className={styles.label} htmlFor={`${ids}-stem`}>
          Filename
        </label>
        <input
          id={`${ids}-stem`}
          type="text"
          className={styles.input}
          value={stem}
          maxLength={STEM_MAX}
          spellCheck={false}
          autoComplete="off"
          aria-describedby={`${ids}-stem-hint`}
          onChange={(e) => setStemDraft(e.target.value)}
        />
        <p id={`${ids}-stem-hint`} className={styles.fieldHint}>
          Saves as <strong>{savedStem}</strong>.docx / .pdf / .png / .pptx
        </p>

        <label className={styles.check}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={includeNotes}
            aria-describedby={`${ids}-notes-hint`}
            onChange={(e) => setIncludeNotes(e.target.checked)}
          />
          Include study notes
        </label>
        <p id={`${ids}-notes-hint`} className={styles.fieldHint}>
          DOCX and PDF only, added as a final section.
          {hasNotes ? "" : " This sermon has no study notes yet."}
        </p>
      </fieldset>

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

      <div
        className={styles.exportRow}
        role="group"
        aria-label="Export format"
        aria-busy={busyFormat ? true : undefined}
      >
        {EXPORT_FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={
              f.print ? styles.exportBtn : `${styles.exportBtn} ${styles.exportBtnSecondary}`
            }
            aria-disabled={busyFormat ? true : undefined}
            onClick={() => postExport(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {/* Single persistent live region: hint until an export runs, then status. */}
      <p
        className={exportStatus ? styles.status : styles.hint}
        role="status"
      >
        {exportStatus ??
          "DOCX and PDF print in light ink. PNG (one image of the frame) and PowerPoint (a slide per H1) follow the target and theme above."}
      </p>
    </aside>
  );
}
