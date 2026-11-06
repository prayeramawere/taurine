import { requireAgencyAdmin } from "@/lib/agency-admin";
import { errorResponse, getSupabaseServerClient, handleSupabaseError, okResponse, readJsonBody, resolveRouteId } from "@/lib/supabase";

const TABLE_NAME = "property_media";
const ALLOWED_FIELDS = ["property_id", "media_type", "media_url", "display_order", "is_primary"];

export async function GET(
  _request: Request,
  context: { params?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>> },
) {
  try {
    const propertyId = await resolveRouteId(context.params ?? {}, "id");

    if (!propertyId) {
      return errorResponse("PROPERTY_MEDIA_VALIDATION_ERROR", "Property id is required.", 400);
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from(TABLE_NAME).select("*").eq("property_id", propertyId).order("display_order", { ascending: true });

    if (error) {
      throw error;
    }

    return okResponse(data ?? []);
  } catch (error) {
    return handleSupabaseError(error, "PROPERTY_MEDIA_FETCH_FAILED");
  }
}

export async function POST(
  request: Request,
  context: { params?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>> },
) {
  const admin = await requireAgencyAdmin(request);
  if (!admin.authorized) return admin.response;
  try {
    const propertyId = await resolveRouteId(context.params ?? {}, "id");

    if (!propertyId) {
      return errorResponse("PROPERTY_MEDIA_VALIDATION_ERROR", "Property id is required.", 400);
    }

    const payload = await readJsonBody(request);
    if (!Object.keys(payload).length) {
      return errorResponse("PROPERTY_MEDIA_VALIDATION_ERROR", "Request body is required.", 400);
    }

    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => ALLOWED_FIELDS.includes(key) && value !== undefined),
    ) as Record<string, unknown>;
    cleaned.property_id = propertyId;

    const requiredFields = ["media_type", "media_url"];
    const missingFields = requiredFields.filter(
      (field) => !(field in cleaned) || cleaned[field] === null || cleaned[field] === "",
    );

    if (missingFields.length) {
      return errorResponse("PROPERTY_MEDIA_VALIDATION_ERROR", `Missing required fields: ${missingFields.join(", ")}`, 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).insert([cleaned]).select().single();

    if (error) {
      throw error;
    }

    return okResponse(data, 201);
  } catch (error) {
    return handleSupabaseError(error, "PROPERTY_MEDIA_CREATE_FAILED");
  }
}
