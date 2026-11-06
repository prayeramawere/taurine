import { requireAgencyAdmin } from "@/lib/agency-admin";
import { errorResponse, handleSupabaseError, okResponse, readJsonBody, resolveRouteId } from "@/lib/supabase";

const TABLE_NAME = "financing";
const ALLOWED_FIELDS = [
  "property_id",
  "loan_amount",
  "loan_type",
  "interest_rate",
  "loan_term",
  "mortgage_status",
  "lien_amount",
  "lien_status",
  "title_history",
  "plat_map_url",
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
      return errorResponse("FINANCING_VALIDATION_ERROR", "Financing id is required.", 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).select("*").eq("financing_id", id).single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("FINANCING_NOT_FOUND", "Financing entry was not found.", 404);
      }

      throw error;
    }

    return okResponse(data);
  } catch (error) {
    return handleSupabaseError(error, "FINANCING_FETCH_FAILED");
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
      return errorResponse("FINANCING_VALIDATION_ERROR", "Financing id is required.", 400);
    }

    const payload = await readJsonBody(request);
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => ALLOWED_FIELDS.includes(key) && value !== undefined),
    ) as Record<string, unknown>;

    if (!Object.keys(cleaned).length) {
      return errorResponse("FINANCING_VALIDATION_ERROR", "At least one valid financing field is required.", 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).update(cleaned).eq("financing_id", id).select().single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("FINANCING_NOT_FOUND", "Financing entry was not found.", 404);
      }

      throw error;
    }

    return okResponse(data);
  } catch (error) {
    return handleSupabaseError(error, "FINANCING_UPDATE_FAILED");
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
      return errorResponse("FINANCING_VALIDATION_ERROR", "Financing id is required.", 400);
    }

    const supabase = admin.supabase;
    const { error } = await supabase.from(TABLE_NAME).delete().eq("financing_id", id);

    if (error) {
      throw error;
    }

    return okResponse({ deleted: true, financing_id: id });
  } catch (error) {
    return handleSupabaseError(error, "FINANCING_DELETE_FAILED");
  }
}
