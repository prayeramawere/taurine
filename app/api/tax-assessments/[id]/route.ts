import { requireAgencyAdmin } from "@/lib/agency-admin";
import { errorResponse, handleSupabaseError, okResponse, readJsonBody, resolveRouteId } from "@/lib/supabase";

const TABLE_NAME = "tax_assessments";
const ALLOWED_FIELDS = [
  "property_id",
  "parcel_id",
  "assessed_value",
  "tax_amount",
  "tax_year",
  "assessment_date",
  "previous_assessed_value",
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
      return errorResponse("TAX_ASSESSMENT_VALIDATION_ERROR", "Tax assessment id is required.", 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).select("*").eq("assessment_id", id).single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("TAX_ASSESSMENT_NOT_FOUND", "Tax assessment was not found.", 404);
      }

      throw error;
    }

    return okResponse(data);
  } catch (error) {
    return handleSupabaseError(error, "TAX_ASSESSMENT_FETCH_FAILED");
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
      return errorResponse("TAX_ASSESSMENT_VALIDATION_ERROR", "Tax assessment id is required.", 400);
    }

    const payload = await readJsonBody(request);
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => ALLOWED_FIELDS.includes(key) && value !== undefined),
    ) as Record<string, unknown>;

    if (!Object.keys(cleaned).length) {
      return errorResponse("TAX_ASSESSMENT_VALIDATION_ERROR", "At least one valid tax assessment field is required.", 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).update(cleaned).eq("assessment_id", id).select().single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("TAX_ASSESSMENT_NOT_FOUND", "Tax assessment was not found.", 404);
      }

      throw error;
    }

    return okResponse(data);
  } catch (error) {
    return handleSupabaseError(error, "TAX_ASSESSMENT_UPDATE_FAILED");
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
      return errorResponse("TAX_ASSESSMENT_VALIDATION_ERROR", "Tax assessment id is required.", 400);
    }

    const supabase = admin.supabase;
    const { error } = await supabase.from(TABLE_NAME).delete().eq("assessment_id", id);

    if (error) {
      throw error;
    }

    return okResponse({ deleted: true, assessment_id: id });
  } catch (error) {
    return handleSupabaseError(error, "TAX_ASSESSMENT_DELETE_FAILED");
  }
}
