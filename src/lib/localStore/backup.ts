import { SERMON_BACKUP_EXTENSION, type SermonBackupFile } from "@/lib/sermon-file";
import type { SermonDocument } from "@/types/document";

export function backupFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `sermons-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}${SERMON_BACKUP_EXTENSION}`;
}

export type RestoreChange = "new" | "newer" | "older" | "same";

export interface RestorePreviewItem {
  id: string;
  title: string;
  updatedAt: string;
  change: RestoreChange;
  /** A different sermon with this id is already here: the writer must choose. */
  conflict: boolean;
}

export interface RestorePreview {
  backupSavedAt: string;
  count: number;
  items: RestorePreviewItem[];
  counts: Record<RestoreChange, number>;
}

function changeOf(cur: SermonDocument | undefined, inc: SermonDocument): RestoreChange {
  if (!cur) return "new";
  if (JSON.stringify(cur) === JSON.stringify(inc)) return "same";
  const a = Date.parse(inc.updatedAt);
  const b = Date.parse(cur.updatedAt);
  return a > b ? "newer" : a < b ? "older" : "newer";
}

export function previewRestore(existing: SermonDocument[], backup: SermonBackupFile): RestorePreview {
  const byId = new Map(existing.map((d) => [d.id, d]));
  const counts: Record<RestoreChange, number> = { new: 0, newer: 0, older: 0, same: 0 };
  const items = backup.sermons.map((s) => {
    const change = changeOf(byId.get(s.id), s);
    counts[change]++;
    return {
      id: s.id,
      title: s.title || "Untitled sermon",
      updatedAt: s.updatedAt,
      change,
      conflict: change === "newer" || change === "older",
    };
  });
  return { backupSavedAt: backup.savedAt, count: backup.sermons.length, items, counts };
}

/** Per-sermon choice for an id that already exists. Default is keep-both. */
export type ConflictChoice = "keep-both" | "replace";

export interface RestorePlan {
  /** Sermons to write (new ones, replacements, and restored copies). */
  toWrite: SermonDocument[];
  /** Restored copies saved under a new id: backup id → new id. */
  keptBoth: { fromId: string; toId: string }[];
  /** Existing ids overwritten by the backup copy (only when chosen). */
  replaced: string[];
}

export const RESTORED_SUFFIX = " (restored)";

/**
 * Nothing existing is ever removed. New sermons are added; identical ones are
 * skipped; for an id that already holds a different sermon the writer's
 * choice applies, defaulting to keep-both (restored copy under a new id with
 * " (restored)" on the title).
 */
export function planRestore(
  existing: SermonDocument[],
  backup: SermonBackupFile,
  choices: Record<string, ConflictChoice>,
  newId: () => string,
): RestorePlan {
  const byId = new Map(existing.map((d) => [d.id, d]));
  const plan: RestorePlan = { toWrite: [], keptBoth: [], replaced: [] };
  for (const s of backup.sermons) {
    const c = changeOf(byId.get(s.id), s);
    if (c === "same") continue;
    if (c === "new") {
      plan.toWrite.push(s);
      continue;
    }
    if ((choices[s.id] ?? "keep-both") === "replace") {
      plan.toWrite.push(s);
      plan.replaced.push(s.id);
    } else {
      const id = newId();
      plan.toWrite.push({ ...s, id, title: `${s.title || "Untitled sermon"}${RESTORED_SUFFIX}` });
      plan.keptBoth.push({ fromId: s.id, toId: id });
    }
  }
  return plan;
}

export const BACKUP_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;
export const LAST_BACKUP_KEY = "sermon-editor-presenter:last-backup-at:v1";
export const FIRST_USE_KEY = "sermon-editor-presenter:first-use-at:v1";
export const REMINDER_DISMISSED_KEY = "sermon-editor-presenter:backup-reminder-dismissed-at:v1";

/** Quiet reminder after 7 days without a backup (dismissing snoozes another 7). */
export function shouldShowBackupReminder(opts: {
  now: number;
  lastBackupAt: string | null;
  firstUseAt: string | null;
  dismissedAt: string | null;
}): boolean {
  const times = [opts.lastBackupAt, opts.firstUseAt, opts.dismissedAt]
    .map((t) => (t ? Date.parse(t) : NaN))
    .filter((n) => !Number.isNaN(n));
  if (times.length === 0) return false;
  return opts.now - Math.max(...times) >= BACKUP_REMINDER_MS;
}
