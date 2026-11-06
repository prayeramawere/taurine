import { requireStaff } from "@/lib/staff-auth";
import { errorResponse, okResponse } from "@/lib/supabase";

export async function GET(request: Request) {
  const auth = await requireStaff(request);
  if (!auth.authorized) return auth.response;
  try {
    const { data, error } = await auth.staff.supabase.rpc("get_agency_operation_summary", {
      p_days: 7,
    });
    if (error) throw error;
    return okResponse(data);
  } catch {
    console.error("STAFF_DASHBOARD_FAILED");
    return errorResponse("STAFF_DASHBOARD_FAILED", "Dashboard statistics could not be retrieved.", 500);
  }
}
