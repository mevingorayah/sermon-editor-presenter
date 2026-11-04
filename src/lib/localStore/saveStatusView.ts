/**
 * Visible save-status wording for the Edit top bar (UI UX spec, ported from #28):
 * - nothing on open until the first real save since the sermon was opened
 * - "Saving…" while a change is waiting to be written
 * - "Saved HH:MM" (24h) once everything is written
 * - "Not saved, retrying" (red) when a write failed
 * Where it was saved (folder / this browser) is only in the tooltip and the
 * screen-reader label, never in the visible text.
 */
import { statusLabel, type SaveStatus } from "./status";

export type SaveTone = "neutral" | "ok" | "error";

export interface SaveStatusView {
  /** Visible text ("" = show nothing). */
  label: string;
  tone: SaveTone;
  /** Full detail for title / aria-label ("" when nothing is shown). */
  detail: string;
}

/** Always 24h "HH:MM", whatever the browser locale (en-US included). */
export function formatSavedTime(d: Date, locale?: string): string {
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function saveStatusView(
  status: SaveStatus,
  opts: { started: boolean; savedAt: Date | null },
): SaveStatusView {
  const where = statusLabel(status);
  switch (status.kind) {
    case "error":
      return { label: "Not saved, retrying", tone: "error", detail: `Not saved, retrying. ${where}` };
    case "conflict":
      return { label: "Not saved", tone: "error", detail: where };
    case "saving":
      return opts.started
        ? { label: "Saving…", tone: "neutral", detail: "Saving…" }
        : { label: "", tone: "neutral", detail: "" };
    case "saved-folder":
    case "saved-browser":
    case "needs-permission": {
      if (!opts.started || !opts.savedAt) return { label: "", tone: "neutral", detail: "" };
      const label = `Saved ${formatSavedTime(opts.savedAt)}`;
      return { label, tone: "ok", detail: `${label}. ${where}` };
    }
  }
}
