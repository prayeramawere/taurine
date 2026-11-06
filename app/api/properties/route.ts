import { requireAgencyAdmin } from "@/lib/agency-admin";
import { errorResponse, getSupabaseServerClient, handleSupabaseError, okResponse, readJsonBody } from "@/lib/supabase";

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

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from(TABLE_NAME).select("*").order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return okResponse(data ?? []);
  } catch (error) {
    return handleSupabaseError(error, "PROPERTY_FETCH_FAILED");
  }
}

export async function POST(request: Request) {
  const admin = await requireAgencyAdmin(request);
  if (!admin.authorized) return admin.response;
  try {
    const payload = await readJsonBody(request);

    if (!Object.keys(payload).length) {
      return errorResponse("PROPERTY_VALIDATION_ERROR", "Request body is required.", 400);
    }

    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => ALLOWED_FIELDS.includes(key) && value !== undefined),
    ) as Record<string, unknown>;

    const requiredFields = ["property_type", "square_footage", "listing_status", "listing_price"];
    const missingFields = requiredFields.filter(
      (field) => !(field in cleaned) || cleaned[field] === null || cleaned[field] === "",
    );

    if (missingFields.length) {
      return errorResponse(
        "PROPERTY_VALIDATION_ERROR",
        `Missing required fields: ${missingFields.join(", ")}`,
        400,
      );
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).insert([cleaned]).select().single();

    if (error) {
      throw error;
    }

    return okResponse(data, 201);
  } catch (error) {
    return handleSupabaseError(error, "PROPERTY_CREATE_FAILED");
  }
}
