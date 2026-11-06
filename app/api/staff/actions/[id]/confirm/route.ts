import { requireStaff } from "@/lib/staff-auth";
import { errorResponse, okResponse, resolveRouteId } from "@/lib/supabase";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: { params: Record<string, string> | Promise<Record<string, string>> },
) {
  const auth = await requireStaff(request);
  if (!auth.authorized) return auth.response;
  const id = await resolveRouteId(context.params, "id");
  if (!id || !uuidPattern.test(id)) {
    return errorResponse("CONFIRMATION_ID_INVALID", "A valid confirmation id is required.", 400);
  }
  try {
    const { data, error } = await auth.staff.supabase.rpc("confirm_staff_action", {
      p_confirmation_id: id,
      p_actor_user_id: auth.staff.user.id,
    });
    if (error) {
      if (error.code === "42501") return errorResponse("FORBIDDEN", "You cannot confirm this action.", 403);
      if (error.code === "P0002") return errorResponse("ENTITY_NOT_FOUND", "The target record no longer exists.", 404);
      if (error.code === "22023") return errorResponse("CONFIRMATION_UNAVAILABLE", "This confirmation is expired or invalid.", 409);
      throw error;
    }
    return okResponse(data);
  } catch {
    console.error("STAFF_ACTION_CONFIRM_FAILED");
    return errorResponse("STAFF_ACTION_CONFIRM_FAILED", "The action could not be confirmed.", 500);
  }
}
