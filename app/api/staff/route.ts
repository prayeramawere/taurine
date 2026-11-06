import { requireStaff, writeAuditLog } from "@/lib/staff-auth";
import { errorResponse, okResponse } from "@/lib/supabase";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: Request) {
  const auth = await requireStaff(request, "staff:manage");
  if (!auth.authorized) return auth.response;
  const { data, error } = await auth.staff.supabase
    .from("staff_profiles")
    .select("staff_id, display_name, email, is_active, created_at, staff_roles(role_code, display_name, permissions)")
    .order("display_name");
  if (error) {
    console.error("STAFF_LIST_FAILED");
    return errorResponse("STAFF_LIST_FAILED", "Staff profiles could not be retrieved.", 500);
  }
  return okResponse(data ?? []);
}

export async function POST(request: Request) {
  const auth = await requireStaff(request, "staff:manage");
  if (!auth.authorized) return auth.response;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("STAFF_VALIDATION_ERROR", "Request body must be valid JSON.", 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return errorResponse("STAFF_VALIDATION_ERROR", "Request body must be a JSON object.", 400);
  }
  const input = payload as Record<string, unknown>;
  if (
    typeof input.email !== "string" ||
    !emailPattern.test(input.email) ||
    input.email.length > 255 ||
    typeof input.display_name !== "string" ||
    !input.display_name.trim() ||
    input.display_name.length > 160 ||
    typeof input.role_code !== "string"
  ) {
    return errorResponse("STAFF_VALIDATION_ERROR", "A valid email, display name, and role_code are required.", 400);
  }

  const { data: role, error: roleError } = await auth.staff.supabase
    .from("staff_roles")
    .select("role_id, role_code, display_name")
    .eq("role_code", input.role_code)
    .maybeSingle();
  if (roleError) {
    console.error("STAFF_ROLE_LOOKUP_FAILED");
    return errorResponse("STAFF_ROLE_LOOKUP_FAILED", "The requested staff role could not be checked.", 500);
  }
  if (!role) return errorResponse("STAFF_ROLE_INVALID", "The requested staff role does not exist.", 400);

  let invitedUserId: string | null = null;
  try {
    const { data: invitation, error: inviteError } = await auth.staff.supabase.auth.admin.inviteUserByEmail(
      input.email.trim(),
      { data: { full_name: input.display_name.trim() } },
    );
    if (inviteError || !invitation.user) {
      console.error("STAFF_INVITE_FAILED");
      return errorResponse("STAFF_INVITE_FAILED", "The staff invitation could not be sent.", 400);
    }
    invitedUserId = invitation.user.id;
    if (role.role_code === "administrator") {
      const { error: metadataError } = await auth.staff.supabase.auth.admin.updateUserById(invitedUserId, {
        app_metadata: { ...invitation.user.app_metadata, agency_role: "admin" },
      });
      if (metadataError) throw metadataError;
    }
    const { data: profile, error: insertError } = await auth.staff.supabase
      .from("staff_profiles")
      .insert({
        auth_user_id: invitedUserId,
        role_id: role.role_id,
        display_name: input.display_name.trim(),
        email: input.email.trim().toLowerCase(),
      })
      .select("staff_id, display_name, email, is_active, staff_roles(role_code, display_name)")
      .single();
    if (insertError) throw insertError;
    await writeAuditLog(auth.staff, {
      action: "staff.invited",
      entityType: "staff_profile",
      entityId: profile.staff_id,
      afterData: { role_code: role.role_code, email: profile.email },
    });
    return okResponse({ staff: profile, invitationSent: true }, 201);
  } catch {
    if (invitedUserId) {
      const { error } = await auth.staff.supabase.auth.admin.deleteUser(invitedUserId);
      if (error) console.error("STAFF_INVITE_ROLLBACK_FAILED");
    }
    console.error("STAFF_PROFILE_CREATE_FAILED");
    return errorResponse("STAFF_PROFILE_CREATE_FAILED", "The staff profile could not be created.", 500);
  }
}
