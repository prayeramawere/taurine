import { requireAgencyAdmin } from "@/lib/agency-admin";
import { errorResponse, getSupabaseServerClient, handleSupabaseError, okResponse, readJsonBody, resolveRouteId } from "@/lib/supabase";

const TABLE_NAME = "properties";
const ALLOWED_FIELDS = [
  "property_type",
  "square_footage",
  "lot_size",
  "bedrooms",
  "bathrooms",
  "year_built",
  "location",
  "zoning_classification",
  "listing_status",
  "days_on_market",
  "listing_price",
  "virtual_tour_url",
  "portfolio_id",
  "description",
  "features",
];

export async function GET(
  _request: Request,
  context: { params?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>> },
) {
  try {
    const id = await resolveRouteId(context.params ?? {}, "id");

    if (!id) {
      return errorResponse("PROPERTY_VALIDATION_ERROR", "Property id is required.", 400);
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from(TABLE_NAME).select("*").eq("property_id", id).single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("PROPERTY_NOT_FOUND", "Property was not found.", 404);
      }

      throw error;
    }

    return okResponse(data);
  } catch (error) {
    return handleSupabaseError(error, "PROPERTY_FETCH_FAILED");
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
      return errorResponse("PROPERTY_VALIDATION_ERROR", "Property id is required.", 400);
    }

    const payload = await readJsonBody(request);
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => ALLOWED_FIELDS.includes(key) && value !== undefined),
    ) as Record<string, unknown>;

    if (!Object.keys(cleaned).length) {
      return errorResponse("PROPERTY_VALIDATION_ERROR", "At least one valid property field is required.", 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).update(cleaned).eq("property_id", id).select().single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("PROPERTY_NOT_FOUND", "Property was not found.", 404);
      }

      throw error;
    }

    return okResponse(data);
  } catch (error) {
    return handleSupabaseError(error, "PROPERTY_UPDATE_FAILED");
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
      return errorResponse("PROPERTY_VALIDATION_ERROR", "Property id is required.", 400);
    }

    const supabase = admin.supabase;
    const { error } = await supabase.from(TABLE_NAME).delete().eq("property_id", id);

    if (error) {
      throw error;
    }

    return okResponse({ deleted: true, property_id: id });
  } catch (error) {
    return handleSupabaseError(error, "PROPERTY_DELETE_FAILED");
  }
}
