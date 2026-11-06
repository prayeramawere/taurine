import { requireStaff, staffHasPermission } from "@/lib/staff-auth";
import { errorResponse, okResponse } from "@/lib/supabase";

const statuses = new Set(["waiting", "matched", "notified", "fulfilled", "cancelled"]);

export async function GET(request: Request) {
  const auth = await requireStaff(request);
  if (!auth.authorized) return auth.response;
  if (!auth.staff.isAdmin && !staffHasPermission(auth.staff, "leads:read")) {
    return errorResponse("FORBIDDEN", "Your staff role cannot view waitlist requests.", 403);
  }
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 25);
  if (
    !Number.isSafeInteger(page) || page < 1 ||
    !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
    (status !== null && !statuses.has(status))
  ) {
    return errorResponse("WAITLIST_QUERY_INVALID", "Waitlist query parameters are invalid.", 400);
  }
  try {
    let query = auth.staff.supabase
      .from("property_match_requests")
      .select("request_id, lead_id, preferred_location, budget_min, budget_max, property_type, bedrooms_required, additional_requirements, match_status, last_matched_at, created_at, updated_at, leads!inner(first_name, last_name, email, phone_number, lead_status, consent_to_contact, consent_to_updates), property_matches(match_id, property_id, relevance_score, match_reasons, match_status, properties(property_type, location, listing_price, listing_status))", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (status) query = query.eq("match_status", status);
    const { data, error, count } = await query;
    if (error) throw error;
    return okResponse({
      items: data ?? [],
      pagination: { page, pageSize, totalItems: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
    });
  } catch {
    console.error("STAFF_WAITLIST_LIST_FAILED");
    return errorResponse("STAFF_WAITLIST_LIST_FAILED", "Waitlist requests could not be retrieved.", 500);
  }
}
