import { isNewerOnDisk } from "@/lib/sermon-file";

export type WriteDecision = "write" | "conflict";

/**
 * Before each write: if the copy on disk was saved after the one this tab
 * loaded (another tab or window wrote it), never overwrite silently.
 * `force` = the writer chose "Keep mine".
 */
export function decideWrite(
  loadedSavedAt: string | null | undefined,
  diskSavedAt: string | null | undefined,
  force = false,
): WriteDecision {
  if (force || !diskSavedAt) return "write";
  if (!loadedSavedAt) return "conflict"; // a file appeared we never loaded
  return isNewerOnDisk(loadedSavedAt, diskSavedAt) ? "conflict" : "write";
}

export const SYNC_CHANNEL = "sermon-editor-presenter:sync:v1";

export interface SyncMessage {
  /** opened/here/closed: presence pings so a second tab is warned on open (ST9). */
  type: "saved" | "deleted" | "restored" | "opened" | "here" | "closed";
  id?: string;
  savedAt?: string;
  tabId: string;
}

/** A broadcast from another tab means our open copy is now stale. */
export function isStaleFor(
  msg: SyncMessage,
  myTabId: string,
  openId: string | null,
  loadedSavedAt: string | null,
): boolean {
  if (msg.tabId === myTabId) return false;
  if (msg.type === "opened" || msg.type === "here" || msg.type === "closed") return false;
  if (msg.type === "restored") return true;
  if (!openId || msg.id !== openId) return false;
  if (msg.type === "deleted") return true;
  return decideWrite(loadedSavedAt, msg.savedAt) === "conflict";
}

export const OPEN_ELSEWHERE_TEXT = "This sermon is open in another tab";

/**
 * Presence on open: a tab that opens a sermon says "opened"; a tab that has
 * the same sermon open warns and answers "here", so both tabs warn at once,
 * before anyone saves.
 */
export function presenceAction(
  msg: SyncMessage,
  myTabId: string,
  openId: string | null,
): "warn-and-reply" | "warn" | "clear" | null {
  if (msg.tabId === myTabId || !openId || msg.id !== openId) return null;
  if (msg.type === "opened") return "warn-and-reply";
  if (msg.type === "here") return "warn";
  if (msg.type === "closed" || msg.type === "deleted") return "clear";
  return null;
}
