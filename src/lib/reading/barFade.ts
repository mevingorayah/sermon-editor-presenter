/**
 * Preach top bar visibility rule (UI UX fix list, point 2): the bar fades
 * only while the timer runs, after a short idle spell, and never while the
 * settings popover is open or keyboard focus is inside the bar.
 */
export const BAR_IDLE_MS = 2500;

export interface BarFadeState {
  timerRunning: boolean;
  /** ms since the last tap, pointer move or key press. */
  idleMs: number;
  focusInBar: boolean;
  settingsOpen: boolean;
}

export function shouldBarFade(s: BarFadeState): boolean {
  return s.timerRunning && !s.focusInBar && !s.settingsOpen && s.idleMs >= BAR_IDLE_MS;
}

/** mm:ss, or h:mm:ss from one hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Countdown readout state: orange from 05:00 left, bold red past zero. */
export type TimerTone = "normal" | "warn" | "over";
export const WARN_AT_MS = 5 * 60_000;

export function countdown(targetMs: number, elapsedMs: number): { text: string; tone: TimerTone } {
  const left = targetMs - elapsedMs;
  if (left < 0) {
    // Past zero: count up from 0 with a minus sign (−00:12 = 12 s over).
    return { text: `−${formatElapsed(-left)}`, tone: "over" };
  }
  const text = formatElapsed(left + 999); // ceil to the second: 05:00 shows until it hits 04:59
  return { text, tone: left <= WARN_AT_MS ? "warn" : "normal" };
}

export const TARGET_MINUTES = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60] as const;
export const DEFAULT_TARGET_MINUTES = 30;
