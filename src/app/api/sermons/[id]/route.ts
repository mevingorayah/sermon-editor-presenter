import { updateSermonSchema } from "@/lib/sermon/schema";
import { deleteSermon, getSermon, updateSermon } from "@/lib/sermon/store";
import { handleRouteError, jsonError, jsonOk } from "@/lib/sermon/http";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const sermon = await getSermon(id);
    if (!sermon) return jsonError("Sermon not found", 404);
    return jsonOk({ sermon });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSermonSchema.parse(body);
    const sermon = await updateSermon(id, parsed);
    return jsonOk({ sermon });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const deleted = await deleteSermon(id);
    if (!deleted) return jsonError("Sermon not found", 404);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
