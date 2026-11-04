/**
 * Minimal File System Access API shapes we rely on. Declared here (not taken
 * from lib.dom) so tests can pass in-memory mocks and so the
 * not-yet-standard bits (queryPermission, showDirectoryPicker) are typed.
 */

export type PermissionStateLike = "granted" | "denied" | "prompt";

export interface WritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}

export interface FileHandleLike {
  kind: "file";
  name: string;
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<WritableLike>;
  /** Rename in place (Chromium). Optional: callers fall back to copy + delete. */
  move?(newName: string): Promise<void>;
}

export interface DirHandleLike {
  kind: "directory";
  name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string): Promise<void>;
  values(): AsyncIterable<FileHandleLike | { kind: "directory"; name: string }>;
  queryPermission?(desc: { mode: "readwrite" }): Promise<PermissionStateLike>;
  requestPermission?(desc: { mode: "readwrite" }): Promise<PermissionStateLike>;
}

type PickerWindow = {
  showDirectoryPicker?: (opts?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: string;
  }) => Promise<DirHandleLike>;
};

/** True when the browser can save into a real folder (Chrome / Edge desktop). */
export function folderApiAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as PickerWindow).showDirectoryPicker === "function"
  );
}

export async function pickSermonsFolder(): Promise<DirHandleLike> {
  const w = window as unknown as PickerWindow;
  if (!w.showDirectoryPicker) throw new Error("Folder saving isn't available");
  return w.showDirectoryPicker({ id: "sermons", mode: "readwrite", startIn: "documents" });
}

export async function queryFolderPermission(dir: DirHandleLike): Promise<PermissionStateLike> {
  if (!dir.queryPermission) return "granted";
  return dir.queryPermission({ mode: "readwrite" });
}

/** Must run inside a user gesture (click). */
export async function requestFolderPermission(dir: DirHandleLike): Promise<PermissionStateLike> {
  if (!dir.requestPermission) return "granted";
  return dir.requestPermission({ mode: "readwrite" });
}
