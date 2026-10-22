"use client";

import type { PageChoice, PageOrientation } from "@/lib/reading/pageSettings";
import { FORMAT_BUTTONS, allowedSteps, bodyPt, orientationsFor } from "@/lib/reading/pageSettings";
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
  const steps = allowedSteps();
  const i = steps.indexOf(choice.textStep);
  const canOrient = orientationsFor(choice.format);
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
                onChange({ ...choice, format: f.format, orientation: f.orientation ?? orientationsFor(f.format)[0] });
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
            disabled={!canOrient.includes(o)}
            title={canOrient.includes(o) ? undefined : "Not available for this format yet"}
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
          disabled={i <= 0}
          onClick={() => onChange({ ...choice, textStep: steps[i - 1] })}
        >
          −
        </button>
        <span className={styles.ptValue} data-text-pt="" aria-live="polite">
          {bodyPt(choice.textStep)} pt
        </span>
        <button
          type="button"
          className={styles.btn}
          aria-label="Larger text"
          disabled={i < 0 || i >= steps.length - 1}
          onClick={() => onChange({ ...choice, textStep: steps[Math.max(0, i) + 1] ?? steps[0] })}
        >
          +
        </button>
      </div>
      <button type="button" className={styles.btn} aria-pressed={fullscreen} onClick={onFullscreenToggle} data-fullscreen-toggle="">
        {fullscreen ? "Exit full screen" : "Full screen"}
      </button>
    </section>
  );
}
