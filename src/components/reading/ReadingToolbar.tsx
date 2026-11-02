"use client";

import type { Ref } from "react";
import Link from "next/link";
import type {
  LineHeightOption,
  ReadingTheme,
  TypeScaleStep,
} from "@/types/document";
import styles from "./ReadingToolbar.module.css";

interface ReadingToolbarProps {
  theme: ReadingTheme;
  typeScaleStep: TypeScaleStep;
  lineHeight: LineHeightOption;
  bionic: boolean;
  calibrationOpen: boolean;
  onThemeChange: (t: ReadingTheme) => void;
  onTypeScaleChange: (s: TypeScaleStep) => void;
  onLineHeightChange: (lh: LineHeightOption) => void;
  onBionicChange: (v: boolean) => void;
  /** Receives the toggle button so the shell can return focus to it on close. */
  onToggleCalibration: (trigger: HTMLElement) => void;
  calibrationToggleRef?: Ref<HTMLButtonElement>;
}

const STEPS: TypeScaleStep[] = [-2, -1, 0, 1, 2];
const LHS: LineHeightOption[] = [1.55, 1.7, 1.85];

export function ReadingToolbar(props: ReadingToolbarProps) {
  const {
    theme,
    typeScaleStep,
    lineHeight,
    bionic,
    calibrationOpen,
    onThemeChange,
    onTypeScaleChange,
    onLineHeightChange,
    onBionicChange,
    onToggleCalibration,
    calibrationToggleRef,
  } = props;

  return (
    <header className={styles.bar} role="banner">
      <Link href="/edit" className={styles.back}>
        ← Back to Edit
      </Link>

      <div className={styles.controls} role="toolbar" aria-label="Reading settings">
        <div className={styles.group} role="group" aria-label="Theme">
          <button
            type="button"
            className={theme === "dark" ? styles.active : styles.btn}
            aria-pressed={theme === "dark"}
            onClick={() => onThemeChange("dark")}
          >
            Dark
          </button>
          <button
            type="button"
            className={theme === "light" ? styles.active : styles.btn}
            aria-pressed={theme === "light"}
            onClick={() => onThemeChange("light")}
          >
            Light
          </button>
        </div>

        <label className={styles.label}>
          Type
          <select
            className={styles.select}
            value={typeScaleStep}
            onChange={(e) =>
              onTypeScaleChange(Number(e.target.value) as TypeScaleStep)
            }
            aria-label="Type scale step"
          >
            {STEPS.map((s) => (
              <option key={s} value={s}>
                {s > 0 ? `+${s}` : s}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.label}>
          Leading
          <select
            className={styles.select}
            value={lineHeight}
            onChange={(e) =>
              onLineHeightChange(Number(e.target.value) as LineHeightOption)
            }
            aria-label="Line height"
          >
            {LHS.map((lh) => (
              <option key={lh} value={lh}>
                {lh}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={bionic}
            onChange={(e) => onBionicChange(e.target.checked)}
          />
          Bionic
        </label>

        <button
          type="button"
          className={calibrationOpen ? styles.active : styles.btn}
          aria-pressed={calibrationOpen}
          ref={calibrationToggleRef}
          onClick={(e) => onToggleCalibration(e.currentTarget)}
        >
          Calibrate
        </button>
      </div>
    </header>
  );
}
