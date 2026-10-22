"use client";

import type { PageChoice, PageOrientation } from "@/lib/reading/pageSettings";
import { useState } from "react";
import { FORMAT_BUTTONS, LIMITS, naturalOrientation, resetSpacing, stepTextSize } from "@/lib/reading/pageSettings";
import styles from "./PreachBar.module.css";

interface Props {
  choice: PageChoice;
  followDevice: boolean;
  onChange: (c: PageChoice) => void;
  onFollowDeviceChange: (v: boolean) => void;
  fullscreen: boolean;
  onFullscreenToggle: () => void;
}

/** ⚙ "Page" section: the sermon's page settings (shared with Document setup and exports). */
export function PageControls({ choice, followDevice, onChange, onFollowDeviceChange, fullscreen, onFullscreenToggle }: Props) {
  const T = LIMITS.textSizePt;
  const [eachSide, setEachSide] = useState(false);
  const setOrientation = (o: PageOrientation) => {
    onFollowDeviceChange(false); // manual switch turns following off
    onChange({ ...choice, orientation: o });
  };
  return (
    <section className={styles.section} aria-label="Page" data-page-controls="">
      <h2 className={styles.sectionTitle}>Page</h2>
      <div className={styles.formatGrid} role="group" aria-label="Format">
        {FORMAT_BUTTONS.map((f) => {
          const on = f.format === choice.format && (!f.orientation || f.orientation === choice.orientation);
          return (
            <button
              key={f.key}
              type="button"
              className={on ? styles.active : styles.btn}
              aria-pressed={on}
              data-format={f.key}
              onClick={() => {
                if (f.orientation) onFollowDeviceChange(false);
                onChange({ ...choice, format: f.format, orientation: f.orientation ?? naturalOrientation(f.format) });
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <div className={styles.row} role="group" aria-label="Orientation">
        <span className={styles.rowLabel}>Orientation</span>
        {(["portrait", "landscape"] as const).map((o) => (
          <button
            key={o}
            type="button"
            className={choice.orientation === o ? styles.active : styles.btn}
            aria-pressed={choice.orientation === o}
            onClick={() => setOrientation(o)}
          >
            {o === "portrait" ? "Portrait" : "Landscape"}
          </button>
        ))}
      </div>
      <label className={styles.row}>
        <input
          type="checkbox"
          className={styles.check}
          checked={followDevice}
          onChange={(e) => onFollowDeviceChange(e.target.checked)}
        />
        <span>Follow device rotation</span>
      </label>
      <div className={styles.row} role="group" aria-label="Text size">
        <span className={styles.rowLabel}>Text size</span>
        <button
          type="button"
          className={styles.btn}
          aria-label="Smaller text"
          disabled={choice.textSizePt <= T.min}
          onClick={() => onChange(stepTextSize(choice, -1))}
        >
          −
        </button>
        <span className={styles.ptValue} data-text-pt="" aria-live="polite">
          {choice.textSizePt} pt
        </span>
        <button
          type="button"
          className={styles.btn}
          aria-label="Larger text"
          disabled={choice.textSizePt >= T.max}
          onClick={() => onChange(stepTextSize(choice, 1))}
        >
          +
        </button>
      </div>
      <h2 className={styles.sectionTitle}>Spacing</h2>
      {eachSide ? (
        (["top", "right", "bottom", "left"] as const).map((side) => (
          <Slider
            key={side}
            id={`margin-${side}`}
            label={`Margin ${side}`}
            unit="in"
            min={LIMITS.marginIn.min}
            max={LIMITS.marginIn.max}
            step={0.05}
            value={choice.margins[side]}
            onChange={(v) => onChange({ ...choice, margins: { ...choice.margins, [side]: v } })}
          />
        ))
      ) : (
        <Slider
          id="margin-all"
          label="Margins"
          unit="in"
          min={LIMITS.marginIn.min}
          max={LIMITS.marginIn.max}
          step={0.05}
          value={choice.margins.top}
          onChange={(v) => onChange({ ...choice, margins: { top: v, right: v, bottom: v, left: v } })}
        />
      )}
      <button type="button" className={styles.link} data-each-side="" onClick={() => setEachSide((v) => !v)}>
        {eachSide ? "Same on all sides" : "Set each side"}
      </button>
      <Slider
        id="line-spacing"
        label="Line spacing"
        unit="×"
        {...LIMITS.lineSpacing}
        value={choice.lineSpacing}
        onChange={(v) => onChange({ ...choice, lineSpacing: v })}
      />
      <Slider
        id="para-spacing"
        label="Paragraph spacing"
        unit="pt"
        {...LIMITS.paragraphSpacingPt}
        value={choice.paragraphSpacingPt}
        onChange={(v) => onChange({ ...choice, paragraphSpacingPt: v })}
      />
      <button type="button" className={styles.btn} data-reset-spacing="" onClick={() => onChange(resetSpacing(choice))}>
        Reset to default
      </button>
      <button type="button" className={styles.btn} aria-pressed={fullscreen} onClick={onFullscreenToggle} data-fullscreen-toggle="">
        {fullscreen ? "Exit full screen" : "Full screen"}
      </button>
    </section>
  );
}

const round = (v: number, step: number) => +(Math.round(v / step) * step).toFixed(3);

/** Labelled slider whose value is tap-to-type. */
function Slider(p: {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  const commit = (raw: string) => {
    setTyping(null);
    const n = Number(raw);
    if (Number.isFinite(n)) p.onChange(round(Math.min(p.max, Math.max(p.min, n)), p.step));
  };
  const shown = p.unit === "in" ? p.value.toFixed(2) : String(+p.value.toFixed(2));
  return (
    <div className={styles.sliderRow} data-slider={p.id}>
      <label htmlFor={p.id} className={styles.rowLabel}>
        {p.label}
      </label>
      <input
        id={p.id}
        type="range"
        className={styles.range}
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.value}
        onChange={(e) => p.onChange(round(Number(e.target.value), p.step))}
      />
      {typing === null ? (
        <button type="button" className={styles.valueBtn} aria-label={`${p.label}: ${shown} ${p.unit}, tap to type`} onClick={() => setTyping(shown)}>
          {shown} {p.unit}
        </button>
      ) : (
        <input
          autoFocus
          inputMode="decimal"
          className={styles.valueInput}
          aria-label={`${p.label} (${p.unit})`}
          value={typing}
          onChange={(e) => setTyping(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
            if (e.key === "Escape") setTyping(null);
          }}
        />
      )}
    </div>
  );
}
