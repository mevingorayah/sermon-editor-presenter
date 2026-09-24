"use client";

import styles from "./ProgressBar.module.css";

interface ProgressBarProps {
  /** 0..1 */
  progress: number;
}

export function ProgressBar({ progress }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, progress * 100));
  return (
    <div
      className={styles.bar}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label="Reading progress"
    >
      <div className={styles.fill} style={{ width: `${pct}%` }} />
    </div>
  );
}
