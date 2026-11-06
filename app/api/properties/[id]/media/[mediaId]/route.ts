import { requireAgencyAdmin } from "@/lib/agency-admin";
import { errorResponse, handleSupabaseError, okResponse, readJsonBody, resolveRouteId } from "@/lib/supabase";

const TABLE_NAME = "property_media";
const ALLOWED_FIELDS = ["media_type", "media_url", "display_order", "is_primary"];

export async function PATCH(
  request: Request,
  context: { params?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>> },
) {
  const admin = await requireAgencyAdmin(request);
  if (!admin.authorized) return admin.response;
  try {
    const propertyId = await resolveRouteId(context.params ?? {}, "id");
    const mediaId = await resolveRouteId(context.params ?? {}, "mediaId");

    if (!propertyId || !mediaId) {
      return errorResponse("PROPERTY_MEDIA_VALIDATION_ERROR", "Property id and media id are required.", 400);
    }

    const payload = await readJsonBody(request);
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => ALLOWED_FIELDS.includes(key) && value !== undefined),
    ) as Record<string, unknown>;

    if (!Object.keys(cleaned).length) {
      return errorResponse("PROPERTY_MEDIA_VALIDATION_ERROR", "At least one valid media field is required.", 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(cleaned)
      .eq("property_id", propertyId)
      .eq("media_id", mediaId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("PROPERTY_MEDIA_NOT_FOUND", "Media item was not found.", 404);
      }

      throw error;
    }

    return okResponse(data);
  } catch (error) {
    return handleSupabaseError(error, "PROPERTY_MEDIA_UPDATE_FAILED");
  }
}

export async function DELETE(
  request: Request,
  context: { params?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>> },
) {
  const admin = await requireAgencyAdmin(request);
  if (!admin.authorized) return admin.response;
  try {
    const propertyId = await resolveRouteId(context.params ?? {}, "id");
    const mediaId = await resolveRouteId(context.params ?? {}, "mediaId");

    if (!propertyId || !mediaId) {
      return errorResponse("PROPERTY_MEDIA_VALIDATION_ERROR", "Property id and media id are required.", 400);
    }

    const supabase = admin.supabase;
    const { error } = await supabase.from(TABLE_NAME).delete().eq("property_id", propertyId).eq("media_id", mediaId);

    if (error) {
      throw error;
    }

    return okResponse({ deleted: true, property_id: propertyId, media_id: mediaId });
  } catch (error) {
    return handleSupabaseError(error, "PROPERTY_MEDIA_DELETE_FAILED");
  }
}
