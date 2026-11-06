import { requireAgencyAdmin } from "@/lib/agency-admin";
import { errorResponse, handleSupabaseError, okResponse, readJsonBody, resolveRouteId } from "@/lib/supabase";

const TABLE_NAME = "agents";
const ALLOWED_FIELDS = [
  "first_name",
  "last_name",
  "phone_number",
  "email",
  "license_number",
  "agency_id",
  "status",
];

export async function GET(
  _request: Request,
  context: { params?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>> },
) {
  const admin = await requireAgencyAdmin(_request);
  if (!admin.authorized) return admin.response;
  try {
    const id = await resolveRouteId(context.params ?? {}, "id");

    if (!id) {
      return errorResponse("AGENT_VALIDATION_ERROR", "Agent id is required.", 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).select("*").eq("agent_id", id).single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("AGENT_NOT_FOUND", "Agent was not found.", 404);
      }

      throw error;
    }

    return okResponse(data);
  } catch (error) {
    return handleSupabaseError(error, "AGENT_FETCH_FAILED");
  }
}

export async function PATCH(
  request: Request,
  context: { params?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>> },
) {
  const admin = await requireAgencyAdmin(request);
  if (!admin.authorized) return admin.response;
  try {
    const id = await resolveRouteId(context.params ?? {}, "id");

    if (!id) {
      return errorResponse("AGENT_VALIDATION_ERROR", "Agent id is required.", 400);
    }

    const payload = await readJsonBody(request);
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => ALLOWED_FIELDS.includes(key) && value !== undefined),
    ) as Record<string, unknown>;

    if (!Object.keys(cleaned).length) {
      return errorResponse("AGENT_VALIDATION_ERROR", "At least one valid agent field is required.", 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).update(cleaned).eq("agent_id", id).select().single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("AGENT_NOT_FOUND", "Agent was not found.", 404);
      }

      throw error;
    }

    return okResponse(data);
  } catch (error) {
    return handleSupabaseError(error, "AGENT_UPDATE_FAILED");
  }
}

export async function DELETE(
  request: Request,
  context: { params?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>> },
) {
  const admin = await requireAgencyAdmin(request);
  if (!admin.authorized) return admin.response;
  try {
    const id = await resolveRouteId(context.params ?? {}, "id");

    if (!id) {
      return errorResponse("AGENT_VALIDATION_ERROR", "Agent id is required.", 400);
    }

    const supabase = admin.supabase;
    const { error } = await supabase.from(TABLE_NAME).delete().eq("agent_id", id);

    if (error) {
      throw error;
    }

    return okResponse({ deleted: true, agent_id: id });
  } catch (error) {
    return handleSupabaseError(error, "AGENT_DELETE_FAILED");
  }
}
