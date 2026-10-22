/**
 * Plain save-status wording for the Edit top bar (UI UX spec):
 * - "Saving…" while anything is in progress or still waiting to be saved
 * - "Saved 14:05" once everything is saved
 * - "Not saved, retrying" (red) when a save failed
 * Rule: never show "Saved" while any change is still pending.
 * On open, nothing is shown until the first real save completes.
 */
export type SaveTone = "neutral" | "ok" | "error";

export type SaveStatusKind =
  | "saved-server"
  | "saved-local"
  | "saving"
  | "offline"
  | "restoring"
  | "retrying"
  | "failed-network"
  | "failed-server";

export interface SaveStatusView {
  label: string;
  tone: SaveTone;
}

/** Always 24h "HH:MM", whatever the browser locale (en-US included). */
export function formatSavedTime(d: Date, locale?: string): string {
  return d.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function saveStatusView(
  status: SaveStatusKind,
  opts: { pending: boolean; savedAt: Date | null },
): SaveStatusView {
  switch (status) {
    case "offline":
    case "retrying":
    case "failed-network":
    case "failed-server":
      return { label: "Not saved, retrying", tone: "error" };
    case "saving":
    case "restoring":
      return { label: "Saving…", tone: "neutral" };
    case "saved-server":
    case "saved-local":
      if (opts.pending) return { label: "Saving…", tone: "neutral" };
      // Nothing saved yet since open → show nothing.
      if (!opts.savedAt) return { label: "", tone: "neutral" };
      return { label: `Saved ${formatSavedTime(opts.savedAt)}`, tone: "ok" };
  }
}
