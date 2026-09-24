import { NextResponse } from "next/server";

/**
 * POST /api/export — Frontend scaffold stub.
 * Accepts a CalibratedSnapshot JSON body for contract probing.
 * Real DOCX/PDF generation is owned by Backend (not implemented here).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Echo shape for local debugging; never claim a successful export file.
    console.log("[api/export stub] received snapshot keys:", body && Object.keys(body));
  } catch {
    // ignore invalid JSON — still 501
  }
  return NextResponse.json(
    {
      error: "Not Implemented",
      message:
        "Export is owned by Backend. POST a CalibratedSnapshot; this scaffold returns 501.",
    },
    { status: 501 },
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Method Not Allowed",
      message: "Use POST with a CalibratedSnapshot body. Backend will implement export.",
    },
    { status: 405 },
  );
}
