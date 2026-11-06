import { NextResponse } from "next/server";
import { getSupabaseAdminClient, errorResponse } from "@/lib/supabase";
import { requireStaff } from "@/lib/staff-auth";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("LOGIN_VALIDATION_ERROR", "Request body must be valid JSON.", 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return errorResponse("LOGIN_VALIDATION_ERROR", "Request body must be a JSON object.", 400);
  }
  const { email, password } = payload as Record<string, unknown>;
  if (
    typeof email !== "string" ||
    email.length > 255 ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 1024
  ) {
    return errorResponse("LOGIN_VALIDATION_ERROR", "A valid email and password are required.", 400);
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.session) {
      return errorResponse("LOGIN_FAILED", "Email or password is incorrect.", 401);
    }

    const authRequest = new Request(request.url, {
      headers: { authorization: `Bearer ${data.session.access_token}` },
    });
    const staffResult = await requireStaff(authRequest);
    if (!staffResult.authorized) {
      await supabase.auth.signOut({ scope: "local" });
      return staffResult.response;
    }

    const response = NextResponse.json({
      success: true,
      data: {
        staff: {
          id: staffResult.staff.staffId,
          name: staffResult.staff.displayName,
          displayName: staffResult.staff.displayName,
          email: data.user.email,
          role: staffResult.staff.roleCode,
          roleName: staffResult.staff.roleName,
          permissions: staffResult.staff.permissions,
        },
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
    return response;
  } catch {
    console.error("STAFF_LOGIN_FAILED");
    return errorResponse("LOGIN_UNAVAILABLE", "Sign in is temporarily unavailable.", 503);
  }
}

export async function DELETE(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)staff_access_token=([^;]+)/)?.[1];
  if (token) {
    try {
      const supabase = getSupabaseAdminClient();
      await supabase.auth.admin.signOut(token, "local");
    } catch {
      console.error("STAFF_LOGOUT_REVOKE_FAILED");
    }
  }
  const response = NextResponse.json({ success: true, data: { signedOut: true } });
  response.cookies.set("staff_access_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set("staff_refresh_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
