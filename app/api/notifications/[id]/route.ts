import { requireStaff } from "@/lib/staff-auth";
import { errorResponse, okResponse, resolveRouteId } from "@/lib/supabase";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  context: { params: Record<string, string> | Promise<Record<string, string>> },
) {
  const auth = await requireStaff(request);
  if (!auth.authorized) return auth.response;

  const id = await resolveRouteId(context.params, "id");
  if (!id || !uuidPattern.test(id)) {
    return errorResponse("NOTIFICATION_ID_INVALID", "A valid notification id is required.", 400);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("NOTIFICATION_VALIDATION_ERROR", "Request body must contain valid JSON.", 400);
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 1 ||
    typeof (payload as Record<string, unknown>).is_read !== "boolean"
  ) {
    return errorResponse("NOTIFICATION_VALIDATION_ERROR", "Only the boolean is_read field may be updated.", 400);
  }

  try {
    let query = auth.staff.supabase
      .from("notifications")
      .update({ is_read: (payload as { is_read: boolean }).is_read })
      .eq("notification_id", id);
    if (!auth.staff.isAdmin) query = query.eq("recipient_user_id", auth.staff.user.id);
    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    if (!data) return errorResponse("NOTIFICATION_NOT_FOUND", "Notification was not found.", 404);
    return okResponse(data);
  } catch {
    console.error("NOTIFICATION_UPDATE_FAILED");
    return errorResponse("NOTIFICATION_UPDATE_FAILED", "The notification could not be updated.", 500);
  }
}
