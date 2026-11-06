import { requireStaff } from "@/lib/staff-auth";
import { errorResponse, okResponse } from "@/lib/supabase";

export async function POST(request: Request) {
  const configuredSecret = process.env.AUTOMATION_RUNNER_SECRET;
  const suppliedSecret = request.headers.get("x-automation-secret");
  const isRunner = Boolean(configuredSecret && suppliedSecret && suppliedSecret === configuredSecret);
  let staff;
  if (!isRunner) {
    const auth = await requireStaff(request);
    if (!auth.authorized) return auth.response;
    if (!auth.staff.isAdmin) return errorResponse("FORBIDDEN", "Administrator access is required.", 403);
    staff = auth.staff;
  }
  try {
    const { data, error } = await (staff?.supabase ?? (await import("@/lib/supabase")).getSupabaseAdminClient())
      .rpc("process_agency_automation_jobs");
    if (error) throw error;
    return okResponse(data);
  } catch {
    console.error("AUTOMATION_RUN_FAILED");
    return errorResponse("AUTOMATION_RUN_FAILED", "Automation jobs could not be processed.", 500);
  }
}
