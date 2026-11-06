import { requireStaff, writeAuditLog } from "@/lib/staff-auth";
import { errorResponse, okResponse, resolveRouteId } from "@/lib/supabase";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  context: { params: Record<string, string> | Promise<Record<string, string>> },
) {
  const auth = await requireStaff(request, "staff:manage");
  if (!auth.authorized) return auth.response;
  const staffId = await resolveRouteId(context.params, "id");
  if (!staffId || !uuidPattern.test(staffId)) {
    return errorResponse("STAFF_ID_INVALID", "A valid staff id is required.", 400);
  }
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
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !["role_code", "is_active", "display_name"].includes(key))) {
    return errorResponse("STAFF_VALIDATION_ERROR", "Only role_code, is_active, and display_name can be changed.", 400);
  }
  if (
    (input.role_code !== undefined && typeof input.role_code !== "string") ||
    (input.is_active !== undefined && typeof input.is_active !== "boolean") ||
    (input.display_name !== undefined &&
      (typeof input.display_name !== "string" || !input.display_name.trim() || input.display_name.length > 160))
  ) {
    return errorResponse("STAFF_VALIDATION_ERROR", "One or more staff fields are invalid.", 400);
  }

  const { data: current, error: currentError } = await auth.staff.supabase
    .from("staff_profiles")
    .select("staff_id, auth_user_id, display_name, email, is_active, staff_roles(role_id, role_code)")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (currentError) {
    console.error("STAFF_FETCH_FAILED");
    return errorResponse("STAFF_FETCH_FAILED", "The staff profile could not be retrieved.", 500);
  }
  if (!current) return errorResponse("STAFF_NOT_FOUND", "Staff profile was not found.", 404);

  const changes: Record<string, unknown> = {};
  if (input.display_name !== undefined) changes.display_name = (input.display_name as string).trim();
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  let roleId: string | undefined;
  let newRoleCode: string | undefined;
  if (typeof input.role_code === "string") {
    const { data: role, error: roleError } = await auth.staff.supabase
      .from("staff_roles")
      .select("role_id, role_code")
      .eq("role_code", input.role_code)
      .maybeSingle();
    if (roleError) {
      console.error("STAFF_ROLE_LOOKUP_FAILED");
      return errorResponse("STAFF_ROLE_LOOKUP_FAILED", "The requested role could not be checked.", 500);
    }
    if (!role) return errorResponse("STAFF_ROLE_INVALID", "The requested role does not exist.", 400);
    roleId = role.role_id;
    newRoleCode = role.role_code;
    changes.role_id = role.role_id;
  }

  const { data: updated, error } = await auth.staff.supabase
    .from("staff_profiles")
    .update(changes)
    .eq("staff_id", staffId)
    .select("staff_id, display_name, email, is_active, staff_roles(role_code, display_name)")
    .single();
  if (error) {
    console.error("STAFF_UPDATE_FAILED");
    return errorResponse("STAFF_UPDATE_FAILED", "The staff profile could not be updated.", 500);
  }

  if (roleId) {
    const authUserId = current.auth_user_id;
    const { data: userData, error: userError } = await auth.staff.supabase.auth.admin.getUserById(authUserId);
    if (userError) {
      console.error("STAFF_AUTH_ROLE_UPDATE_FAILED");
      return errorResponse("STAFF_UPDATE_PARTIAL", "The profile changed, but the authentication role could not be synchronized.", 500);
    }
    const appMetadata = { ...userData.user.app_metadata };
    if (newRoleCode === "administrator") appMetadata.agency_role = "admin";
    else delete appMetadata.agency_role;
    const { error: metadataError } = await auth.staff.supabase.auth.admin.updateUserById(authUserId, {
      app_metadata: appMetadata,
    });
    if (metadataError) {
      console.error("STAFF_AUTH_ROLE_UPDATE_FAILED");
      return errorResponse("STAFF_UPDATE_PARTIAL", "The profile changed, but the authentication role could not be synchronized.", 500);
    }
  }

  await writeAuditLog(auth.staff, {
    action: "staff.updated",
    entityType: "staff_profile",
    entityId: staffId,
    beforeData: { display_name: current.display_name, is_active: current.is_active },
    afterData: changes,
  });
  return okResponse(updated);
}
