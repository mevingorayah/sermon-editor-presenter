"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import Link from "next/link";
import type {
  LineHeightOption,
  ReadingTheme,
  TypeScaleStep,
} from "@/types/document";
import {
  BAR_IDLE_MS,
  DEFAULT_TARGET_MINUTES,
  TARGET_MINUTES,
  countdown,
  shouldBarFade,
} from "@/lib/reading/barFade";

/** Sermon length for the countdown (this browser only; not in the sermon file). */
const TARGET_KEY = "sermon-editor-presenter:preach-target-min:v1";
import styles from "./PreachBar.module.css";

interface PreachBarProps {
  theme: ReadingTheme;
  typeScaleStep: TypeScaleStep;
  lineHeight: LineHeightOption;
  bionic: boolean;
  calibrationOpen: boolean;
  onThemeChange: (t: ReadingTheme) => void;
  onTypeScaleChange: (s: TypeScaleStep) => void;
  onLineHeightChange: (lh: LineHeightOption) => void;
  onBionicChange: (v: boolean) => void;
  /** Receives the trigger so the shell can return focus to it on close. */
  onToggleCalibration: (trigger: HTMLElement) => void;
  calibrationToggleRef?: Ref<HTMLButtonElement>;
  view: PreachViewMode;
  onViewChange: (v: PreachViewMode) => void;
  /** Page view filling the screen: the bar floats over the page. */
  overlay?: boolean;
  /** Timer running / stopped (STOP dims the text; keep-awake while running). */
  onTimerChange?: (s: { running: boolean; stopped: boolean }) => void;
  /** "Page" section at the top of the ⚙ sheet (format, orientation, text size). */
  pageSection?: ReactNode;
  /** Sermon title, shown small in the bar. */
  title?: string;
  /** Called from the START click (a user gesture: full screen may be entered). */
  onTimerStart?: () => void;
}

export type PreachViewMode = "page" | "flow";

const LHS: LineHeightOption[] = [1.55, 1.7, 1.85];

export function PreachBar(props: PreachBarProps) {
  const {
    theme,
    lineHeight,
    bionic,
    calibrationOpen,
    onThemeChange,
    onLineHeightChange,
    onBionicChange,
    onToggleCalibration,
    calibrationToggleRef,
    view,
    onViewChange,
    overlay = false,
    onTimerChange,
  } = props;
  const [targetMin, setTargetMin] = useState<number>(DEFAULT_TARGET_MINUTES);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    const n = Number(window.localStorage.getItem(TARGET_KEY));
    if (n > 0 && n <= 180) setTargetMin(n);
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [focusInBar, setFocusInBar] = useState(false);
  const [lastActivity, setLastActivity] = useState(0);
  const [now, setNow] = useState(0);
  const startedAt = useRef<number | null>(null);
  const banked = useRef(0);
  const barRef = useRef<HTMLElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Clock: ticks while the timer runs (drives both the readout and the fade).
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (startedAt.current !== null) setElapsed(banked.current + t - startedAt.current);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [running]);

  // Any tap, pointer move or key press brings the bar back.
  useEffect(() => {
    const wake = () => setLastActivity(Date.now());
    const opts = { passive: true } as const;
    window.addEventListener("pointermove", wake, opts);
    window.addEventListener("pointerdown", wake, opts);
    window.addEventListener("touchstart", wake, opts);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("touchstart", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  // Settings popover: Esc or a click outside closes it; focus returns to ⚙.
  useEffect(() => {
    if (!settingsOpen) return;
    panelRef.current?.querySelector<HTMLElement>("button, select, input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setSettingsOpen(false);
      gearRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || gearRef.current?.contains(t)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [settingsOpen]);

  const toggleTimer = () => {
    const t = Date.now();
    if (running) {
      if (startedAt.current !== null) banked.current += t - startedAt.current;
      startedAt.current = null;
      setElapsed(banked.current);
      setRunning(false);
    } else {
      startedAt.current = t;
      setStopped(false);
      props.onTimerStart?.();
      setLastActivity(t);
      setNow(t);
      setRunning(true);
    }
  };

  const resetTimer = () => {
    banked.current = 0;
    startedAt.current = null;
    setElapsed(0);
    setRunning(false);
    setStopped(false);
  };

  const stopTimer = () => {
    if (startedAt.current !== null) banked.current += Date.now() - startedAt.current;
    startedAt.current = null;
    setElapsed(banked.current);
    setRunning(false);
    setStopped(true);
  };

  useEffect(() => {
    onTimerChange?.({ running, stopped });
  }, [running, stopped, onTimerChange]);

  const cd = countdown(targetMin * 60_000, elapsed);

  const faded = shouldBarFade({
    timerRunning: running,
    idleMs: now - lastActivity,
    focusInBar,
    settingsOpen,
  });

  return (
    <header
      ref={barRef}
      className={styles.bar}
      data-preach-bar=""
      data-faded={faded ? "true" : "false"}
      data-overlay={overlay ? "true" : "false"}
      data-idle-ms={BAR_IDLE_MS}
      onFocus={() => setFocusInBar(true)}
      onBlur={(e) => {
        if (!barRef.current?.contains(e.relatedTarget as Node | null)) setFocusInBar(false);
      }}
    >
      <Link href="/edit" className={styles.back} aria-label="Back to Edit">
        <span aria-hidden="true">←</span> Back
      </Link>

      {props.title ? (
        <span className={styles.title} data-bar-title="">
          {props.title}
        </span>
      ) : null}

      <div className={styles.right}>
        <div className={styles.timer} role="group" aria-label="Sermon timer">
          <span
            className={styles.time}
            data-timer-readout=""
            data-tone={cd.tone}
            role="timer"
            aria-label={cd.tone === "over" ? `${cd.text.slice(1)} over time` : `${cd.text} left`}
          >
            {cd.text}
          </span>
          <button
            type="button"
            className={styles.timerBtn}
            aria-pressed={running}
            onClick={toggleTimer}
            data-timer-toggle=""
          >
            {running ? "PAUSE" : elapsed > 0 && !stopped ? "RESUME" : "START"}
          </button>
          {elapsed > 0 ? (
            <button type="button" className={styles.timerBtn} onClick={stopTimer} disabled={stopped} data-timer-stop="">
              STOP
            </button>
          ) : null}
          {elapsed > 0 ? (
            <button type="button" className={styles.timerBtn} onClick={resetTimer} data-timer-reset="">
              RESET
            </button>
          ) : null}
        </div>

        <button
          ref={gearRef}
          type="button"
          className={styles.iconBtn}
          aria-label="Reading settings"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          aria-controls={settingsOpen ? panelId : undefined}
          onClick={() => setSettingsOpen((v) => !v)}
          data-settings-toggle=""
        >
          <span aria-hidden="true">⚙</span>
        </button>
      </div>

      {settingsOpen ? (
        <div
          ref={panelRef}
          id={panelId}
          className={styles.panel}
          role="dialog"
          aria-label="Reading settings"
          data-settings-panel=""
        >
          {props.pageSection}
          <div className={styles.row} role="group" aria-label="View">
            <span className={styles.rowLabel}>View</span>
            <button
              type="button"
              className={view === "page" ? styles.active : styles.btn}
              aria-pressed={view === "page"}
              onClick={() => onViewChange("page")}
            >
              Pages
            </button>
            <button
              type="button"
              className={view === "flow" ? styles.active : styles.btn}
              aria-pressed={view === "flow"}
              onClick={() => onViewChange("flow")}
            >
              Flow
            </button>
          </div>

          <label className={styles.row}>
            <span className={styles.rowLabel}>Length</span>
            <select
              className={styles.select}
              value={targetMin}
              onChange={(e) => {
                const n = Number(e.target.value);
                setTargetMin(n);
                try {
                  window.localStorage.setItem(TARGET_KEY, String(n));
                } catch {
                  /* ignore */
                }
              }}
              aria-label="Sermon length (countdown)"
            >
              {TARGET_MINUTES.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>

          <div className={styles.row} role="group" aria-label="Theme">
            <span className={styles.rowLabel}>Theme</span>
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


          <label className={styles.row}>
            <span className={styles.rowLabel}>Leading</span>
            <select
              className={styles.select}
              value={lineHeight}
              onChange={(e) => onLineHeightChange(Number(e.target.value) as LineHeightOption)}
              aria-label="Line height"
            >
              {LHS.map((lh) => (
                <option key={lh} value={lh}>
                  {lh}
                </option>
              ))}
            </select>
          </label>

          <label className={`${styles.row} ${styles.check}`}>
            <input
              type="checkbox"
              checked={bionic}
              onChange={(e) => onBionicChange(e.target.checked)}
            />
            <span>Bionic reading</span>
          </label>

          <button
            type="button"
            className={calibrationOpen ? styles.active : styles.btn}
            aria-pressed={calibrationOpen}
            ref={calibrationToggleRef}
            onClick={(e) => {
              onToggleCalibration(e.currentTarget);
              setSettingsOpen(false);
            }}
          >
            Calibrate…
          </button>
        </div>
      ) : null}
    </header>
  );
}
