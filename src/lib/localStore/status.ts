/** Save-status model for the Edit top bar. Words are fixed by the UI UX spec. */

export type SaveStatus =
  | { kind: "saving" }
  | { kind: "saved-folder" }
  | { kind: "saved-browser" }
  | { kind: "needs-permission" }
  | { kind: "conflict" }
  | { kind: "error"; reason: SaveErrorReason; detail?: string };

export type SaveErrorReason =
  | "folder-not-found"
  | "permission"
  | "disk-full"
  | "browser-full"
  | "unknown";

export type StatusAction = "choose-folder" | "allow-access" | "retry" | null;

export function statusLabel(s: SaveStatus): string {
  switch (s.kind) {
    case "saving":
      return "Saving…";
    case "saved-folder":
      return "Saved to Sermons folder";
    case "saved-browser":
      return "Saved in this browser";
    case "needs-permission":
      return "Saved in this browser. Allow access to your Sermons folder to save there.";
    case "conflict":
      return "Not saved. This sermon was changed in another tab.";
    case "error":
      switch (s.reason) {
        case "folder-not-found":
          return "Couldn't save. Folder not found.";
        case "permission":
          return "Couldn't save. Access to the Sermons folder was turned off.";
        case "disk-full":
          return "Couldn't save. The disk is full. Free some space, then try again.";
        case "browser-full":
          return "Couldn't save. This browser's storage is full. Back up now.";
        default:
          return "Couldn't save. Try again.";
      }
  }
}

export function statusAction(s: SaveStatus): StatusAction {
  if (s.kind === "needs-permission") return "allow-access";
  if (s.kind !== "error") return null;
  if (s.reason === "folder-not-found") return "choose-folder";
  if (s.reason === "permission") return "allow-access";
  return "retry";
}

export const ACTION_LABELS: Record<Exclude<StatusAction, null>, string> = {
  "choose-folder": "Choose folder",
  "allow-access": "Allow access",
  retry: "Retry",
};

export function isSaved(s: SaveStatus): boolean {
  return s.kind === "saved-folder" || s.kind === "saved-browser";
}

/** Map a thrown write error to a writer-facing reason. */
export function classifyWriteError(err: unknown): SaveErrorReason {
  const name =
    err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "NotFoundError" || name === "InvalidStateError") return "folder-not-found";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission";
  if (name === "QuotaExceededError") return "disk-full";
  return "unknown";
}

export type SaveEvent =
  | { type: "edit" }
  | { type: "write-ok"; target: "folder" | "browser" }
  | { type: "write-failed"; error: unknown; target: "folder" | "browser" }
  | { type: "conflict" }
  | { type: "permission-needed" };

/**
 * Pure transition. A "saved" state is only ever reached from a completed
 * write (write-ok); an edit always drops back to "Saving…", except that a
 * pending conflict stays visible until the writer resolves it.
 */
export function nextStatus(prev: SaveStatus, ev: SaveEvent): SaveStatus {
  switch (ev.type) {
    case "edit":
      return prev.kind === "conflict" ? prev : { kind: "saving" };
    case "write-ok":
      return { kind: ev.target === "folder" ? "saved-folder" : "saved-browser" };
    case "write-failed": {
      if (ev.target === "browser") {
        const name =
          ev.error && typeof ev.error === "object" && "name" in ev.error
            ? String((ev.error as { name: unknown }).name)
            : "";
        return { kind: "error", reason: name === "QuotaExceededError" ? "browser-full" : "unknown" };
      }
      return { kind: "error", reason: classifyWriteError(ev.error), detail: errName(ev.error) };
    }
    case "conflict":
      return { kind: "conflict" };
    case "permission-needed":
      return { kind: "needs-permission" };
  }
}

function errName(err: unknown): string | undefined {
  if (err && typeof err === "object" && "name" in err) {
    const e = err as { name: unknown; message?: unknown };
    return `${String(e.name)}${e.message ? `: ${String(e.message)}` : ""}`;
  }
  return undefined;
}

export const BROWSER_ONLY_TEXT = "Saved in this browser only. Back up regularly.";
export const NOT_PERSISTED_TEXT =
  "This browser has not agreed to keep your sermons permanently and may clear them when space runs low. Back up now.";

/** Banner for browser-only mode. persisted=false means navigator.storage.persist() was refused. */
export function browserModeBanner(persisted: boolean | null): { text: string; strong: boolean } {
  return persisted === false
    ? { text: `${BROWSER_ONLY_TEXT} ${NOT_PERSISTED_TEXT}`, strong: true }
    : { text: BROWSER_ONLY_TEXT, strong: false };
}
