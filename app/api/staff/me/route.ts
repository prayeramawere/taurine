import { requireStaff } from "@/lib/staff-auth";
import { errorResponse, getSupabaseAdminClient, okResponse } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  let result = await requireStaff(request);
  let response: NextResponse | undefined;

  if (!result.authorized && result.response.status === 401) {
    const refreshToken = request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)staff_refresh_token=([^;]+)/)?.[1];
    if (refreshToken) {
      try {
        const supabase = getSupabaseAdminClient();
        const { data, error } = await supabase.auth.refreshSession({
          refresh_token: decodeURIComponent(refreshToken),
        });
        if (!error && data.session) {
          result = await requireStaff(
            new Request(request.url, {
              headers: { authorization: `Bearer ${data.session.access_token}` },
            }),
          );
          if (result.authorized) {
            response = NextResponse.json({
              success: true,
              data: {
                id: result.staff.staffId,
                name: result.staff.displayName,
                email: result.staff.user.email,
                role: result.staff.roleCode,
                roleName: result.staff.roleName,
                permissions: result.staff.permissions,
              },
            });
            response.cookies.set("staff_access_token", data.session.access_token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "strict",
              path: "/",
              maxAge: data.session.expires_in,
            });
            response.cookies.set("staff_refresh_token", data.session.refresh_token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "strict",
              path: "/",
              maxAge: 60 * 60 * 24 * 30,
            });
          }
        }
      } catch {
        console.error("STAFF_SESSION_REFRESH_FAILED");
      }
    }
  }

  if (!result.authorized) return result.response;
  return (
    response ??
    okResponse({
      id: result.staff.staffId,
      name: result.staff.displayName,
      email: result.staff.user.email,
      role: result.staff.roleCode,
      roleName: result.staff.roleName,
      permissions: result.staff.permissions,
    })
  );
}

export async function PATCH(request: Request) {
  const result = await requireStaff(request);
  if (!result.authorized) return result.response;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("STAFF_PROFILE_VALIDATION_ERROR", "Request body must be valid JSON.", 400);
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 1 ||
    typeof (payload as Record<string, unknown>).display_name !== "string"
  ) {
    return errorResponse("STAFF_PROFILE_VALIDATION_ERROR", "Only a display_name string may be changed.", 400);
  }
  const displayName = (payload as { display_name: string }).display_name.trim();
  if (!displayName || displayName.length > 160) {
    return errorResponse("STAFF_PROFILE_VALIDATION_ERROR", "display_name must be 1 to 160 characters.", 400);
  }
  const { error } = await result.staff.supabase
    .from("staff_profiles")
    .update({ display_name: displayName })
    .eq("staff_id", result.staff.staffId);
  if (error) {
    console.error("STAFF_PROFILE_UPDATE_FAILED");
    return errorResponse("STAFF_PROFILE_UPDATE_FAILED", "Profile could not be updated.", 500);
  }
  return okResponse({ display_name: displayName });
}
