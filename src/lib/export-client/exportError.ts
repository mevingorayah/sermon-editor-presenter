/**
 * Human-readable export error text from a POST /api/export error response.
 *
 * Backend 400 shape (docs/api-export-contract.md):
 *   { error: "Validation failed", details: Issue[] }   // zod issues
 *   Issue = { path: (string | number)[], message: string }
 * Content color-mark messages start with the exact mark path, e.g.
 *   "content.content[2].content[0].marks[0].color: Color must be …".
 * Non-validation 400s look like { error: string, details?: { code } }.
 */

export const MAX_EXPORT_ISSUES = 3;
const MAX_MESSAGE_CHARS = 120;

interface IssueLike {
  path?: unknown;
  message?: unknown;
}

/** ["resolvedColors","accent"] → "resolvedColors.accent"; numbers → [n]. */
export function formatIssuePath(path: unknown): string {
  if (!Array.isArray(path)) return typeof path === "string" ? path : "";
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else if (typeof seg === "string" && seg) out += out ? `.${seg}` : seg;
  }
  return out;
}

/**
 * Trim, optionally keep the first sentence, drop the trailing period, cap the
 * length and lower-case the lead letter (unless it starts an acronym like CSS).
 */
function conciseMessage(message: string, firstSentence = true): string {
  let m = message.trim();
  if (firstSentence) {
    // Split only at ". " + capital, so "rgb(r, g, b)" etc. stay intact.
    const stop = m.search(/\.\s+[A-Z]/);
    if (stop > 0) m = m.slice(0, stop);
  }
  m = m.replace(/\.$/, "");
  if (m.length > MAX_MESSAGE_CHARS) {
    m = `${m.slice(0, MAX_MESSAGE_CHARS - 1).trimEnd()}…`;
  }
  return /^[A-Z][a-z]/.test(m) ? m.charAt(0).toLowerCase() + m.slice(1) : m;
}

/** "field — message" for one zod-style issue (uses a path embedded in the message when more specific). */
export function formatIssue(issue: IssueLike): string {
  let path = formatIssuePath(issue.path);
  let message = typeof issue.message === "string" ? issue.message : "";
  const embedded = message.match(/^([A-Za-z_$][\w$]*(?:\.[\w$]+|\[\d+\])+):\s*([\s\S]+)$/);
  if (embedded && (!path || embedded[1].startsWith(path))) {
    path = embedded[1];
    message = embedded[2];
  }
  const text = message ? conciseMessage(message) : "invalid";
  return path ? `${path} — ${text}` : text;
}

function isIssue(v: unknown): v is IssueLike {
  return !!v && typeof v === "object" && ("message" in v || "path" in v);
}

/**
 * Build the status line for a failed export.
 * @param bodyText raw response body (may be non-JSON / empty)
 */
export function formatExportError(
  status: number,
  bodyText: string | null | undefined,
  statusText?: string,
): string {
  let data: unknown;
  try {
    data = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    data = undefined;
  }

  if (data && typeof data === "object") {
    const d = data as { error?: unknown; message?: unknown; details?: unknown; issues?: unknown };
    const list = Array.isArray(d.details)
      ? d.details
      : Array.isArray(d.issues)
        ? d.issues
        : null;
    const issues = (list ?? []).filter(isIssue);
    if (issues.length > 0) {
      const shown = issues.slice(0, MAX_EXPORT_ISSUES).map(formatIssue);
      const more = issues.length - shown.length;
      return `Export failed: ${shown.join("; ")}${more > 0 ? ` (+${more} more)` : ""}`;
    }
    const msg =
      typeof d.error === "string" && d.error.trim()
        ? d.error
        : typeof d.message === "string" && d.message.trim()
          ? d.message
          : null;
    if (msg) return `Export failed: ${conciseMessage(msg, false)}`;
  }

  const suffix = statusText?.trim() ? ` ${statusText.trim()}` : "";
  return `Export failed (HTTP ${status}${suffix}). Please try again.`;
}
