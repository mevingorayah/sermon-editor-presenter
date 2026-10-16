"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { normalizeHex, type ColorPreset } from "@/lib/marks/presets";
import { contrastRatio, parseColor, DARK_STAGE_BG } from "@/lib/reading/contrast";
import styles from "./SermonEditor.module.css";

export const RECENT_COLORS_KEY = "sermon-editor-presenter:recent-colors:v1";
const CREAM = "#f4f1ea";

export function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!normalizeHex(x)).slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function pushRecent(list: string[], hex: string): string[] {
  return [hex, ...list.filter((c) => c !== hex)].slice(0, 6);
}

function readable(hex: string, bg: string): boolean {
  const a = parseColor(hex), b = parseColor(bg);
  return !!a && !!b && contrastRatio(a, b) >= 4.5;
}

interface Props {
  /** Visible trigger content. */
  trigger: ReactNode;
  label: string;
  presets: readonly ColorPreset[];
  /** Label of the "remove" option ("Default" / "None"). */
  noneLabel: string;
  /** Currently applied preset id or hex (uppercase), "" for none. */
  activePreset: string | null;
  activeColor: string;
  /** Custom hex entry (text colour only). */
  allowCustom?: boolean;
  onApply: (color: string | null, preset: string | null) => void;
  /** Called when an outside click closes the popover without applying. */
  onDismiss?: () => void;
  testId: string;
}

/**
 * Colour dialog (§4.2, fixes P2–P6): role="dialog", swatches are a
 * radiogroup with arrow keys and a visible ✓, custom hex with validation,
 * recent colours, contrast meter, Esc returns focus to the trigger, and an
 * outside click doesn't close it while the hex field is dirty.
 */
export function ColorPopover({
  trigger, label, presets, noneLabel, activePreset, activeColor, allowCustom = false,
  onApply, onDismiss, testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const swatchRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dialogId = useId();
  const hexId = useId();
  const errId = useId();

  const options = [{ id: "", label: noneLabel, light: "" }, ...presets];
  const activeIndex = Math.max(
    0,
    options.findIndex((o) =>
      o.id === "" ? !activeColor : o.id === activePreset || (!!activeColor && o.light === activeColor.toUpperCase()),
    ),
  );

  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      setHex("");
      if (returnFocus) triggerRef.current?.focus();
      else onDismiss?.();
    },
    [onDismiss],
  );

  useEffect(() => {
    if (!open) return;
    if (allowCustom) setRecent(loadRecent());
    swatchRefs.current[activeIndex]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dirty = hex.trim() !== "";
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node) && !dirty) close(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, dirty, close]);

  const apply = (color: string | null, preset: string | null) => {
    onApply(color, preset);
    setOpen(false);
    setHex("");
  };

  const applyCustom = (value: string) => {
    const n = normalizeHex(value);
    if (!n) return;
    const next = pushRecent(loadRecent(), n);
    try {
      localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    apply(n, null);
  };

  const onDialogKey = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };

  const onSwatchKey = (e: ReactKeyboardEvent, i: number) => {
    const n = options.length;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next >= 0) {
      e.preventDefault();
      swatchRefs.current[next]?.focus();
    }
  };

  const normalized = normalizeHex(hex);
  const showErr = dirty && !normalized;

  return (
    <div className={`${styles.toolGroup} ${styles.colorGroup}`} ref={wrapRef} data-testid={testId}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.toolBtn} ${styles.colorTrigger}${open ? ` ${styles.toolBtnActive}` : ""}`}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        {trigger}
      </button>
      {open ? (
        <div id={dialogId} role="dialog" aria-label={label} className={styles.colorDialog} onKeyDown={onDialogKey}>
          <div role="radiogroup" aria-label={`${label} presets`} className={styles.swatchGrid}>
            {options.map((o, i) => {
              const checked = i === activeIndex;
              return (
                <button
                  key={o.id || "none"}
                  ref={(el) => {
                    swatchRefs.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={o.label}
                  title={o.label}
                  tabIndex={checked ? 0 : -1}
                  className={`${styles.swatch}${o.id ? "" : ` ${styles.swatchDefault}`}${checked ? ` ${styles.swatchActive}` : ""}`}
                  style={o.light ? { background: o.light } : undefined}
                  onKeyDown={(e) => onSwatchKey(e, i)}
                  onClick={() => apply(o.id ? o.light : null, o.id || null)}
                >
                  {o.id ? (checked ? <span className={styles.swatchCheck} aria-hidden="true">✓</span> : null) : noneLabel}
                </button>
              );
            })}
          </div>
          {allowCustom ? (
            <div className={styles.customColor}>
              {recent.length ? (
                <div role="group" aria-label="Recent colours" className={styles.recentRow}>
                  {recent.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`${styles.swatch} ${styles.swatchSmall}`}
                      aria-label={`Recent ${c}`}
                      title={c}
                      style={{ background: c }}
                      onClick={() => apply(c, null)}
                    />
                  ))}
                </div>
              ) : null}
              <label htmlFor={hexId} className={styles.hexLabel}>
                Custom hex
              </label>
              <div className={styles.hexRow}>
                <span aria-hidden="true">#</span>
                <input
                  id={hexId}
                  className={styles.hexInput}
                  value={hex.replace(/^#/, "")}
                  maxLength={7}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={showErr}
                  aria-describedby={showErr ? errId : undefined}
                  onChange={(e) => setHex(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyCustom(hex);
                    }
                  }}
                />
                <span
                  className={styles.hexPreview}
                  aria-hidden="true"
                  style={{ background: normalized ?? "transparent" }}
                />
                <input
                  type="color"
                  aria-label="Pick a colour"
                  className={styles.nativePicker}
                  value={(normalized ?? (activeColor || "#1A1814")).toLowerCase()}
                  onChange={(e) => setHex(e.target.value)}
                />
              </div>
              {showErr ? (
                <p id={errId} className={styles.hexError} role="alert">
                  Enter 3 or 6 hex digits, e.g. #A8201A
                </p>
              ) : null}
              {normalized ? (
                <p className={styles.contrastMeter} data-testid="contrast-meter">
                  Light: {readable(normalized, CREAM) ? "Readable ✓" : "Low contrast ⚠"} · Dark:{" "}
                  {readable(normalized, DARK_STAGE_BG) ? "Readable ✓" : "Low contrast ⚠"}
                </p>
              ) : null}
              <button type="button" className={styles.applyBtn} disabled={!normalized} onClick={() => applyCustom(hex)}>
                Apply
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
