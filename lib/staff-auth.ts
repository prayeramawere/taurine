import type { SupabaseClient, User } from "@supabase/supabase-js";
import { errorResponse } from "@/lib/supabase";
import { getSupabaseAdminClient } from "@/lib/supabase";

export type StaffContext = {
  supabase: SupabaseClient;
  user: User;
  staffId: string;
  displayName: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  isAdmin: boolean;
};

export type StaffAuthResult =
  | { authorized: true; staff: StaffContext }
  | { authorized: false; response: ReturnType<typeof errorResponse> };

export function getStaffAccessToken(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return bearer;
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("staff_access_token="))
    ?.slice("staff_access_token=".length);
}

export function staffHasPermission(staff: StaffContext, permission: string) {
  return staff.permissions.includes("*") || staff.permissions.includes(permission);
}

export async function requireStaff(
  request: Request,
  permission?: string,
): Promise<StaffAuthResult> {
  const token = getStaffAccessToken(request);
  if (!token) {
    return {
      authorized: false,
      response: errorResponse("UNAUTHORIZED", "A valid staff session is required.", 401),
    };
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return {
        authorized: false,
        response: errorResponse("UNAUTHORIZED", "Your staff session is invalid or expired.", 401),
      };
    }

    const user = authData.user;
    let { data: profile, error } = await supabase
      .from("staff_profiles")
      .select("staff_id, auth_user_id, display_name, email, is_active, staff_roles!inner(role_code, display_name, permissions)")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    if (!profile && user.app_metadata?.agency_role === "admin") {
      const { data: role, error: roleError } = await supabase
        .from("staff_roles")
        .select("role_id")
        .eq("role_code", "administrator")
        .single();
      if (roleError) throw roleError;
      const displayName =
        (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
        user.email ||
        "Administrator";
      const { error: insertError } = await supabase.from("staff_profiles").upsert(
        {
          auth_user_id: user.id,
          role_id: role.role_id,
          display_name: displayName,
          email: user.email ?? "",
          is_active: true,
        },
        { onConflict: "auth_user_id" },
      );
      if (insertError) throw insertError;
      const refreshed = await supabase
        .from("staff_profiles")
        .select("staff_id, auth_user_id, display_name, email, is_active, staff_roles!inner(role_code, display_name, permissions)")
        .eq("auth_user_id", user.id)
        .single();
      if (refreshed.error) throw refreshed.error;
      profile = refreshed.data;
    }

    if (!profile || !profile.is_active) {
      return {
        authorized: false,
        response: errorResponse("STAFF_PROFILE_INACTIVE", "This account is not an active staff member.", 403),
      };
    }

    const roleValue = profile.staff_roles as unknown;
    const role = Array.isArray(roleValue) ? roleValue[0] : roleValue;
    if (!role || typeof role !== "object") {
      return {
        authorized: false,
        response: errorResponse("STAFF_ROLE_INVALID", "The staff role is not configured.", 403),
      };
    }
    const roleRecord = role as Record<string, unknown>;
    const permissions = Array.isArray(roleRecord.permissions)
      ? roleRecord.permissions.filter((item): item is string => typeof item === "string")
      : [];
    const isAdmin = roleRecord.role_code === "administrator";

    if (isAdmin && !permissions.includes("*")) permissions.push("*");
    if (permission && !permissions.includes("*") && !permissions.includes(permission)) {
      return {
        authorized: false,
        response: errorResponse("FORBIDDEN", "Your staff role does not allow this operation.", 403),
      };
    }

    return {
      authorized: true,
      staff: {
        supabase,
        user,
        staffId: profile.staff_id,
        displayName: profile.display_name,
        roleCode: String(roleRecord.role_code),
        roleName: String(roleRecord.display_name),
        permissions,
        isAdmin,
      },
    };
  } catch {
    console.error("STAFF_AUTH_LOOKUP_FAILED");
    return {
      authorized: false,
      response: errorResponse("STAFF_AUTH_UNAVAILABLE", "Staff authentication is temporarily unavailable.", 503),
    };
  }
}

export async function writeAuditLog(
  staff: StaffContext,
  input: {
    action: string;
    entityType: string;
    entityId?: string;
    beforeData?: unknown;
    afterData?: unknown;
    requestId?: string;
  },
) {
  const { error } = await staff.supabase.from("audit_logs").insert({
    actor_user_id: staff.user.id,
    actor_staff_id: staff.staffId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before_data: input.beforeData ?? null,
    after_data: input.afterData ?? null,
    request_id: input.requestId ?? null,
  });
  if (error) {
    console.error("AUDIT_LOG_WRITE_FAILED");
    throw new Error("The operation audit record could not be saved.");
  }
}
