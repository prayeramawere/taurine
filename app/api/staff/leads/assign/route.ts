import { requireStaff } from "@/lib/staff-auth";
import { errorResponse, okResponse } from "@/lib/supabase";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireStaff(request, "leads:assign");
  if (!auth.authorized) return auth.response;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return errorResponse("ASSIGNMENT_INVALID", "Request body must be valid JSON.", 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return errorResponse("ASSIGNMENT_INVALID", "Request body must be a JSON object.", 400);
  }
  const payload = input as Record<string, unknown>;
  if (
    Object.keys(payload).some((key) => !["lead_id", "staff_id", "reason"].includes(key)) ||
    typeof payload.lead_id !== "string" || !uuidPattern.test(payload.lead_id) ||
    typeof payload.staff_id !== "string" || !uuidPattern.test(payload.staff_id) ||
    (payload.reason !== undefined && (typeof payload.reason !== "string" || payload.reason.length > 80))
  ) {
    return errorResponse("ASSIGNMENT_INVALID", "A valid lead id, staff id, and optional reason are required.", 400);
  }
  try {
    const { data, error } = await auth.staff.supabase.rpc("assign_staff_lead", {
      p_lead_id: payload.lead_id,
      p_staff_id: payload.staff_id,
      p_actor_user_id: auth.staff.user.id,
      p_assignment_reason: payload.reason ?? "manual",
    });
    if (error) {
      if (error.code === "42501") return errorResponse("FORBIDDEN", "You may not assign leads.", 403);
      if (error.code === "P0002") return errorResponse("ASSIGNMENT_TARGET_NOT_FOUND", "Lead or active staff member was not found.", 404);
      throw error;
    }
    return okResponse(data);
  } catch {
    console.error("LEAD_ASSIGNMENT_FAILED");
    return errorResponse("LEAD_ASSIGNMENT_FAILED", "The lead could not be assigned.", 500);
  }
}
