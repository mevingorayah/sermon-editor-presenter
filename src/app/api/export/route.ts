import { exportSnapshot } from "@/lib/sermon/export";
import { parseExportRequest } from "@/lib/sermon/export/parseRequest";
import { handleRouteError, jsonError } from "@/lib/sermon/http";

export const runtime = "nodejs";

/**
 * POST /api/export
 *
 * Accepts Frontend `CalibratedSnapshot` (see `src/types/document.ts`).
 * Optional `format` via body (`docx`|`pdf`) or `?format=`; default `docx`.
 * Returns binary file bytes (not JSON).
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const body = await request.json();
    const { snapshot, format } = parseExportRequest(body, url.searchParams);

    // Defense: refuse bionic true even if schema somehow bypassed.
    if ((snapshot as { bionic?: boolean }).bionic === true) {
      return jsonError("bionic must be false in export snapshots", 400);
    }

    const result = await exportSnapshot(snapshot, format);

    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET() {
  return jsonError(
    "Use POST with CalibratedSnapshot JSON. Optional ?format=docx|pdf (default docx). See docs/api-export-contract.md",
    405,
  );
}
