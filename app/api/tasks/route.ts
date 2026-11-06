import { requireStaff, staffHasPermission, writeAuditLog } from "@/lib/staff-auth";
import { errorResponse, okResponse } from "@/lib/supabase";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const priorities = new Set(["low", "normal", "high", "urgent"]);
const statuses = new Set(["open", "in_progress", "completed", "cancelled"]);

export async function GET(request: Request) {
  const auth = await requireStaff(request);
  if (!auth.authorized) return auth.response;
  const canSeeAll = auth.staff.isAdmin || staffHasPermission(auth.staff, "tasks:read");
  if (!canSeeAll && !staffHasPermission(auth.staff, "tasks:assigned:read")) {
    return errorResponse("FORBIDDEN", "Your staff role cannot view tasks.", 403);
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 25);
  const status = url.searchParams.get("status");
  if (
    !Number.isSafeInteger(page) || page < 1 ||
    !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
    (status !== null && !statuses.has(status))
  ) {
    return errorResponse("TASK_QUERY_INVALID", "Task query parameters are invalid.", 400);
  }

  try {
    let query = auth.staff.supabase
      .from("tasks")
      .select("task_id, title, description, task_type, status, priority, assigned_to, lead_id, property_id, due_at, created_at, updated_at", { count: "exact" })
      .order("due_at", { ascending: true, nullsFirst: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (!canSeeAll) query = query.eq("assigned_to", auth.staff.staffId);
    if (status) query = query.eq("status", status);
    const { data, error, count } = await query;
    if (error) throw error;
    return okResponse({
      items: data ?? [],
      pagination: { page, pageSize, totalItems: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
    });
  } catch {
    console.error("TASK_LIST_FAILED");
    return errorResponse("TASK_LIST_FAILED", "Tasks could not be retrieved.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireStaff(request, "tasks:create");
  if (!auth.authorized) return auth.response;
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
  const allowed = new Set(["title", "description", "task_type", "priority", "assigned_to", "lead_id", "property_id", "due_at"]);
  const unknownFields = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknownFields.length) {
    return errorResponse("TASK_VALIDATION_ERROR", `Unsupported task fields: ${unknownFields.join(", ")}`, 400);
  }
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 180) {
    return errorResponse("TASK_VALIDATION_ERROR", "title must be 1 to 180 characters.", 400);
  }
  if (input.priority !== undefined && (typeof input.priority !== "string" || !priorities.has(input.priority))) {
    return errorResponse("TASK_VALIDATION_ERROR", "priority is invalid.", 400);
  }
  for (const key of ["lead_id", "property_id", "assigned_to"] as const) {
    const value = input[key];
    if (value !== undefined && value !== null && (typeof value !== "string" || !uuidPattern.test(value))) {
      return errorResponse("TASK_VALIDATION_ERROR", `${key} must be a UUID.`, 400);
    }
  }
  if (input.description !== undefined && input.description !== null &&
      (typeof input.description !== "string" || input.description.length > 4000)) {
    return errorResponse("TASK_VALIDATION_ERROR", "description must be at most 4000 characters.", 400);
  }
  if (input.due_at !== undefined && input.due_at !== null &&
      (typeof input.due_at !== "string" || !Number.isFinite(Date.parse(input.due_at)))) {
    return errorResponse("TASK_VALIDATION_ERROR", "due_at must be a valid timestamp.", 400);
  }
  const assignedTo = typeof input.assigned_to === "string" ? input.assigned_to : auth.staff.staffId;
  if (!auth.staff.isAdmin && assignedTo !== auth.staff.staffId) {
    return errorResponse("FORBIDDEN", "You may assign tasks only to yourself.", 403);
  }

  try {
    const { data, error } = await auth.staff.supabase
      .from("tasks")
      .insert({
        title: input.title.trim(),
        description: input.description ?? null,
        task_type: typeof input.task_type === "string" ? input.task_type.slice(0, 40) : "follow_up",
        priority: input.priority ?? "normal",
        assigned_to: assignedTo,
        lead_id: input.lead_id ?? null,
        property_id: input.property_id ?? null,
        due_at: input.due_at ?? null,
        created_by: auth.staff.staffId,
      })
      .select()
      .single();
    if (error) throw error;
    await writeAuditLog(auth.staff, { action: "task.created", entityType: "task", entityId: data.task_id, afterData: data });
    return okResponse(data, 201);
  } catch {
    console.error("TASK_CREATE_FAILED");
    return errorResponse("TASK_CREATE_FAILED", "The task could not be created.", 500);
  }
}
