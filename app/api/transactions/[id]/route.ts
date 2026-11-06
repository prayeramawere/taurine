import { requireAgencyAdmin } from "@/lib/agency-admin";
import { errorResponse, handleSupabaseError, okResponse, readJsonBody, resolveRouteId } from "@/lib/supabase";

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

export async function GET(
  _request: Request,
  context: { params?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>> },
) {
  const admin = await requireAgencyAdmin(_request);
  if (!admin.authorized) return admin.response;
  try {
    const id = await resolveRouteId(context.params ?? {}, "id");

    if (!id) {
      return errorResponse("TRANSACTION_VALIDATION_ERROR", "Transaction id is required.", 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).select("*").eq("transaction_id", id).single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("TRANSACTION_NOT_FOUND", "Transaction was not found.", 404);
      }

      throw error;
    }

    return okResponse(data);
  } catch (error) {
    return handleSupabaseError(error, "TRANSACTION_FETCH_FAILED");
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
      return errorResponse("TRANSACTION_VALIDATION_ERROR", "Transaction id is required.", 400);
    }

    const payload = await readJsonBody(request);
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => ALLOWED_FIELDS.includes(key) && value !== undefined),
    ) as Record<string, unknown>;

    if (!Object.keys(cleaned).length) {
      return errorResponse("TRANSACTION_VALIDATION_ERROR", "At least one valid transaction field is required.", 400);
    }

    const supabase = admin.supabase;
    const { data, error } = await supabase.from(TABLE_NAME).update(cleaned).eq("transaction_id", id).select().single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("TRANSACTION_NOT_FOUND", "Transaction was not found.", 404);
      }

      throw error;
    }

    return okResponse(data);
  } catch (error) {
    return handleSupabaseError(error, "TRANSACTION_UPDATE_FAILED");
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
      return errorResponse("TRANSACTION_VALIDATION_ERROR", "Transaction id is required.", 400);
    }

    const supabase = admin.supabase;
    const { error } = await supabase.from(TABLE_NAME).delete().eq("transaction_id", id);

    if (error) {
      throw error;
    }

    return okResponse({ deleted: true, transaction_id: id });
  } catch (error) {
    return handleSupabaseError(error, "TRANSACTION_DELETE_FAILED");
  }
}
