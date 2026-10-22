/**
 * Keep the screen awake while Preach is open (Screen Wake Lock API).
 * Re-acquires when the tab becomes visible again (the browser drops the lock
 * when it is hidden). Unsupported or refused: fails silently.
 */
interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
}
interface WakeLockNav {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
}

export function keepScreenAwake(
  nav: WakeLockNav = typeof navigator !== "undefined" ? (navigator as unknown as WakeLockNav) : {},
  doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener"> | undefined =
    typeof document !== "undefined" ? document : undefined,
): () => void {
  if (!nav.wakeLock || !doc) return () => {};
  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;
  const acquire = async () => {
    if (stopped || doc.visibilityState !== "visible") return;
    if (sentinel && !sentinel.released) return;
    try {
      sentinel = await nav.wakeLock!.request("screen");
      if (stopped) void sentinel.release().catch(() => {});
    } catch {
      sentinel = null; // refused (battery saver, no gesture…): stay silent
    }
  };
  const onVisible = () => {
    if (doc.visibilityState === "visible") void acquire();
  };
  doc.addEventListener("visibilitychange", onVisible);
  void acquire();
  return () => {
    stopped = true;
    doc.removeEventListener("visibilitychange", onVisible);
    if (sentinel) void sentinel.release().catch(() => {});
    sentinel = null;
  };
}
