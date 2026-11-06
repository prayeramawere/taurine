import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAgencyAdminClaim } from "@/lib/agency-admin-claims";
import { errorResponse, getSupabaseAdminClient } from "@/lib/supabase";

export type AgencyAdminResult =
  | { authorized: true; supabase: SupabaseClient }
  | { authorized: false; response: ReturnType<typeof errorResponse> };

export async function requireAgencyAdmin(
  request: Request,
  permission?: string,
): Promise<AgencyAdminResult> {
  const authorization = request.headers.get("authorization");
  const cookieToken = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("staff_access_token="))
    ?.slice("staff_access_token=".length);
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? cookieToken;
  if (!token) {
    return {
      authorized: false,
      response: errorResponse("UNAUTHORIZED", "A valid agency admin session is required.", 401),
    };
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return {
        authorized: false,
        response: errorResponse("UNAUTHORIZED", "A valid agency admin session is required.", 401),
      };
    }
    if (!hasAgencyAdminClaim(data.user.app_metadata, permission)) {
      return {
        authorized: false,
        response: errorResponse("FORBIDDEN", "Agency administrator access is required.", 403),
      };
    }
    return { authorized: true, supabase };
  } catch {
    console.error("AGENCY_ADMIN_AUTH_FAILED");
    return {
      authorized: false,
      response: errorResponse("AUTH_SERVICE_UNAVAILABLE", "Authentication is temporarily unavailable.", 503),
    };
  }
}
