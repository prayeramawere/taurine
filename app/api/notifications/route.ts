import { requireStaff } from "@/lib/staff-auth";
import { errorResponse, okResponse } from "@/lib/supabase";

export async function GET(request: Request) {
  const auth = await requireStaff(request);
  if (!auth.authorized) return auth.response;

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const isReadValue = url.searchParams.get("is_read");
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    (isReadValue !== null && !["true", "false"].includes(isReadValue))
  ) {
    return errorResponse("NOTIFICATION_QUERY_INVALID", "Pagination or filter parameters are invalid.", 400);
  }

  try {
    let query = auth.staff.supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (!auth.staff.isAdmin) query = query.eq("recipient_user_id", auth.staff.user.id);
    if (isReadValue !== null) query = query.eq("is_read", isReadValue === "true");
    const { data, count, error } = await query;
    if (error) throw error;
    return okResponse({
      items: data ?? [],
      pagination: {
        page,
        pageSize,
        totalItems: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    });
  } catch {
    console.error("NOTIFICATION_LIST_FAILED");
    return errorResponse("NOTIFICATION_LIST_FAILED", "Notifications could not be retrieved.", 500);
  }
}
