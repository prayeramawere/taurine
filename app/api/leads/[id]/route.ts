import { randomUUID } from "node:crypto";
import { requireAgencyAdmin } from "@/lib/agency-admin";
import { validateLeadInput } from "@/lib/lead-validation";
import { errorResponse, okResponse, resolveRouteId } from "@/lib/supabase";

const allowedUpdateFields = new Set([
  "first_name",
  "last_name",
  "phone_number",
  "email",
  "lead_type",
  "budget_min",
  "budget_max",
  "preferred_location",
  "preferred_property_type",
  "bedrooms_required",
  "property_id",
  "lead_status",
  "notes",
  "consent_to_contact",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getLeadId(context: { params: Record<string, string> | Promise<Record<string, string>> }) {
  return resolveRouteId(context.params, "id");
}

export async function GET(
  request: Request,
  context: { params: Record<string, string> | Promise<Record<string, string>> },
) {
  const admin = await requireAgencyAdmin(request);
  if (!admin.authorized) return admin.response;
  const id = await getLeadId(context);
  if (!id || !uuidPattern.test(id)) return errorResponse("LEAD_ID_INVALID", "A valid lead id is required.", 400);

  try {
    const { data, error } = await admin.supabase.from("leads").select("*").eq("lead_id", id).maybeSingle();
    if (error) throw error;
    if (!data) return errorResponse("LEAD_NOT_FOUND", "Lead was not found.", 404);
    return okResponse(data);
  } catch {
    console.error("LEAD_FETCH_FAILED");
    return errorResponse("LEAD_FETCH_FAILED", "The lead could not be retrieved.", 500);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Record<string, string> | Promise<Record<string, string>> },
) {
  const admin = await requireAgencyAdmin(request);
  if (!admin.authorized) return admin.response;
  const id = await getLeadId(context);
  if (!id || !uuidPattern.test(id)) return errorResponse("LEAD_ID_INVALID", "A valid lead id is required.", 400);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("LEAD_VALIDATION_ERROR", "Request body must contain valid JSON.", 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return errorResponse("LEAD_VALIDATION_ERROR", "Request body must be a JSON object.", 400);
  }
  const input = payload as Record<string, unknown>;
  const unknownFields = Object.keys(input).filter((field) => !allowedUpdateFields.has(field));
  if (unknownFields.length) {
    return errorResponse("LEAD_VALIDATION_ERROR", `Unsupported lead fields: ${unknownFields.join(", ")}`, 400);
  }
  if (!Object.keys(input).length) {
    return errorResponse("LEAD_VALIDATION_ERROR", "At least one lead field is required.", 400);
  }
  const validated = validateLeadInput(input, { allowLeadStatus: true });
  if (!validated.success) {
    return errorResponse("LEAD_VALIDATION_ERROR", validated.error, 400);
  }

  const suppliedRequestId = request.headers.get("idempotency-key");
  if (suppliedRequestId && !uuidPattern.test(suppliedRequestId)) {
    return errorResponse("IDEMPOTENCY_KEY_INVALID", "Idempotency-Key must be a UUID.", 400);
  }

  try {
    const { data, error } = await admin.supabase
      .from("leads")
      .update({
        ...validated.data,
        request_id: suppliedRequestId ?? randomUUID(),
      })
      .eq("lead_id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return errorResponse("LEAD_NOT_FOUND", "Lead was not found.", 404);
    return okResponse(data);
  } catch {
    console.error("LEAD_UPDATE_FAILED");
    return errorResponse("LEAD_UPDATE_FAILED", "The lead could not be updated.", 500);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Record<string, string> | Promise<Record<string, string>> },
) {
  const admin = await requireAgencyAdmin(request, "leads:delete");
  if (!admin.authorized) return admin.response;
  const id = await getLeadId(context);
  if (!id || !uuidPattern.test(id)) return errorResponse("LEAD_ID_INVALID", "A valid lead id is required.", 400);

  try {
    const { data, error } = await admin.supabase
      .from("leads")
      .delete()
      .eq("lead_id", id)
      .select("lead_id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return errorResponse("LEAD_NOT_FOUND", "Lead was not found.", 404);
    return okResponse({ deleted: true, lead_id: id });
  } catch {
    console.error("LEAD_DELETE_FAILED");
    return errorResponse("LEAD_DELETE_FAILED", "The lead could not be deleted.", 500);
  }
}
