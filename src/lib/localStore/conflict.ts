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
  type: "saved" | "deleted" | "restored";
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
  if (msg.type === "restored") return true;
  if (!openId || msg.id !== openId) return false;
  if (msg.type === "deleted") return true;
  return decideWrite(loadedSavedAt, msg.savedAt) === "conflict";
}
