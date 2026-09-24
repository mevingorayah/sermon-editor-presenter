/**
 * Sanitize a download filename stem for Content-Disposition.
 * Empty / whitespace-only → "sermon-export".
 */
export function sanitizeFilenameStem(raw: string | undefined | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "sermon-export";
  const stem = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return stem || "sermon-export";
}

export function filenameWithExt(
  stem: string | undefined | null,
  ext: string,
): string {
  return `${sanitizeFilenameStem(stem)}.${ext}`;
}
