/**
 * Return focus after a panel/dialog closes (WAI-ARIA disclosure/dialog
 * guidance): back to the element that opened it, or — when that element is
 * gone (e.g. it lived on another route) — to the first usable fallback.
 * Never throws; returns the element that received focus, or null.
 */

type Candidate = Element | null | undefined | (() => Element | null | undefined);

function isFocusable(el: Element | null | undefined): el is HTMLElement {
  if (!el || typeof (el as HTMLElement).focus !== "function") return false;
  if (!el.isConnected) return false;
  const h = el as HTMLElement & { disabled?: boolean };
  if (h.disabled) return false;
  if (h.closest?.("[inert],[hidden]")) return false;
  return true;
}

function tryFocus(el: HTMLElement, allowTabIndex: boolean): boolean {
  try {
    const doc = el.ownerDocument;
    el.focus({ preventScroll: true });
    if (doc.activeElement === el) return true;
    if (allowTabIndex && !el.hasAttribute("tabindex")) {
      // Headings aren't focusable by default: make it programmatically
      // focusable (not in tab order) just for this.
      el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
      return doc.activeElement === el;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function restoreFocus(
  opener: Element | null | undefined,
  fallbacks: Candidate[] = [],
): HTMLElement | null {
  try {
    if (isFocusable(opener) && tryFocus(opener, false)) return opener;
    for (const c of fallbacks) {
      let el: Element | null | undefined;
      try {
        el = typeof c === "function" ? c() : c;
      } catch {
        el = null;
      }
      if (isFocusable(el) && tryFocus(el, true)) return el;
    }
    if (typeof document !== "undefined") {
      const active = document.activeElement as HTMLElement | null;
      // Last resort: body (blur whatever detached/stale element holds focus).
      if (active && active !== document.body) active.blur?.();
      return document.body ?? null;
    }
  } catch {
    /* never throw from focus management */
  }
  return null;
}
