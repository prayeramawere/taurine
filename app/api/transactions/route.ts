import { requireAgencyAdmin } from "@/lib/agency-admin";
import { errorResponse, handleSupabaseError, okResponse, readJsonBody } from "@/lib/supabase";

const TABLE_NAME = "transactions";
const ALLOWED_FIELDS = [
  "property_id",
  "transaction_type",
  "transaction_status",
  "sale_price",
  "transaction_date",
  "deed_type",
  "document_number",
  "buyer_id",
  "seller_id",
  "agent_id",
];

export async function GET(request: Request) {
  const admin = await requireAgencyAdmin(request);
  if (!admin.authorized) return admin.response;
  try {
    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).select("*").order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return okResponse(data ?? []);
  } catch (error) {
    return handleSupabaseError(error, "TRANSACTION_FETCH_FAILED");
  }
}

export async function POST(request: Request) {
  const admin = await requireAgencyAdmin(request);
  if (!admin.authorized) return admin.response;
  try {
    const payload = await readJsonBody(request);
    if (!Object.keys(payload).length) {
      return errorResponse("TRANSACTION_VALIDATION_ERROR", "Request body is required.", 400);
    }

    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => ALLOWED_FIELDS.includes(key) && value !== undefined),
    ) as Record<string, unknown>;

    const requiredFields = ["property_id", "transaction_type", "buyer_id", "seller_id", "agent_id"];
    const missingFields = requiredFields.filter(
      (field) => !(field in cleaned) || cleaned[field] === null || cleaned[field] === "",
    );

    if (missingFields.length) {
      return errorResponse("TRANSACTION_VALIDATION_ERROR", `Missing required fields: ${missingFields.join(", ")}`, 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).insert([cleaned]).select().single();

    if (error) {
      throw error;
    }

    return okResponse(data, 201);
  } catch (error) {
    return handleSupabaseError(error, "TRANSACTION_CREATE_FAILED");
  }
}
