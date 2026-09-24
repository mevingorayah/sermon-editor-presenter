import { updateContentSchema } from "@/lib/sermon/schema";
import { updateContent } from "@/lib/sermon/store";
import { handleRouteError, jsonOk } from "@/lib/sermon/http";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/sermons/[id]/content — server autosave.
 * Accepts TipTap `content` / `document` JSON (complements client localStorage).
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateContentSchema.parse(body);
    const sermon = await updateContent(id, parsed);
    return jsonOk({ sermon });
  } catch (err) {
    return handleRouteError(err);
  }
}
