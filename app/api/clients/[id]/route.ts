import { requireAgencyAdmin } from "@/lib/agency-admin";
import { errorResponse, handleSupabaseError, okResponse, readJsonBody, resolveRouteId } from "@/lib/supabase";

const TABLE_NAME = "clients";
const ALLOWED_FIELDS = [
  "first_name",
  "last_name",
  "phone_number",
  "email",
  "mailing_address",
  "linkedin_url",
  "facebook_url",
  "instagram_handle",
  "date_of_birth",
  "purchase_anniversary",
  "family_notes",
  "employer",
  "lead_source",
  "client_type",
  "notes",
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
      return errorResponse("CLIENT_VALIDATION_ERROR", "Client id is required.", 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).select("*").eq("client_id", id).single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("CLIENT_NOT_FOUND", "Client was not found.", 404);
      }

      throw error;
    }

    return okResponse(data);
  } catch (error) {
    return handleSupabaseError(error, "CLIENT_FETCH_FAILED");
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
      return errorResponse("CLIENT_VALIDATION_ERROR", "Client id is required.", 400);
    }

    const payload = await readJsonBody(request);
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => ALLOWED_FIELDS.includes(key) && value !== undefined),
    ) as Record<string, unknown>;

    if (!Object.keys(cleaned).length) {
      return errorResponse("CLIENT_VALIDATION_ERROR", "At least one valid client field is required.", 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).update(cleaned).eq("client_id", id).select().single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("CLIENT_NOT_FOUND", "Client was not found.", 404);
      }

      throw error;
    }

    return okResponse(data);
  } catch (error) {
    return handleSupabaseError(error, "CLIENT_UPDATE_FAILED");
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
      return errorResponse("CLIENT_VALIDATION_ERROR", "Client id is required.", 400);
    }

    const supabase = admin.supabase;
    const { error } = await supabase.from(TABLE_NAME).delete().eq("client_id", id);

    if (error) {
      throw error;
    }

    return okResponse({ deleted: true, client_id: id });
  } catch (error) {
    return handleSupabaseError(error, "CLIENT_DELETE_FAILED");
  }
}
