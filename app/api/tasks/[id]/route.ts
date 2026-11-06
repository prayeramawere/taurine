import { requireStaff, staffHasPermission, writeAuditLog } from "@/lib/staff-auth";
import { errorResponse, okResponse, resolveRouteId } from "@/lib/supabase";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set(["open", "in_progress", "completed", "cancelled"]);

export async function PATCH(
  request: Request,
  context: { params: Record<string, string> | Promise<Record<string, string>> },
) {
  const auth = await requireStaff(request);
  if (!auth.authorized) return auth.response;
  if (
    !auth.staff.isAdmin &&
    !staffHasPermission(auth.staff, "tasks:assigned:update") &&
    !staffHasPermission(auth.staff, "tasks:manage")
  ) {
    return errorResponse("FORBIDDEN", "Your staff role cannot update tasks.", 403);
  }
  const id = await resolveRouteId(context.params, "id");
  if (!id || !uuidPattern.test(id)) return errorResponse("TASK_ID_INVALID", "A valid task id is required.", 400);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("TASK_VALIDATION_ERROR", "Request body must be valid JSON.", 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return errorResponse("TASK_VALIDATION_ERROR", "Request body must be a JSON object.", 400);
  }
  const input = payload as Record<string, unknown>;
  if (
    Object.keys(input).length !== 1 ||
    typeof input.status !== "string" ||
    !statuses.has(input.status)
  ) {
    return errorResponse("TASK_VALIDATION_ERROR", "Only a valid task status may be updated.", 400);
  }

  try {
    let query = auth.staff.supabase.from("tasks").select("*").eq("task_id", id);
    if (!auth.staff.isAdmin && !staffHasPermission(auth.staff, "tasks:manage")) {
      query = query.eq("assigned_to", auth.staff.staffId);
    }
    const { data: current, error: fetchError } = await query.maybeSingle();
    if (fetchError) throw fetchError;
    if (!current) return errorResponse("TASK_NOT_FOUND", "Task was not found.", 404);

    const updateQuery = auth.staff.supabase
      .from("tasks")
      .update({
        status: input.status,
        completed_at: input.status === "completed" ? new Date().toISOString() : null,
      })
      .eq("task_id", id);
    if (!auth.staff.isAdmin && !staffHasPermission(auth.staff, "tasks:manage")) {
      updateQuery.eq("assigned_to", auth.staff.staffId);
    }
    const { data, error } = await updateQuery.select().single();
    if (error) throw error;
    await writeAuditLog(auth.staff, {
      action: "task.status_updated",
      entityType: "task",
      entityId: id,
      beforeData: { status: current.status },
      afterData: { status: data.status },
    });
    return okResponse(data);
  } catch {
    console.error("TASK_UPDATE_FAILED");
    return errorResponse("TASK_UPDATE_FAILED", "The task could not be updated.", 500);
  }
}
