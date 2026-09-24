import { createSermonSchema } from "@/lib/sermon/schema";
import { createSermon, listSermons } from "@/lib/sermon/store";
import { handleRouteError, jsonOk } from "@/lib/sermon/http";

export const runtime = "nodejs";

/** GET /api/sermons — list sermons (newest updated first). */
export async function GET() {
  try {
    const sermons = await listSermons();
    return jsonOk({ sermons });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** POST /api/sermons — create a sermon. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createSermonSchema.parse(body);
    const sermon = await createSermon(parsed);
    return jsonOk({ sermon }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
