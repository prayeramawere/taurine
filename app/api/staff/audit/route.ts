import { requireStaff } from "@/lib/staff-auth";
import { errorResponse, okResponse } from "@/lib/supabase";

export async function GET(request: Request) {
  const auth = await requireStaff(request);
  if (!auth.authorized) return auth.response;
  if (!auth.staff.isAdmin) return errorResponse("FORBIDDEN", "Administrator access is required.", 403);

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 25);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return errorResponse("AUDIT_QUERY_INVALID", "Pagination parameters are invalid.", 400);
  }
  try {
    const { data, error, count } = await auth.staff.supabase
      .from("audit_logs")
      .select("audit_id, actor_user_id, actor_staff_id, action, entity_type, entity_id, before_data, after_data, request_id, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw error;
    return okResponse({
      items: data ?? [],
      pagination: { page, pageSize, totalItems: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
    });
  } catch {
    console.error("AUDIT_LOG_LIST_FAILED");
    return errorResponse("AUDIT_LOG_LIST_FAILED", "Audit records could not be retrieved.", 500);
  }
}
