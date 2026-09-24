import { exportSnapshot } from "@/lib/sermon/export";
import { parseExportRequest } from "@/lib/sermon/export/parseRequest";
import { handleRouteError, jsonError } from "@/lib/sermon/http";

export const runtime = "nodejs";

/**
 * POST /api/export
 *
 * Accepts Frontend `CalibratedSnapshot` (+ slice-2 options).
 * Format via body or `?format=` (docx|pdf|png|pptx); query wins; default docx.
 * Returns binary file bytes (not JSON), or 501 `{ error, code: "NOT_IMPLEMENTED" }`
 * when a worker is intentionally stubbed.
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const body = await request.json();
    const {
      snapshot,
      format,
      filenameStem,
      includeNotes,
      notes,
      resolvedColors,
    } = parseExportRequest(body, url.searchParams);

    // Defense: refuse bionic true even if schema somehow bypassed.
    if ((snapshot as { bionic?: boolean }).bionic === true) {
      return jsonError("bionic must be false in export snapshots", 400);
    }

    const result = await exportSnapshot(snapshot, format, {
      filenameStem,
      includeNotes,
      notes,
      resolvedColors,
    });

    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const e = err as { status?: number; code?: string; message?: string };
    if (e?.code === "NOT_IMPLEMENTED") {
      return Response.json(
        {
          error: e.message || "Export format not implemented",
          code: "NOT_IMPLEMENTED",
        },
        { status: 501 },
      );
    }
    if (e?.code === "INVALID_FORMAT" || e?.status === 400) {
      if (e.message && !(err instanceof Error && err.name === "ZodError")) {
        // parseExportRequest format errors (non-Zod)
        if (e.code === "INVALID_FORMAT") {
          return jsonError(e.message, 400, { code: e.code });
        }
      }
    }
    return handleRouteError(err);
  }
}

export async function GET() {
  return jsonError(
    "Use POST with CalibratedSnapshot JSON. Optional ?format=docx|pdf|png|pptx (default docx). See docs/api-export-contract.md",
    405,
  );
}
